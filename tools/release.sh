#!/usr/bin/env bash
# 一条命令发版：改版本号 → 提交打 tag → push → 等 CI 出 dmg → 下载 → 同步官网。
#
# 用法：bash tools/release.sh 1.2.0
#
# 前提：在 main 上、工作区干净；本脚本只管 macOS 包（GitHub Actions 出），
# Windows exe 仍要在 Windows 机器上 `tauri build --bundles nsis` 打包，
# 拷进 site/download/ 后重跑 tools/sync-site.sh 即可上线。
# 若 Windows 包还没跟上就发版，同步完记得把线上 version.json 的 version
# 临时改回旧版号，否则 Windows 客户端会提示更新却下到旧 exe。
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

# 2. 提交 + tag + push（tag 触发 macOS CI）
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: 发版 $VER"
git tag "$TAG"
git push origin main "$TAG"
echo "[OK] $TAG 已推送，CI 构建中"

# 3. 轮询等 CI（每次发版只有一个 run：workflow 只在 v* tag 上触发）
echo "[..] 等 macOS 双架构 dmg（一般 5-10 分钟）…"
while :; do
  sleep 30
  STATUS=$(curl -s "https://api.github.com/repos/$REPO/actions/runs?per_page=1" \
    | python3 -c "import json,sys;r=json.load(sys.stdin)['workflow_runs'][0];print(r['status'],r.get('conclusion') or '-')")
  echo "    $STATUS"
  case "$STATUS" in
    *success) break ;;
    *failure) echo "[错误] CI 失败，去 https://github.com/$REPO/actions 看日志" >&2; exit 1 ;;
  esac
done

# 4. Release 上的两个 dmg 下到固定文件名（不进 git，只随站点上传）
mkdir -p site/download
curl -sL -o site/download/WorkCalf-mac-arm64.dmg "https://github.com/$REPO/releases/download/$TAG/WorkCalf-mac-arm64.dmg"
curl -sL -o site/download/WorkCalf-mac-x64.dmg  "https://github.com/$REPO/releases/download/$TAG/WorkCalf-mac-x64.dmg"
echo "[OK] dmg 已下载"

# 5. 同步官网（rsync 到 VPS；SERVER 可用环境变量覆盖）
SERVER="$SERVER" bash tools/sync-site.sh
