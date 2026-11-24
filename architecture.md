---
id: jpstudy-architecture
type: architecture-design
title: jpstudy 架构
status: active
parent: jpstudy
references: [pipeline, site, desktop, content]
---

# 架构

## 拓扑

```
raw/         上游三仓（git clone，gitignore）──┐
content/     人工原创内容（confusables、grammar-zh）─┤
                                               ↓
scripts/     数据流水线（node，无第三方依赖）→ data/（中间产物）
                                               ↓
                              public/media + site/data（发布产物）
                                               ↓
site/        纯静态页面（手写 HTML/CSS/ESM，无构建）
                                               ↑
desktop/     PyInstaller 单文件 exe：本地 HTTP 服务 + WebView2 窗口
```

上游数据、中间产物、发布产物、打包产物都在 `.gitignore` 里；仓库只留代码、原创内容和 `lint-report.md`。

## 模块与依赖

| 模块 | 职责 | 依赖 |
|---|---|---|
| `content` | 人工维护的原创内容 | — |
| `ingest` | 拉上游、解析牌组、join 补强、打包音频 | `text-libs`、`content`（只读） |
| `curriculum` | 难度分、语料补全、排课与例句归位 | `ingest` 的产物、`text-libs`、`content` |
| `curriculum-lint` | 独立复算 R1–R6 并判定 | `curriculum` 的产物 |
| `site` | 浏览器里的学习/复习界面 | `pipeline` 发布的 JSON |
| `desktop` | 把 `site/` 服务起来并套窗口 | `site` |

`pipeline` 是 `scripts/` 的门面 spec：它描述阶段串接与产物契约，细节在三个子模块里。依赖方向单向向下，没有回边：站点不读 `data/`，流水线不读 `site/`。

## 不变量

- **阶段串接只靠文件。** 每个阶段读 `data/*.json`、写 `data/*.json`，不传内存状态；同输入必然同输出。
- **流水线不改手工内容。** `content/` 只读；要改同形异义表或中文讲解就改文件，不在脚本里生成。
- **发布产物自带全部数据。** 站点不需要服务端计算：排课、注音、操练题都在构建期算完。
- **端口就是进度身份。** 桌面版默认 `127.0.0.1:17321`；IndexedDB 按 origin 隔离，换端口等于换一套进度。17321 被别的程序占用时只能退到备用端口并明确告知用户，绝不能悄悄打开那个端口。
- **验收即门禁。** `06-lint` 红灯不降级为警告，也不靠人工豁免。
