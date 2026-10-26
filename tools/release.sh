#!/usr/bin/env bash
# 一条命令发版：改版本号 → 提交打 tag → push → 等 CI 出包 → 下载 → 同步官网。
# 产物四个：macOS dmg ×2 + Windows exe ×2，全由 GitHub Actions 出（build-macos /
# build-windows 两个 workflow），本脚本等它们都挂上 Release 后下载并同步官网。
#
# 用法：bash tools/release.sh 1.2.0
# 前提：在 main 上、工作区干净；官网页面内容改动在跑本脚本前提交，随最后一步一起上线。
# 偶发 GitHub push 报 Internal Server Error：等几秒重跑即可。
set -euo pipefail
cd "$(dirname "$0")/.."

VER="${1:?用法: bash tools/release.sh <版本号，如 1.2.0>}"
TAG="v$VER"
REPO="tangzheheshui/WorkCalf"
SERVER="${SERVER:-ubuntu@193.112.26.217}"

git diff --quiet || { echo "[错误] 工作区不干净，先提交" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "[错误] 请在 main 上发版" >&2; exit 1; }

# 1. 版本号三处同步（tauri.conf.json / Cargo.toml / Cargo.lock）
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VER\"/" src-tauri/tauri.conf.json
sed -i '' "3s/^version = .*/version = \"$VER\"/" src-tauri/Cargo.toml
sed -i '' '/^name = "workcalf"$/{n;s/^version = .*/version = "'"$VER"'"/;}' src-tauri/Cargo.lock

# 2. 提交 + tag + push（tag 同时触发 macOS / Windows 两个 workflow）
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: 发版 $VER"
git tag "$TAG"
git push origin main "$TAG"
echo "[OK] $TAG 已推送，CI 构建中"

# 3. 轮询 Release，等四个产物挂齐（产物齐 = 两个 workflow 都成功，比盯 run 状态稳）
#    macOS 一般 5-10 分钟；Windows 没有 cargo 缓存时 15-20 分钟
echo "[..] 等 CI 出包（macOS 5-10 分钟，Windows 首跑更久）…"
RELEASE_URL="https://api.github.com/repos/$REPO/releases/tags/$TAG"
DEADLINE=$((SECONDS + 2400))
while :; do
  sleep 60
  N=$(curl -s "$RELEASE_URL" | python3 -c "
import json,sys
try:
    assets = json.load(sys.stdin).get('assets', [])
except Exception:
    assets = []
names = {a['name'] for a in assets}
print(len(names & {'WorkCalf.exe', 'WorkCalf-Setup.exe',
                   'WorkCalf-mac-arm64.dmg', 'WorkCalf-mac-x64.dmg'}))")
  echo "    Release 产物 $N/4"
  [ "$N" = "4" ] && break
  [ "$SECONDS" -gt "$DEADLINE" ] && { echo "[错误] 40 分钟未出齐，去 https://github.com/$REPO/actions 看哪个 workflow 挂了" >&2; exit 1; }
done

# 4. 四个包下到固定文件名（不进 git，只随站点上传）
mkdir -p site/download
curl -sL -o site/download/WorkCalf-mac-arm64.dmg "https://github.com/$REPO/releases/download/$TAG/WorkCalf-mac-arm64.dmg"
curl -sL -o site/download/WorkCalf-mac-x64.dmg  "https://github.com/$REPO/releases/download/$TAG/WorkCalf-mac-x64.dmg"
curl -sL -o site/download/WorkCalf.exe          "https://github.com/$REPO/releases/download/$TAG/WorkCalf.exe"
curl -sL -o site/download/WorkCalf-Setup.exe    "https://github.com/$REPO/releases/download/$TAG/WorkCalf-Setup.exe"
echo "[OK] 四个安装包已下载"

# 5. 同步官网（rsync 到 VPS；SERVER 可用环境变量覆盖）
SERVER="$SERVER" bash tools/sync-site.sh
