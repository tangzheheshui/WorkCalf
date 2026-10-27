#!/usr/bin/env bash
# 一条命令发版：改版本号 → 提交打 tag → push → 等 CI 出包 → 下载 → 同步官网 → 线上自检。
# 产物四个：macOS dmg ×2 + Windows exe ×2，全由 GitHub Actions 出（build-macos /
# build-windows 两个 workflow），本脚本等它们都挂上 Release 后下载并同步官网。
#
# 用法：bash tools/release.sh 1.2.0
# 前提：在 main 上、工作区干净；官网页面改动在跑本脚本前提交，随最后一步一起上线。
#
# 可重跑：中途失败直接再跑同一条命令即可。
#   - 三处版本号已是目标值 → 跳过提交
#   - tag 已存在且指向当前提交 → 跳过打 tag
#   - push 失败 → 自动重试 3 次
#   - CI 失败 → 提前退出并给 run 链接（修完代码按提示清 tag 后重跑）
#   - 包已下载/官网已同步 → 重跑会覆盖，不会出问题
set -euo pipefail
cd "$(dirname "$0")/.."

VER="${1:?用法: bash tools/release.sh <版本号，如 1.2.0>}"
case "$VER" in
  "" | .* | *. | *[!0-9.]*)
    echo "[错误] 版本号格式不对：$VER（要像 1.2.0）" >&2
    exit 1
    ;;
esac
TAG="v$VER"
REPO="tangzheheshui/WorkCalf"
SERVER="${SERVER:-ubuntu@193.112.26.217}"
SITE_URL="${SITE_URL:-https://workcalf.app.tangzheheshui.cn}"

# 轮询产物/CI 状态用 Python；macOS 上是 python3，Windows Git Bash 上通常只有 python。
# 注意：Windows 的 python3 可能是应用商店的占位程序——能 command -v 到，但一执行就
# 以 49 退出并且没有任何输出，所以必须实际跑一下 import 才算数，否则轮询永远返回 0。
PY=""
for c in python3 python; do
  p="$(command -v "$c" 2>/dev/null || true)"
  [ -n "$p" ] || continue
  if "$p" -c 'import sys' >/dev/null 2>&1; then PY="$p"; break; fi
done
[ -n "$PY" ] || { echo "[错误] 找不到可用的 python3/python，无法轮询 CI 状态" >&2; exit 1; }

# ---- 0. 预检 ---------------------------------------------------------------
# site/download/ 的安装包是 gitignore 的；site/version.json 是同步时生成的，
# 都算"干净"，否则发完一次就再也跑不了第二次
DIRTY="$(git status --porcelain | grep -v ' site/version.json$' || true)"
[ -z "$DIRTY" ] \
  || { echo "[错误] 工作区不干净，先提交：" >&2; printf '%s\n' "$DIRTY" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] \
  || { echo "[错误] 请在 main 上发版" >&2; exit 1; }
# 先确认官网服务器连得上，避免白等一次 CI 才发现同步不了
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SERVER" true \
  || { echo "[错误] SSH 连不上 $SERVER（本机免密没配好？）" >&2; exit 1; }

# BSD/GNU sed 的 -i 语法不兼容（macOS vs Windows Git Bash），统一写临时文件再替换
rewrite() {  # $1=文件 $2=sed 表达式
  sed "$2" "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}
tauri_ver() { grep -m1 '"version"' src-tauri/tauri.conf.json | sed -E 's/.*"version": *"([^"]+)".*/\1/'; }
cargo_ver() { sed -n '/^\[package\]/,/^\[/s/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1; }
lock_ver()  { sed -n '/^name = "workcalf"$/{n;s/^version = "\(.*\)"/\1/p;}' src-tauri/Cargo.lock | head -1; }

# ---- 1. 版本号三处同步 -----------------------------------------------------
if [ "$(tauri_ver)" = "$VER" ] && [ "$(cargo_ver)" = "$VER" ] && [ "$(lock_ver)" = "$VER" ]; then
  echo "[OK] 版本号已是 $VER，跳过改动"
else
  echo "[..] 版本号 → $VER"
  rewrite src-tauri/tauri.conf.json "s/\"version\": *\"[^\"]*\"/\"version\": \"$VER\"/"
  rewrite src-tauri/Cargo.toml "/^\[package\]/,/^\[/s/^version = .*/version = \"$VER\"/"
  rewrite src-tauri/Cargo.lock "/^name = \"workcalf\"\$/{n;s/^version = .*/version = \"$VER\"/;}"
  [ "$(tauri_ver)" = "$VER" ] && [ "$(cargo_ver)" = "$VER" ] && [ "$(lock_ver)" = "$VER" ] \
    || { echo "[错误] 三处版本号没写成功，检查 src-tauri 下文件结构是否被改过" >&2; exit 1; }
  git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  git commit -m "chore: 发版 $VER"
fi

# ---- 2. tag + push ---------------------------------------------------------
HEAD_SHA="$(git rev-parse HEAD)"
LOCAL_TAG=0
LOCAL_TAG_SHA=""
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  LOCAL_TAG=1
  LOCAL_TAG_SHA="$(git rev-list -n1 "$TAG")"
  if [ "$LOCAL_TAG_SHA" != "$HEAD_SHA" ]; then
    # tag 打完又提交了官网改动（发版中途改页面、或上次同步留下的 version.json 提交）
    # 属正常情况：产物只跟 tag 指向的源码有关，这些路径的改动不影响，直接复用。
    # 但 tag 之后若动过会进打包产物的文件，源码和产物就对不上了，必须清 tag 重发。
    OFF_BUILD="$(git diff --name-only "$LOCAL_TAG_SHA" "$HEAD_SHA" \
      | grep -Ev '^(site/|tools/|\.claude/|docs/|.*\.md$)' || true)"
    if [ -n "$OFF_BUILD" ]; then
      echo "[错误] tag $TAG 与当前提交之间还有会进打包产物的改动：" >&2
      printf '%s\n' "$OFF_BUILD" >&2
      echo "        先清掉旧 tag 再重跑：git tag -d $TAG && git push origin :refs/tags/$TAG" >&2
      exit 1
    fi
    echo "[OK] tag $TAG 已存在，之后的提交只动了官网/工具/文档，复用这套产物"
  fi
fi
REMOTE_TAG_SHA="$(git ls-remote --tags origin "refs/tags/$TAG" | cut -f1)"
if [ -n "$REMOTE_TAG_SHA" ] && [ "$REMOTE_TAG_SHA" != "$LOCAL_TAG_SHA" ]; then
  echo "[错误] 远端 tag $TAG 指向的提交和本地不一致（$(printf '%s' "$REMOTE_TAG_SHA" | cut -c1-7) ≠ $(printf '%s' "$LOCAL_TAG_SHA" | cut -c1-7)）。" >&2
  echo "        先清掉远端旧 tag 再重跑：git tag -d $TAG; git push origin :refs/tags/$TAG" >&2
  exit 1
fi
if [ "$LOCAL_TAG" = 0 ] && [ -z "$REMOTE_TAG_SHA" ]; then
  git tag "$TAG"
  LOCAL_TAG=1
  echo "[OK] 已打 tag $TAG"
elif [ -n "$REMOTE_TAG_SHA" ]; then
  echo "[OK] 远端已有 tag $TAG，复用"
else
  echo "[OK] 本地已有 tag $TAG，补推远端"
fi

PUSH_REFS=(main)
if [ "$LOCAL_TAG" = 1 ]; then
  PUSH_REFS+=("refs/tags/$TAG:refs/tags/$TAG")
fi

START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[..] push 到 GitHub…"
PUSHED=0
for i in 1 2 3; do
  if git push origin "${PUSH_REFS[@]}"; then
    PUSHED=1
    break
  fi
  if [ "$i" -lt 3 ]; then
    echo "[..] push 失败，5 秒后重试（$i/3）"
    sleep 5
  fi
done
if [ "$PUSHED" != 1 ]; then
  echo "[错误] push 三次都失败。提交和 tag 都还在本地，网络恢复后重跑本脚本即可。" >&2
  echo "        如果提示 non-fast-forward，先 git pull --rebase 再重跑。" >&2
  exit 1
fi
echo "[OK] $TAG 已推送，CI 构建中"

# ---- 3. 等 CI 出包 ---------------------------------------------------------
# 不碰 GitHub API（未认证限流 60 次/小时，多试几轮就打满）：
#   - 产物是否就绪：直接 HEAD 四个下载地址（本来就要下载它们）
#   - CI 是否失败：读两个 workflow 的 badge（5 分钟缓存，够用）
# macOS 一般 5-10 分钟；Windows 没有 cargo 缓存时 15-20 分钟。
# 远端本来没有 tag 时，这轮 push 会触发新构建：只认本轮上传的产物——旧 Release 上
# 可能还挂着上一个提交的包，不能拿来用（用 Last-Modified 判断新鲜度）。
REQUIRE_FRESH=0
if [ -z "$REMOTE_TAG_SHA" ]; then
  REQUIRE_FRESH=1
fi
DEADLINE=$((SECONDS + 2400))
I=0
FAIL_STREAK=0

# 这里不吞 stderr：单个产物拉 HEAD 失败会在 Python 里被捕获；能冒出来的报错都是
# 解释器/环境级别的问题，必须让它打出来，否则又会静默地一直显示 0/4。
count_assets() {
  REPO="$REPO" TAG="$TAG" START_UTC="$START_UTC" REQUIRE_FRESH="$REQUIRE_FRESH" "$PY" -c '
import os, sys, urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

sys.stdout.reconfigure(newline="\n")
repo = os.environ["REPO"]
tag = os.environ["TAG"]
fresh = os.environ.get("REQUIRE_FRESH") == "1"
start = datetime.strptime(os.environ["START_UTC"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
names = ["WorkCalf.exe", "WorkCalf-Setup.exe", "WorkCalf-mac-arm64.dmg", "WorkCalf-mac-x64.dmg"]

class Head(urllib.request.Request):
    def get_method(self):
        return "HEAD"

n = 0
for name in names:
    url = "https://github.com/%s/releases/download/%s/%s" % (repo, tag, name)
    try:
        with urllib.request.urlopen(Head(url), timeout=15) as r:
            if r.status != 200:
                continue
            last_modified = r.headers.get("Last-Modified")
    except Exception:
        continue
    if fresh:
        if not last_modified:
            continue
        try:
            uploaded = parsedate_to_datetime(last_modified)
        except Exception:
            continue
        if uploaded < start:
            continue
    n += 1
print(n)
' || echo 0
}

badge_states() {
  REPO="$REPO" TAG="$TAG" "$PY" -c '
import os, re, sys, urllib.request

sys.stdout.reconfigure(newline="\n")
repo = os.environ["REPO"]
tag = os.environ["TAG"]
for wf in ("build-macos", "build-windows"):
    url = "https://github.com/%s/actions/workflows/%s.yml/badge.svg?branch=%s" % (repo, wf, tag)
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            svg = r.read().decode("utf-8", "replace")
    except Exception:
        print(wf + "=unknown")
        continue
    m = re.search(r"<title>([^<]*)</title>", svg)
    title = m.group(1) if m else ""
    state = title.split(" - ", 1)[1] if " - " in title else "unknown"
    print(wf + "=" + state)
' 2>/dev/null || true
}

echo "[..] 等 CI 出包（macOS 5-10 分钟，Windows 首跑 15-20 分钟）…"
while :; do
  sleep 75
  I=$((I + 1))

  N="$(count_assets)"
  echo "    Release 产物 $N/4"
  if [ "$N" = "4" ]; then
    break
  fi

  if [ "$SECONDS" -gt "$DEADLINE" ]; then
    echo "[错误] 40 分钟未出齐，去 https://github.com/$REPO/actions 看哪个 workflow 挂了" >&2
    exit 1
  fi

  # 每 4 次（约 5 分钟）看一次 badge；连续两轮 failing 才判死，防止旧状态误报
  if [ $((I % 4)) -eq 0 ]; then
    STATES="$(badge_states)"
    if printf '%s\n' "$STATES" | grep -q '=failing$'; then
      FAIL_STREAK=$((FAIL_STREAK + 1))
      echo "    CI 状态：$(printf '%s' "$STATES" | tr '\n' ' ')"
      if [ "$FAIL_STREAK" -ge 2 ]; then
        echo "[错误] CI 连续两轮失败：$(printf '%s' "$STATES" | tr '\n' ' ')" >&2
        echo "        看日志：https://github.com/$REPO/actions" >&2
        echo "        修好代码后：git tag -d $TAG && git push origin :refs/tags/$TAG，再重跑本脚本" >&2
        exit 1
      fi
    else
      FAIL_STREAK=0
    fi
  fi
done

# ---- 4. 下载四个包 ---------------------------------------------------------
echo "[..] 下载四个安装包…"
mkdir -p site/download
for f in WorkCalf.exe WorkCalf-Setup.exe WorkCalf-mac-arm64.dmg WorkCalf-mac-x64.dmg; do
  curl -fL --retry 3 --retry-delay 2 -o "site/download/$f" \
    "https://github.com/$REPO/releases/download/$TAG/$f" \
    || { echo "[错误] 下载 $f 失败" >&2; exit 1; }
  SIZE="$(wc -c < "site/download/$f" | tr -d ' ')"
  [ "$SIZE" -gt 1000000 ] \
    || { echo "[错误] $f 只有 ${SIZE} 字节，不像安装包（下载到的是错误页？）" >&2; exit 1; }
  echo "    [OK] $f（$((SIZE / 1024 / 1024)) MB）"
done

# ---- 5. 同步官网（脚本内部会做线上自检）-------------------------------------
SERVER="$SERVER" SITE_URL="$SITE_URL" bash tools/sync-site.sh

# ---- 6. 把同步时生成的 version.json 提交掉，别把脏工作区留给下次发版 --------
if ! git diff --quiet -- site/version.json || ! git diff --cached --quiet -- site/version.json; then
  git add site/version.json
  git commit -m "chore: version.json 同步至 $VER"
  git push origin main \
    || { echo "[警告] version.json 提交没推上去，下次发版前记得 git push" >&2; }
fi

echo
echo "[完成] v$VER 已上线：$SITE_URL/"
