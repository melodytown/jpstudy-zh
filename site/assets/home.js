// 首页：课程目录 + 进度 + 今日复习
import { $, el, getJSON, toast } from "./lib.js";
import { stats, completedUnits, exportProgress, importProgress } from "./srs.js";

const app = $("#app");

const LEVEL_NAME = { N5: "N5 · 入门", N4: "N4 · 基础", N3: "N3 · 中级", N2: "N2 · 中上", N1: "N1 · 高级" };

async function main() {
  const [index, done, st] = await Promise.all([getJSON("data/index.json"), completedUnits(), stats()]);

  const next = index.find((u) => !done.has(u.id)) ?? index[0];
  app.textContent = "";

  const top = el("div", { class: "card" },
    el("div", { class: "row" },
      el("div", {},
        el("h1", {}, "继续学习"),
        el("div", { class: "dim small" },
          `已学 ${done.size}/${index.length} 课 · 卡片 ${st.total} 张（待复习 ${st.due} / 未学 ${st.fresh}）`),
      ),
      el("div", { class: "spacer" }),
      el("a", { class: "btn primary", href: `unit.html?u=${next.id}` }, `${next.id} ${next.g.join(" / ")}`),
    ),
    el("div", { class: "row", style: "margin-top:10px" },
      el("a", { class: "btn", href: "review.html" }, `去复习${st.due ? `（${st.due}）` : ""}`),
      el("a", { class: "btn", href: "kana.html" }, "五十音"),
      el("button", { onclick: () => backup() }, "导出进度"),
      el("button", { onclick: () => restore() }, "导入进度"),
    ),
  );
  app.append(top);

  for (const level of ["N5", "N4", "N3", "N2", "N1"]) {
    const us = index.filter((u) => u.level === level);
    if (!us.length) continue;
    const finished = us.filter((u) => done.has(u.id)).length;

    const section = el("section", {},
      el("h2", {}, `${LEVEL_NAME[level]}　`,
        el("span", { class: "dim small" }, `${finished}/${us.length} 课`)),
      el("progress", { value: finished, max: us.length }),
      el("div", { class: "grid units", style: "margin-top:12px" },
        us.map((u) =>
          el("a", { class: `unitcell${done.has(u.id) ? " done" : ""}`, href: `unit.html?u=${u.id}` },
            el("div", { class: "id" }, `${u.id}${done.has(u.id) ? " ✓" : ""}`),
            el("div", {}, u.g.join(" / ").slice(0, 40)),
            el("div", { class: "dim small" }, `${u.first}…`),
          ))),
    );
    app.append(section);
  }
}

async function backup() {
  const text = await exportProgress();
  const blob = new Blob([text], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `jpstudy-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  toast("已导出");
}

function restore() {
  const input = el("input", { type: "file", accept: "application/json" });
  input.addEventListener("change", async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const n = await importProgress(await f.text());
      toast(`导入 ${n} 张卡片`);
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      alert(`导入失败：${e.message}`);
    }
  });
  input.click();
}

main().catch((e) => { app.innerHTML = `<div class="empty">加载失败：${e.message}</div>`; });