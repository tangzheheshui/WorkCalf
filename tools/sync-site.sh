#!/usr/bin/env bash
# 生成 version.json，并把下载页同步到静态托管。
#
# 用法：
#   SERVER=user@vps bash tools/sync-site.sh          # 用 site/download/ 里已有的安装包
#   SERVER=user@vps bash tools/sync-site.sh local    # 先从本机 Tauri 构建产物拷安装包
#
# 可选：
#   REMOTE_DIR=/var/www/workcalf   （默认）
#
# 版本号取自 src-tauri/tauri.conf.json，与安装包、应用内版本号保持同一来源。
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER="${SERVER:?需要 SERVER=user@vps}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/workcalf}"
SRC="${1:-}"

mkdir -p site/download

if [ "$SRC" = "local" ]; then
  EXE="src-tauri/target/release/workcalf.exe"
  if [ ! -f "$EXE" ]; then
    echo "[错误] 没找到 $EXE，先运行 tauri build --bundles nsis" >&2
    exit 1
  fi
  # 固定文件名，version.json 里的下载地址就不用每次发版都改
  cp "$EXE" site/download/WorkCalf.exe
  echo "[OK] 便携版 → site/download/WorkCalf.exe"

  SETUP="$(ls -1 src-tauri/target/release/bundle/nsis/*-setup.exe 2>/dev/null | head -1 || true)"
  if [ -n "$SETUP" ]; then
    cp "$SETUP" site/download/WorkCalf-Setup.exe
    echo "[OK] 安装版 → site/download/WorkCalf-Setup.exe"
  else
    echo "[警告] 没找到 NSIS 安装包，安装版按钮会 404" >&2
  fi
fi

VERSION="$(grep -m1 '"version"' src-tauri/tauri.conf.json \
  | sed -E 's/.*"version": *"([^"]+)".*/\1/')"

cat > site/version.json <<JSON
{
  "version": "$VERSION",
  "updated": "$(date +%Y-%m-%d)",
  "url": "download/WorkCalf.exe",
  "urls": {
    "win_portable": "download/WorkCalf.exe",
    "win_setup": "download/WorkCalf-Setup.exe"
  },
  "notes": ""
}
JSON

echo "[OK] version.json → v$VERSION"

# 本地可能没有 rsync（Git Bash 默认没有），退回 tar over ssh
if command -v rsync >/dev/null 2>&1; then
  rsync -av --progress --exclude 'README.md' --exclude '.gitignore' --exclude '.gitkeep' \
    site/ "$SERVER:$REMOTE_DIR/"
else
  tar -C site -cf - --exclude README.md --exclude .gitignore --exclude .gitkeep . \
    | ssh "$SERVER" "mkdir -p '$REMOTE_DIR' && tar -C '$REMOTE_DIR' -xf -"
fi

echo "[OK] 已同步到 $SERVER:$REMOTE_DIR"
echo "     官网：https://workcalf.app.tangzheheshui.cn/"
