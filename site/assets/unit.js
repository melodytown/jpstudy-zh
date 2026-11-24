// 单元页：语法讲解 → 单词 → 精读 → 操练 → 完成本课
import { $, el, getJSON, qs, rubySpan, audioBtn, toast, speak, japaneseVoice } from "./lib.js";
import { ensureUnitCards, completedUnits } from "./srs.js";

const app = $("#app");

function sectionTitle(t, hint) {
  return el("h2", {}, t, hint ? el("span", { class: "dim small" }, `　${hint}`) : null);
}

function renderGrammar(g) {
  const card = el("div", { class: "card" });
  card.append(
    el("div", { class: "row" },
      el("strong", { class: "jp", style: "font-size:18px" }, g.pattern),
      g.formation ? el("span", { class: "badge" }, `接续：${g.formation}`) : null,
      ...(g.tags ?? []).map((t) => el("span", { class: "badge" }, t)),
    ),
  );
  if (g.zh) {
    if (g.zh.note) card.append(el("p", {}, g.zh.note));
    if (g.zh.counter?.length) {
      card.append(el("p", { class: "small" }, el("strong", {}, "反例/陷阱："), el("span", { class: "dim" }, g.zh.counter.join("；"))));
    }
  }
  if (g.meaningEn) card.append(el("p", { class: "dim small" }, g.meaningEn));
  for (const ex of g.examples ?? []) {
    card.append(el("div", { class: "sentence" },
      el("div", { class: "ja jp" }, ex.furigana ? el("span", { html: furiganaToRuby(ex.furigana) }) : ex.ja),
      ex.en ? el("div", { class: "zh" }, ex.en) : null,
    ));
  }
  return card;
}

// OpenJLPT 的注音格式：{漢字|かんじ}
function furiganaToRuby(s) {
  const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return esc(s).replace(/\{([^|{}]+)\|([^}]+)\}/g, "<ruby>$1<rt>$2</rt></ruby>");
}

function renderWord(w) {
  const row = el("div", { class: "word" },
    el("div", {},
      el("div", { class: "row", style: "gap:6px" },
        el("span", { class: "w jp" }, w.w),
        el("span", { class: "r" }, w.r),
        w.pitch ? el("span", { class: "small dim" }, w.pitch) : null,
        w.confusable ? el("span", { class: "badge warn", title: `中文直觉：${w.confusable.zh}` }, "⚠ 同形异义") : null,
      ),
      el("div", { class: "z" }, w.zh, el("span", { class: "dim small" }, `　${w.pos}`)),
    ),
    el("div", { class: "spacer" }),
    audioBtn(w.audio),
  );
  if (w.confusable) {
    row.append(el("div", { class: "small dim", style: "flex-basis:100%" },
      `日语义：${w.confusable.ja}　｜　中文陷阱：${w.confusable.zh}`));
  }
  return row;
}

function renderDrill(d, i) {
  const box = el("div", { class: "card drill" });
  const head = el("div", { class: "row" }, el("span", { class: "badge" }, `练习 ${i + 1}`));
  box.append(head);

  if (d.type === "conjugate") {
    box.append(
      el("div", { class: "jp", style: "font-size:17px;margin-top:4px" },
        d.prompt, el("span", { class: "dim small" }, `（${d.reading}）`), " → ", el("strong", {}, d.ask)),
    );
    const input = el("input", { class: "answer", placeholder: "写答案（汉字或假名都行）", style: "margin-top:8px" });
    const out = el("div", { class: "answer" });
    const check = () => {
      const v = input.value.trim();
      const ok = v && (v === d.answer || v === d.hint);
      out.textContent = "";
      out.append(ok ? el("span", { class: "badge ok" }, "✓ 正确") : el("span", { class: "badge warn" }, `✗ 正确答案：${d.answer}（${d.hint}）`));
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
    box.append(input, el("div", { class: "row", style: "margin-top:6px" }, el("button", { onclick: check }, "对答案")), out);
  }

  if (d.type === "particle") {
    box.append(el("div", { class: "jp", style: "font-size:17px;margin-top:4px" }, d.sentence));
    if (d.zh) box.append(el("div", { class: "dim small" }, d.zh));
    const opts = el("div", { class: "opts" });
    const out = el("div", { class: "answer" });
    for (const o of d.options) {
      opts.append(el("button", {
        onclick: (e) => {
          const ok = o === d.answer;
          e.target.classList.add(ok ? "right" : "wrong");
          if (!ok) [...opts.children].find((b) => b.textContent === d.answer)?.classList.add("right");
          out.textContent = ok ? "✓" : `✗ 正确：${d.answer}`;
        },
      }, o));
    }
    box.append(el("div", { class: "row", style: "margin-top:6px" }, "选一个助词："), opts, out);
  }

  if (d.type === "zh2ja") {
    box.append(el("div", { style: "margin-top:4px" }, d.zh));
    const ta = el("textarea", { rows: 2, placeholder: "试着翻译成日语", style: "margin-top:8px" });
    const out = el("div", { class: "answer hidden" });
    out.append(el("div", { class: "jp", style: "font-size:17px" }, rubySpan(d.ruby, "ja")));
    box.append(ta, el("div", { class: "row", style: "margin-top:6px" },
      el("button", { onclick: () => out.classList.remove("hidden") }, "看答案")));
    box.append(out);
  }
  return box;
}

async function main() {
  const id = qs("u") ?? "u001";
  const [unit, index, done] = await Promise.all([
    getJSON(`data/units/${id}.json`),
    getJSON("data/index.json"),
    completedUnits(),
  ]);
  const pos = index.findIndex((u) => u.id === id);
  const prev = index[pos - 1];
  const next = index[pos + 1];

  document.title = `${unit.id} · ${unit.grammar.map((g) => g.pattern).join(" / ")}`;
  app.textContent = "";

  // 头
  app.append(el("div", { class: "row" },
    el("h1", {}, `${unit.id}　`, el("span", { class: "badge" }, unit.level),
      done.has(unit.id) ? el("span", { class: "badge ok" }, "已完成") : null),
    el("div", { class: "spacer" }),
    prev ? el("a", { class: "btn", href: `unit.html?u=${prev.id}` }, "← 上一课") : null,
    next ? el("a", { class: "btn", href: `unit.html?u=${next.id}` }, "下一课 →") : null,
  ));
  app.append(el("div", { class: "dim small" },
    `语法 ${unit.grammar.length} 个 · 新词 ${unit.words.length} 个 · 例句 ${unit.sentences.length} 句`));

  // 单词
  app.append(sectionTitle("新词", `${unit.words.length} 个`));
  if (!unit.words.length) app.append(el("div", { class: "card dim" }, "本课没有新词，只做复习与阅读。"));
  const words = el("div", { class: "words" });
  for (const w of unit.words) words.append(renderWord(w));
  app.append(words);

  // 精读
  app.append(sectionTitle("精读", `${unit.sentences.length} 句`));
  const noAudio = unit.sentences.filter((s) => !s.audio).length;
  if (noAudio) {
    app.append(el("div", { class: "dim small" },
      "🔊 真人录音 · 🗣 系统语音朗读",
      japaneseVoice() ? "" : "（系统未装日语语音，🗣 会提示安装方法）"));
  }
  for (const s of unit.sentences) {
    app.append(el("div", { class: "sentence" },
      el("div", { class: "row" },
        rubySpan(s.ruby, "ja"),
        el("div", { class: "spacer" }),
        s.audio
          ? audioBtn(s.audio)
          : el("button", { class: "play", title: "用系统语音朗读", onclick: () => speak(s.ja) }, "🗣"),
        s.src === "tatoeba" ? el("span", { class: "badge" }, "Tatoeba") : null,
      ),
      el("div", { class: "zh" }, s.zh),
    ));
  }

  // 操练
  app.append(sectionTitle("操练", `${unit.drills.length} 题`));
  unit.drills.forEach((d, i) => app.append(renderDrill(d, i)));

  // 语法（放最后，可折叠：词汇/句子优先，语法按需查）
  const gDetails = el("details", { class: "card", id: "grammar-box" },
    el("summary", { style: "cursor:pointer;font-weight:600" },
      "语法参考",
      el("span", { class: "dim small" }, unit.grammar.length ? `　${unit.grammar.map((g) => g.pattern).join(" / ")}` : "　本课无新语法点")),
  );
  if (localStorage.getItem("grammarOpen") === "1") gDetails.open = true;
  gDetails.addEventListener("toggle", () => localStorage.setItem("grammarOpen", gDetails.open ? "1" : "0"));
  if (!unit.grammar.length) {
    gDetails.append(el("div", { class: "dim small", style: "margin-top:8px" }, "这一带的语法已经教完，剩下的是按难度推进的词汇课。"));
  } else {
    gDetails.append(el("div", { class: "dim small", style: "margin:6px 0" }, "扫一眼接续和反例就行，看不懂再回来细读。"));
    for (const g of unit.grammar) gDetails.append(renderGrammar(g));
  }
  app.append(gDetails);

  // 完成
  const btn = el("button", { class: "primary", style: "width:100%;padding:14px;font-size:16px" },
    done.has(unit.id) ? "已加入复习（点击重新加入无效）" : `完成本课，把这 ${unit.words.length} 个词加入复习`);
  if (done.has(unit.id)) btn.disabled = true;
  btn.addEventListener("click", async () => {
    const r = await ensureUnitCards(unit.id, unit.words.map((w) => w.id));
    btn.disabled = true;
    btn.textContent = r.existed ? "这一课已经在复习里了" : `已加入 ${r.added} 张卡片`;
    toast(r.existed ? "已存在" : `+${r.added} 张卡`);
  });
  app.append(el("div", { style: "margin-top:24px" }, btn));

  app.append(el("div", { class: "row", style: "margin-top:16px" },
    prev ? el("a", { class: "btn", href: `unit.html?u=${prev.id}` }, "← 上一课") : null,
    el("div", { class: "spacer" }),
    next ? el("a", { class: "btn primary", href: `unit.html?u=${next.id}` }, "下一课 →") : null,
  ));
}

main().catch((e) => { app.innerHTML = `<div class="empty">加载失败：${e.message}</div>`; });