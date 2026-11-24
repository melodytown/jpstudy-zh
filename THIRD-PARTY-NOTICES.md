# 第三方数据与许可

本项目的代码是 MIT（见 LICENSE）。但课程内容是从下面这些公开数据整理出来的，
分发（包括打包成 exe / 安装程序）时必须保留本文件的署名，并遵守各自的许可。

| 来源 | 用途 | 许可 | 在本项目中的形态 |
|---|---|---|---|
| [5mdld/anki-jlpt-decks](https://github.com/5mdld/anki-jlpt-decks) | 中文释义、音调、词性、例句、单词/例句音频 | CC BY-NC 4.0 | `data/words.json` 的词与例句字段、`site/media/*.mp3` |
| [evanclan/OpenJLPT](https://github.com/evanclan/OpenJLPT) | 526 个语法点、2383 个汉字、英文释义、jmdict id | CC BY-SA 4.0 | `data/grammar.json`、`data/kanji.json`，以及 `words.json` 的 `en`/`jmdictId` |
| [mifunetoshiro/kanjium](https://github.com/mifunetoshiro/kanjium) | 活用表（对拍验证）、音调补缺 | CC BY-SA 4.0 | 只在校验阶段读取，不随产物分发 |
| [Tatoeba](https://tatoeba.org) | 日→中句对，补充例句 | CC BY 2.0 FR | `data/corpus-extra.json` 及并入的单元例句 |

## 各许可的实际约束

- **CC BY-NC 4.0（牌组）**：必须署名，且**不得用于商业目的**。所以本项目的整包分发
  （含音频、含牌组中文释义）只能是非商业的。要去掉这条约束，就得把音频与牌组释义排除在外。
- **CC BY-SA 4.0（OpenJLPT、kanjium）**：署名 + **相同方式共享**。由它们派生出的课程数据
  （`site/data/*`、`data/*.json`）对外分发时，需要以 CC BY-SA 4.0 提供。
- **CC BY 2.0 FR（Tatoeba）**：署名。句子的原始作者信息在 Tatoeba 上按句子 id 可查。

## 本项目原创

- `content/confusables.tsv`：102 条同形异义对照（日语义 vs 中文直觉）。
- `content/grammar-zh.json`：526 条语法点的中文讲解与反例。
- `scripts/`、`site/`、`desktop/` 的代码，MIT。

## 不要提交到仓库的东西

`raw/`（上游仓库克隆）与 `data/`、`site/data/`、`site/media/`、`public/`（派生产物）
都在 `.gitignore` 里，原因就是上面这些许可：仓库里不应该出现上游原始数据，
产物则按各自许可单独分发。
