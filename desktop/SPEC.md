---
id: desktop
type: module-design
title: 桌面版外壳（desktop/）
status: active
parent: jpstudy-architecture
references: [site]
---

# 桌面版外壳

把 `site/` 用一个本地 HTTP 服务跑起来，再塞进 WebView2 窗口，打成单文件 exe。双击即用：不用命令行、不用挑浏览器。分发给别人时另出安装包。

## 端口是进度身份

IndexedDB 按 `scheme://host:port` 隔离 origin，所以**端口就是进度的一部分**：换端口 = 换一套学习进度。默认端口 `127.0.0.1:17321`。

端口被占时分三种情况，不能一视同仁：

1. **占着它的是自己** —— 请求 `GET /__jpstudy`，`app` 字段是 `jpstudy` 就是第二个实例：不起服务，把窗口指过去（必要时用浏览器）。
2. **占着它的是别的程序** —— 从 17321 往后找（17322–17330）第一个空闲端口起服务，页面顶部用横幅说明「此端口进度独立」。选备用端口是**有代价的妥协**：宁可让用户看到警告，也不能像以前那样直接打开 17321——在别人的电脑上那等于打开别人的程序。
3. **17321–17330 全被占** —— 弹窗说明，不静默降级。

`/__jpstudy` 是运行时自述接口，返回 `{app, version, port, primary}`；站点用它决定是否显示横幅，探测也用它区分自己与陌生人。**不要用「端口能不能 bind」判断占用**：Windows 上 `SO_REUSEADDR` 等于允许两个进程同时监听同一端口，请求会随机落到其中一个。所以 `LocalServer.allow_reuse_address = False`，占用判断先 `connect` 再 `bind`。

## 结构

- `app.py` 自带 `ThreadingHTTPServer`（标准库），服务 `site/`；`--serve-only` 只起服务不开窗口，`--port=N` 指定首选端口，`--version` 打印版本（安装包与 CI 都读它）。
- `site_dir()` 解析顺序：打包后从 PyInstaller 的 `_MEIPASS/site` 取；开发时从 exe/脚本所在目录向上找 `site/`。
- WebView 起不来（缺 WebView2 或依赖）时退回默认浏览器打开同一地址，端口不变。
- 缓存策略：`.json` 与 `/data/` 走 `no-store`（改内容刷新即生效），音频/字体/样式缓存一天。
- `--noconsole` 打包后 `sys.stdout` 可能是 `None`，所有提示走 `log()`，直接 `print` 会在发布版里抛异常。

## 打包与分发

- `desktop/build.sh`：PyInstaller **`--onedir --noconsole`**，把 `site/` 以 `--add-data` 塞进 `_internal/site` → `desktop/dist/jpstudy/`（N5 音频约 74MB，全量音频约 385MB）。**不用 `--onefile`**：全量音频 345MB，单文件模式每次启动都要整包解压到 `%TEMP%`，机械盘上要等十几秒且占双份空间；onedir + 安装包没有这个问题。
- pywebview 的打包 hook 会把整个 PyQt5 拖进来（81MB），而我们只用 WebView2 后端；`--exclude-module` 挡不住 hook，所以 `build.sh` 在产物里删掉 `_internal/PyQt5`（已验证窗口与 WebView2 正常）。
- exe 里是打包那一刻的站点副本，改了 `site/` 就要重打。
- `desktop/package.sh`：先校验 `site/data/index.json` 存在（否则 exe 是空壳），再出两件发布物到 `desktop/release/`——便携 zip（PowerShell `Compress-Archive`，不依赖 7z）与 Inno Setup 安装包。
- `desktop/jpstudy.iss`：按用户安装（`PrivilegesRequired=lowest`，默认落到 `%LOCALAPPDATA%\Programs\jpstudy`，避开 UAC 与 Program Files 权限问题），带开始菜单快捷方式与卸载项；`AppId` 发布后不可改。安装包**不签名**，SmartScreen 警告是预期行为。
- 版本号唯一来源是 `app.py` 的 `VERSION`，由 `package.sh` 传给 ISCC。
- 分发时必须随包附带 `LICENSE` 与 `THIRD-PARTY-NOTICES.md`：上游音频与释义是 CC BY-NC，整包只能非商业分发。
- **音频有两条构建线**：本地 `npm run package` 只带 N5（仓库里提交的就是 N5，33MB）；CI（`release.yml`）在 runner 上跑 `fetch → s0 → media:all → data:site` 再打包，出 N1–N5 全量音频的官方包。全量音频不进 git——345MB × 每次内容改动都不划算。
- WebView2 假定系统已装（Win11 与打过补丁的 Win10 自带），缺失时退回浏览器，不打包固定运行时。
