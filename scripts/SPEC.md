---
id: pipeline
type: module-design
title: 数据流水线（scripts/）
status: active
parent: jpstudy-architecture
references: [ingest, curriculum, curriculum-lint, text-libs]
---

# 数据流水线

把 `raw/` 与 `content/` 变成站点能直接消费的 JSON，并给出课程是否合格的判定。纯 node ESM，除内置 `node:sqlite` 外没有第三方依赖。

## 边界

- 读：`raw/`（仅 `00-fetch.sh` 联网）、`content/`、`data/`（自己上一阶段的产物）。
- 写：`data/`、`public/media/`、`lint-report.md`、`site/data/`、`site/media/`。
- 不读、不改 `site/` 的页面代码；不动 `content/`。

## 阶段契约

各阶段之间的唯一接口是 `data/` 下的文件：

| 阶段 | 产出 | 说明 |
|---|---|---|
| `00-fetch.sh` | `raw/` + `raw/SOURCES.json` | 浅克隆三仓，记录 commit 与日期，保证可复现 |
| `01-words` | `words.json`、`report-01-words.json` | 牌组词条 + 自带例句（`ingest`） |
| `02-enrich` | `grammar.json`、`kanji.json`，回填 `words.json` 的英文义/`jmdictId`/级别 | `ingest` |
| `03-conjugate` | `report-03-conjugate.json` | 活用器对拍，不改数据（`text-libs`） |
| `04-difficulty` | `words.json` 加 `difficulty`/`stage`/`confusable` | `curriculum` |
| `04b-corpus` | `corpus-extra.json` | Tatoeba 补例句（`curriculum`） |
| `05-curriculum` | `units.json` | 排课 + 例句归位（`curriculum`） |
| `06-lint` | `lint-report.json`、`lint-report.md` | R1–R6 判定（`curriculum-lint`） |
| `07-media` | `public/media/` + `manifest.json` | 按 stage 复制音频（`ingest`） |
| `08-site` | `site/data/*` + `site/media/` | 发布产物（见下） |

一个阶段可以被单独重跑（`npm run 04` 等），前提是上游 `data/` 还在。`npm run s0` = 数据 + 验收 + 音频；`npm run data:site` = 生成站点数据。

## 发布产物

`08-site` 每次先清空 `site/data/` 再重建：

- `index.json` — 课程目录（`id`、级别、语法点、词数、句数、首词），首页与上下课导航用
- `units/uNNN.json` — 单元页的全部内容：`grammar`（含中文讲解）、`words`、`sentences`（ruby 已切好）、`drills`；`audio` 字段只会出现实际打包了的文件（见 `ingest`）
- `words-lite.json` — 复习页查词用的精简词表
- `kana.json` — 五十音表数据
- `media/` — 从 `public/media/` 整体复制

站点字段名就是接口定义；改字段等于改 `site` 的契约，两边同一改动里一起改。

## 可复现性

不写真实时间戳：`06-lint` 的报告时间固定为 epoch（`new Date(0)`），所以同输入重跑得到逐字节相同的 `lint-report.md`。上游身份只由 `raw/SOURCES.json` 的 commit 记录，不靠"某天拉到的版本"。
