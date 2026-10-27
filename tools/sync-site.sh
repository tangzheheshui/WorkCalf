#!/usr/bin/env bash
# 生成 version.json，把 site/ 同步到静态托管，并做一次线上自检。
#
# 用法：
#   SERVER=user@vps bash tools/sync-site.sh          # 用 site/download/ 里已有的安装包
#   SERVER=user@vps bash tools/sync-site.sh local    # 先从本机 Tauri 构建产物拷安装包
#
# 可选环境变量：
#   REMOTE_DIR=/var/www/workcalf          远端目录（默认）
#   SITE_URL=https://workcalf.app...      自检域名（默认 workcalf.app.tangzheheshui.cn）
#   SKIP_VERIFY=1                         跳过同步后的线上自检
#
# 版本号取自 src-tauri/tauri.conf.json，与安装包、应用内版本号保持同一来源。
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER="${SERVER:?需要 SERVER=user@vps}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/workcalf}"
SITE_URL="${SITE_URL:-https://workcalf.app.tangzheheshui.cn}"
SRC="${1:-}"

mkdir -p site/download
FILES=()

if [ "$SRC" = "local" ]; then
  EXE="src-tauri/target/release/workcalf.exe"
  [ -f "$EXE" ] \
    || { echo "[错误] 没找到 $EXE，先运行 tauri build --bundles nsis" >&2; exit 1; }
  # 固定文件名，version.json 里的下载地址就不用每次发版都改
  cp "$EXE" site/download/WorkCalf.exe
  echo "[OK] 便携版 → site/download/WorkCalf.exe"

  SETUP="$(ls -1 src-tauri/target/release/bundle/nsis/*-setup.exe 2>/dev/null | head -1 || true)"
  if [ -n "$SETUP" ]; then
    cp "$SETUP" site/download/WorkCalf-Setup.exe
    echo "[OK] 安装版 → site/download/WorkCalf-Setup.exe"
  else
    echo "[错误] 没找到 NSIS 安装包，安装版下载会 404；先跑 tauri build --bundles nsis" >&2
    exit 1
  fi
fi

# 两个 Windows 包必须存在：version.json 一定会写这两个地址，缺了就是线上 404
for f in WorkCalf.exe WorkCalf-Setup.exe; do
  [ -f "site/download/$f" ] \
    || { echo "[错误] 缺 site/download/$f：先跑 tools/release.sh，或把安装包拷进来" >&2; exit 1; }
  FILES+=("$f")
done

VERSION="$(grep -m1 '"version"' src-tauri/tauri.conf.json \
  | sed -E 's/.*"version": *"([^"]+)".*/\1/')"

# macOS 包由 GitHub Actions 产出，下载到 site/download/ 后随站点一起上传；
# 没有就不写进 version.json，站点按钮保持隐藏/置灰
URLS="    \"win_portable\": \"download/WorkCalf.exe\",
    \"win_setup\": \"download/WorkCalf-Setup.exe\""
for arch in arm64 x64; do
  f="WorkCalf-mac-$arch.dmg"
  if [ -f "site/download/$f" ]; then
    URLS="$URLS,
    \"mac_$arch\": \"download/$f\""
    FILES+=("$f")
  fi
done

cat > site/version.json <<JSON
{
  "version": "$VERSION",
  "updated": "$(date +%Y-%m-%d)",
  "url": "download/WorkCalf.exe",
  "urls": {
$URLS
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
echo "     官网：$SITE_URL/"

# 线上自检：别让"同步命令成功、线上却还是旧版"蒙混过关
if [ "${SKIP_VERIFY:-0}" != "1" ]; then
  echo "[..] 线上自检…"
  LIVE_VER=""
  for i in 1 2 3 4 5; do
    LIVE_VER="$(curl -fsS "$SITE_URL/version.json" 2>/dev/null \
      | grep -m1 '"version"' \
      | sed -E 's/.*"version": *"([^"]+)".*/\1/')" || true
    [ "$LIVE_VER" = "$VERSION" ] && break
    sleep 2
  done
  [ "$LIVE_VER" = "$VERSION" ] \
    || { echo "[错误] 线上 version.json 是 ${LIVE_VER:-读不到}，不是 $VERSION（同步没生效？）" >&2; exit 1; }

  for f in "${FILES[@]}"; do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' -I "$SITE_URL/download/$f")"
    [ "$CODE" = "200" ] \
      || { echo "[错误] $SITE_URL/download/$f 返回 $CODE" >&2; exit 1; }
  done
  echo "[OK] 线上自检通过：version.json = $VERSION，${#FILES[@]} 个安装包均可下载"

  if curl -sI "$SITE_URL/version.json" | tr -d '\r' \
    | grep -qi '^access-control-allow-origin:'; then
    :
  else
    echo "[警告] version.json 缺 Access-Control-Allow-Origin，应用内检查更新会失败" >&2
  fi
fi
