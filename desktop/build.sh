#!/usr/bin/env bash
# 打包桌面版：产物 desktop/dist/jpstudy/（文件夹；N5 音频 ~75MB，全量音频 ~390MB）
#
# 用 --onedir 而不是 --onefile：全量音频有 26000+ 个文件、300MB+，
# onefile 每次启动都要把它整包解压到 %TEMP%，机械盘上要等十几秒；
# onedir 只解一次（安装包里就是普通文件夹），启动是即时的。
set -euo pipefail
cd "$(dirname "$0")/.."

SITE="$(pwd -W)/site"      # git-bash 下取 Windows 绝对路径；cmd 里请自己传
python -m PyInstaller --noconfirm --clean --onedir --noconsole --name jpstudy \
  --distpath desktop/dist --workpath desktop/build --specpath desktop \
  --add-data "$SITE;site" \
  --collect-submodules webview --collect-submodules clr_loader --collect-submodules pythonnet \
  desktop/app.py

# pywebview 的打包 hook 会把整个 PyQt5（81MB）拖进来，而我们只用 WebView2（edgechromium）后端。
# --exclude-module 挡不住 hook 的 collect，所以直接在产物里删掉；已实测删掉后窗口与 WebView2 正常。
rm -rf desktop/dist/jpstudy/_internal/PyQt5

echo "done: desktop/dist/jpstudy/jpstudy.exe"
du -sh desktop/dist/jpstudy
