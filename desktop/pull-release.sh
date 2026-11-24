#!/usr/bin/env bash
# 把最新一个 Release 的产物拉到本机（装/看都方便），并删掉本地旧版本，只留最新。
#   npm run release:pull              # 只下安装包，默认桌面
#   npm run release:pull -- --all     # 连便携 zip 一起下
#   npm run release:pull -- D:/jp     # 指定目录（可与 --all 混用）
# 需要 gh 已登录（gh auth status）。
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="melodytown/jpstudy-zh"
ALL=0
OUT=""
for arg in "$@"; do
  case "$arg" in
    --all) ALL=1 ;;
    --) ;;
    *) OUT="$arg" ;;
  esac
done
[ -n "$OUT" ] || OUT="$HOME/Desktop"
mkdir -p "$OUT"

TAG="$(gh release view --repo "$REPO" --json tagName --jq .tagName)"
VER="${TAG#v}"
echo "latest: $TAG → $OUT"

# gh 不支持断点续传；这里用带 -C - 的 curl 兜底，断了重试几次。
asset_url() {
  gh api "repos/$REPO/releases/tags/$TAG" --jq ".assets[]|select(.name==\"$1\")|.url"
}
grab() { # 文件名
  local name="$1" url token
  url="$(asset_url "$name")"
  token="$(gh auth token)"
  for i in 1 2 3 4 5; do
    if curl -fsSL -C - --max-time 1800 \
        -H "Authorization: Bearer $token" -H "Accept: application/octet-stream" \
        -o "$OUT/$name" "$url"; then
      echo "  ✓ $name"
      return 0
    fi
    echo "  … $name 第 $i 次中断，重试"
    sleep 3
  done
  echo "  ✗ $name 下载失败" >&2
  return 1
}

grab "jpstudy-setup-$VER.exe"
[ "$ALL" = 1 ] && grab "jpstudy-$VER-windows-x64.zip"
grab "LICENSE"
grab "THIRD-PARTY-NOTICES.md"

# 只保留最新版本：删掉本目录里其它版本的 jpstudy 产物
find "$OUT" -maxdepth 1 -type f \( -name "jpstudy-setup-*.exe" -o -name "jpstudy-*-windows-x64.zip" \) \
  ! -name "*$VER*" -print -delete

echo "done:"
ls -lh "$OUT"/jpstudy-* 2>/dev/null | awk '{print "  "$5"  "$9}'
