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

# 最新 tag 从远端 tags 推（git 协议比 api.github.com 稳），失败再退回 gh api。
TAG=""
for i in 1 2 3 4 5; do
  TAG="$(git ls-remote --tags --refs origin 2>/dev/null | awk '{print $2}' | sed 's|refs/tags/||' | sort -V | tail -1)"
  [ -n "$TAG" ] && break
  echo "… 取 tag 失败，重试 $i"
  sleep 3
done
if [ -z "$TAG" ]; then
  for i in 1 2 3; do
    TAG="$(gh release view --repo "$REPO" --json tagName --jq .tagName 2>/dev/null)" && [ -n "$TAG" ] && break
    echo "… gh api 取 tag 失败，重试 $i"
    sleep 5
  done
fi
[ -n "$TAG" ] || { echo "拿不到最新 tag：检查网络或 gh auth status" >&2; exit 1; }
VER="${TAG#v}"
echo "latest: $TAG → $OUT"

# 直接用 releases/download 的固定地址（会 302 到 CDN），不再每次问 API；
# gh 不支持断点续传，所以用 curl -C -，断了重试几次。
asset_url() {
  echo "https://github.com/$REPO/releases/download/$TAG/$1"
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
