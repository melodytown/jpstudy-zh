---
id: site
type: module-design
title: 静态学习站（site/）
status: active
parent: jpstudy-architecture
references: [pipeline, desktop]
---

# 静态学习站

纯静态页面集合：读完发布好的 JSON，就在浏览器里完成学习与复习。没有服务器逻辑、没有构建步骤、没有前端框架——手写 HTML/CSS/ESM，改文件刷新即生效。

## 页面

- `index.html` — 课程目录：继续学习入口、各级别进度条、单元格子；导出/导入进度
- `unit.html?u=u001` — 单元页：新词 → 精读 → 操练 → 语法参考（折叠）→ 完成本课
- `review.html` — FSRS 复习：到位卡 + 新卡，空格看答案、1–4 评分
- `kana.html` — 五十音表：清音/浊音/半浊音/拗音 × 平/片假名，点击用浏览器语音朗读
- `about.html` — 关于：数据来源与许可、进度存在哪、桌面版的端口说明

## 边界

- 只读 `site/data/*.json` 与 `site/media/*`（字段契约见 `pipeline` 的"发布产物"）；不请求任何外部服务，不读 `data/`。
- 进度只写浏览器 IndexedDB，**不落任何文件、不发网络请求**。
- 必须用 `http://` 打开（`file://` 下 `fetch` JSON 会失败）。桌面版就是为这件事存在的。
- 页面之间靠 URL 与 IndexedDB 通信，没有共享运行时状态。
- 站点不知道自己是「桌面版」还是「静态服务器」：只请求一次 `__jpstudy`，拿不到就当普通站点（那是 `python -m http.server` 的场景）。

## 进度模型

- IndexedDB `jpstudy`，三个 store：`cards`（按词 id）、`units`（已完成课）、`logs`（评分流水）。
- **卡片只在点"完成本课"时入库**，一次一批该课的新词。不预灌 10645 张，否则新卡队列会淹掉复习。
- 复习队列 = 到期卡 + 最多 20 张新卡；评 `Again` 的卡用新状态当轮重推，不进下一轮。
- 卡片 id 就是词 id，所以跨设备/重装后导入 JSON 能直接对上。

## 呈现约定

- 注音来自流水线切好的 `ruby` 段；纯假名句由 `08-site` 用整句兜底，前端统一按 ruby 渲染。
- 语法放页面最后并默认折叠（展开状态记 localStorage）：日常循环是背词＋读句，语法按需查。
- 单元页顺序即学习顺序：先词、后句、再练，语法不打断这个循环。
- 桌面版跑在备用端口时（`/__jpstudy` 的 `primary: false`），`lib.js` 在页头下方插一条横幅说明「此端口进度独立」，其余行为不变。横幅按需出现，静态服务器部署时完全不存在。
