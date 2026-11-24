#!/usr/bin/env bash
# 打包发布物：便携 zip + Inno Setup 安装包。
#   bash desktop/package.sh
# 前置：site/data 已生成（npm run s0 && npm run data:site），否则 exe 里是空壳。
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(python desktop/app.py --version)"
echo "version: $VERSION"

if [ ! -f site/data/index.json ]; then
  echo "site/data 不存在：先跑 npm run s0 && npm run data:site" >&2
  exit 1
fi

bash desktop/build.sh

RELEASE="desktop/release"
PORTABLE="jpstudy-${VERSION}-windows-x64"
rm -rf "${RELEASE:?}/$PORTABLE"
mkdir -p "$RELEASE/$PORTABLE"

rm -rf "$RELEASE/$PORTABLE"
cp -r desktop/dist/jpstudy "$RELEASE/$PORTABLE"
cp LICENSE THIRD-PARTY-NOTICES.md "$RELEASE/$PORTABLE/"

# 便携 zip（PowerShell 自带，不依赖 7z）
powershell -NoProfile -Command \
  "Compress-Archive -Force -Path '$(pwd -W)\\${RELEASE//\//\\}\\${PORTABLE}' -DestinationPath '$(pwd -W)\\${RELEASE//\//\\}\\${PORTABLE}.zip'"
echo "portable: $RELEASE/$PORTABLE.zip"

# 安装包
ISCC=""
for c in \
  "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" \
  "/c/Program Files/Inno Setup 6/ISCC.exe" \
  "$LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe" \
  "$HOME/AppData/Local/Programs/Inno Setup 6/ISCC.exe"; do
  [ -x "$c" ] && ISCC="$c" && break
done
if [ -z "$ISCC" ]; then
  echo "跳过安装包：没找到 Inno Setup。装一个再重跑：" >&2
  echo "  winget install -e --id JRSoftware.InnoSetup" >&2
  exit 0
fi
MSYS_NO_PATHCONV=1 "$ISCC" /Q "/DAppVersion=$VERSION" desktop/jpstudy.iss
cp "desktop/dist/jpstudy-setup-$VERSION.exe" "$RELEASE/"
echo "installer: $RELEASE/jpstudy-setup-$VERSION.exe"
