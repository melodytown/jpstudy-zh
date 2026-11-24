// 复习页：到期卡 + 新卡，FSRS 四档评分（键盘 1–4 评分，空格显示答案）
import { $, el, getJSON, audioBtn, toast } from "./lib.js";
import { dueCards, newCards, rate, stats, preview, Rating, RATING_LABEL } from "./srs.js";

const app = $("#app");
const NEW_PER_SESSION = 20;
const RATINGS = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

let queue = [];
let wordMap = null;
let session = { done: 0, again: 0 };
let current = null;      // { row, revealed }
let onKey = null;

async function main() {
  const [due, fresh, st, wordsLite] = await Promise.all([
    dueCards(), newCards(), stats(), getJSON("data/words-lite.json"),
  ]);
  wordMap = new Map(wordsLite.map((w) => [w.i, w]));
  queue = [...due, ...fresh.slice(0, NEW_PER_SESSION)];

  app.textContent = "";
  if (!queue.length) {
    app.append(
      el("h1", {}, "今天没有要复习的"),
      el("div", { class: "card" },
        st.total === 0
          ? el("div", {}, "还没有卡片。去 ", el("a", { href: "index.html" }, "课程"), " 学第一课，点「完成本课」就会开始排复习。")
          : el("div", {}, `已学 ${st.learned} 词 · 今天复习过 ${st.reviewedToday} 张 · 到期 0 张`),
        el("div", { class: "row", style: "margin-top:12px" },
          el("a", { class: "btn", href: "index.html" }, "回课程"),
          el("button", { onclick: () => location.reload() }, "刷新"),
        ),
      ),
    );
    return;
  }

  app.append(el("div", { class: "row" },
    el("h1", {}, "复习"),
    el("span", { class: "badge" }, `到期 ${due.length}`),
    el("span", { class: "badge" }, `新卡 ${Math.min(fresh.length, NEW_PER_SESSION)}`),
    el("div", { class: "spacer" }),
    el("span", { id: "counter", class: "dim small" }),
  ));
  app.append(el("div", { id: "stage" }));

  document.addEventListener("keydown", handleKey);
  next();
}

function handleKey(e) {
  if (!current) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!current.revealed) reveal();
    return;
  }
  if (current.revealed && ["1", "2", "3", "4"].includes(e.key)) submit(RATINGS[Number(e.key) - 1]);
}

function next() {
  const row = queue.shift();
  const stage = $("#stage");
  const counter = $("#counter");
  if (!row) {
    document.removeEventListener("keydown", handleKey);
    current = null;
    stage.textContent = "";
    stage.append(el("div", { class: "card" },
      el("h2", { style: "border:0;margin-top:0" }, "这一轮结束"),
      el("div", {}, `复习 ${session.done} 张，其中「完全忘了」${session.again} 张。`),
      el("div", { class: "row", style: "margin-top:12px" },
        el("a", { class: "btn primary", href: "index.html" }, "回课程"),
        el("button", { onclick: () => location.reload() }, "再来一轮"),
      ),
    ));
    if (counter) counter.textContent = "";
    return;
  }

  const w = wordMap.get(row.id);
  if (!w) { next(); return; }
  if (counter) counter.textContent = `剩余 ${queue.length + 1}`;
  current = { row, revealed: false };

  stage.textContent = "";
  const isNew = row.card.state === 0;
  const card = el("div", { class: "card" });
  card.append(el("div", { class: "row" },
    el("span", { class: "badge" }, isNew ? "新卡" : `第 ${(row.card.reps ?? 0) + 1} 次`),
    el("div", { class: "spacer" }),
    el("span", { class: "dim small" },
      `难度 ${(row.card.difficulty ?? 0).toFixed(1)} · 稳定度 ${(row.card.stability ?? 0).toFixed(1)} 天`),
  ));

  card.append(el("div", { class: "bigword jp" }, w.w));

  const back = el("div", { class: "hidden", id: "back" });
  back.append(el("div", { class: "row", style: "justify-content:center" },
    el("span", { class: "jp", style: "font-size:22px;color:var(--ruby)" }, w.r),
    w.p ? el("span", { class: "badge" }, `音调 ${w.p}`) : null,
    audioBtn(w.a),
  ));
  back.append(el("div", { style: "text-align:center;margin-top:10px;font-size:17px" }, w.z));
  card.append(back);

  const showBtn = el("button", { class: "primary", style: "width:100%;margin-top:16px;padding:12px" }, "显示答案（空格）");
  card.append(showBtn);

  const rateBox = el("div", { class: "rate hidden", id: "ratebox" });
  const pv = preview(row.card);
  for (const r of RATINGS) {
    const cls = r === Rating.Again ? "again" : r === Rating.Hard ? "hard" : r === Rating.Good ? "good" : "easy";
    rateBox.append(el("button", { class: cls, onclick: () => submit(r) },
      el("div", {}, RATING_LABEL[r]),
      el("div", { class: "small dim" }, pv?.[r] ?? ""),
    ));
  }
  card.append(rateBox);
  stage.append(card);

  showBtn.addEventListener("click", reveal);

  function reveal() {
    if (current?.revealed) return;
    current.revealed = true;
    back.classList.remove("hidden");
    showBtn.classList.add("hidden");
    rateBox.classList.remove("hidden");
  }
}

async function submit(rating) {
  if (!current || !current.revealed) return;
  const row = current.row;
  current = null;
  const updated = await rate(row, rating);
  session.done++;
  if (rating === Rating.Again) {
    session.again++;
    queue.push({ ...row, card: updated });   // 重来一次，用新状态
  }
  next();
}

main().catch((e) => { app.innerHTML = `<div class="empty">加载失败：${e.message}</div>`; });