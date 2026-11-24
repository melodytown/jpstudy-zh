# jpstudy · 中文母语者的日语课程

数据流水线 + 纯静态站点 + 免安装桌面版。无后端、无账号、无构建工具。

给别人装：下载 `jpstudy-setup-<version>.exe` 双击安装（**推荐**），或解压 `jpstudy-<version>-windows-x64.zip` 后直接跑里面的 `jpstudy.exe`。两者都不用装 Python，也不需要联网。

> Windows SmartScreen 会提示“未知发布者”——exe 没有买代码签名证书，这是预期行为；点「更多信息 → 仍要运行」即可。

## 用法一：桌面版（推荐）

`jpstudy.exe` 是打包好的单文件程序，双击就开一个窗口，自带本地服务器 + WebView2 窗口，不用命令行、不用浏览器、不用装 Python。

- 端口默认 `127.0.0.1:17321`。**端口是进度的一部分**：浏览器的 IndexedDB 按 `协议://主机:端口` 隔离，端口一变学习进度就“消失”
- 17321 被别的程序占用时，会**从 17321 往后找一个空闲端口**（17322–17330），页面顶部会提示“此端口进度独立”；要迁移用首页的「导出进度 / 导入进度」
- 已经开着一个实例时，再双击不会开第二个，会直接聚焦已有窗口（靠 `/__jpstudy` 身份探测，不会把你丢进别人的页面）
- 没有 WebView2 的机器（老 Win10）会自动改用默认浏览器打开，地址与端口不变
- 学习数据存在 `%LOCALAPPDATA%` 下的 WebView2 用户目录里；换机器请用首页的「导出进度」

重新打包（改了 `site/` 内容之后）：

```bash
npm run exe            # 只出 desktop/dist/jpstudy/（onedir 文件夹，N5 音频约 74MB）
npm run package        # 文件夹 + 便携 zip + 安装包，产物在 desktop/release/
```

打包是 **`--onedir`（文件夹）而不是单文件 exe**：全量音频有 26000+ 个文件、345MB，
单文件模式每次启动都要整包解压到 `%TEMP%`，慢且占双份磁盘；onedir 配合安装包没有这个问题。

`npm run package` 需要 [Inno Setup 6](https://jrsoftware.org/isinfo.php)（`winget install -e --id JRSoftware.InnoSetup`）；没装时只出便携 zip。版本号只有一个来源：`desktop/app.py` 里的 `VERSION`。

## 用法二：本地静态服务器（改内容时更快）

**克隆下来就能跑**：`site/data`（13MB）与 `site/media`（16MB，音频）是提交在仓库里的发布产物，
不需要先跑流水线。

```bash
npm run serve          # python -m http.server 8080 --directory site
# 打开 http://localhost:8080
```

注意必须用 http://，`file://` 打不开 JSON。

只有改了课程内容或上游数据才需要重跑流水线（生成物记得一起提交）：

```bash
npm run fetch          # 拉上游（三个 git 仓 + Tatoeba 快照），已拉到就跳过
npm run s0             # 数据 + lint + 音频
npm run data:site      # 重新生成 site/data 与 site/media
git add site/data site/media && git commit -m "content: ..."
```

## 目录

```
raw/                上游数据（git clone，已 gitignore）
content/
  confusables.tsv   102 条同形异义表（本项目原创）
  grammar-zh.json   526 条语法点的中文讲解 + 反例（全量）
scripts/
  00-fetch.sh       拉数据 + 记录 commit
  01-words.mjs      牌组 notes.csv → words.json（10645 词）
  02-enrich.mjs     OpenJLPT join（51.4%）+ 语法点 526 + 汉字 2383
  03-conjugate.mjs  活用器 golden test（83857 格，0 不一致）
  04-difficulty.mjs 难度分 D + 中文母语者修正
  04b-corpus.mjs    Tatoeba jpn-cmn 补例句（12029 句）
  05-curriculum.mjs 排课（545 单元）+ 例句分配
  06-lint.mjs       R1–R6 验收 → lint-report.md
  07-media.mjs      按阶段复制音频
  08-site.mjs       生成站点数据（单元 JSON + 操练题）
site/               静态站点（index/unit/review/kana/about）
desktop/app.py      桌面版壳：本地服务器 + WebView2 窗口
desktop/build.sh    打包 exe（PyInstaller --onefile）
desktop/package.sh  打包发布物（便携 zip + 安装包）
desktop/jpstudy.iss Inno Setup 安装包定义
data/              流水线中间产物
lint-report.md     课程进阶合理性报告
LICENSE            本项目代码的 MIT 许可
THIRD-PARTY-NOTICES.md  上游数据来源与许可（分发时必须附带）
```

## 站点功能

- `index.html` 课程目录（545 单元，按 N5–N1 分组，进度条）
- `unit.html?u=u001` 单元页：**新词 → 精读（带注音与音频）→ 操练 → 语法参考（折叠）**
  （语法放最后且可折叠：日常 loop 是背词+读句，语法按需查；展开状态会记住）
- `review.html` FSRS 复习（ts-fsrs + IndexedDB，键盘 1–4 评分、空格看答案）
- `kana.html` 五十音（104 个假名 × 平/片假名切换，点击朗读）
- 没有真人录音的句子用 🗣 系统日语语音朗读（需要系统装 ja-JP 语音；🔊 才是真人录音）
- `about.html` 关于：数据来源、许可、进度存在哪

学习数据全部存在浏览器 IndexedDB 里，首页可以导出/导入 JSON 备份。

## 发布（给别人装）

```bash
npm run s0 && npm run data:site    # 先备好 site/data，否则 exe 里是空壳
npm run package                    # desktop/release/ 下出两个产物
```

| 产物 | 用途 |
|---|---|
| `jpstudy-setup-<version>.exe` | 安装包：装到 `%LOCALAPPDATA%\Programs\jpstudy`，开始菜单有快捷方式，控制面板可卸载 |
| `jpstudy-<version>-windows-x64.zip` | 便携版：解压后直接双击 `jpstudy.exe`（同目录的 `_internal/` 要一起保留） |

本地打包出来的包只带 **N5 音频**（~40MB）。带 **N1–N5 全量音频**的官方包由 CI 出：仓库里只提交 N5 音频，
全量 345MB 不适合进 git，所以 `release.yml` 会在 runner 上跑 `npm run fetch && npm run s0 && npm run media:all && npm run data:site`
再打包（产物约 385MB）。想让本地也带全量音频：

```bash
npm run media:all && npm run data:site && npm run package
```

发到 GitHub Release 时，把这两个文件连同 `THIRD-PARTY-NOTICES.md` 一起挂上去。安装包**没有代码签名**，用户首次运行会看到 SmartScreen 警告（“更多信息 → 仍要运行”）；要消掉得买证书。

## 许可

- 本项目代码：MIT（`LICENSE`）。
- 课程内容来自上游公开数据，分发时必须保留 `THIRD-PARTY-NOTICES.md` 的署名：
  牌组（CC BY-NC 4.0，**只能非商业分发**）、OpenJLPT 与 kanjium（CC BY-SA 4.0）、Tatoeba（CC BY 2.0 FR）。
- `content/confusables.tsv` 与 `content/grammar-zh.json` 为本项目原创。

## 课程是怎么生成的

1. 词按难度分 D 排序（D 里含「中文母语者修正」：汉语词更容易、纯假名更难、同形异义 +1.0）
2. 语法点按级别每 2 个一组，与词汇块对齐成单元
3. 例句按「最早能用在哪一课」分配（`req = max(教过句中所有词的课)`），再用贪心集合覆盖挑出能复习最多旧词的 24 句
4. `06-lint` 独立复算 R1–R6，红灯即失败

验收结果见 `lint-report.md`；难度分与排课规则见 `scripts/curriculum.SPEC.md`。
