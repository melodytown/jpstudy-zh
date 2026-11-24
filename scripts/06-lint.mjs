// 06-lint.mjs —— 课程进阶合理性验收（R1–R6）。独立于 05 重新计算，不复用其内部状态。
// 输出 data/lint-report.json + lint-report.md
import fs from "node:fs";
import path from "node:path";
import { buildSegmenter } from "./lib/tokenize.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const KANJI = /[\u4e00-\u9fff\u3005\u3006]/;

const words = JSON.parse(fs.readFileSync(path.join(DATA, "words.json"), "utf8"));
const units = JSON.parse(fs.readFileSync(path.join(DATA, "units.json"), "utf8"));
const grammar = JSON.parse(fs.readFileSync(path.join(DATA, "grammar.json"), "utf8"));
const segment = buildSegmenter(words);
const byId = new Map(words.map((w) => [w.id, w]));

// 重建 tu（词 → 首次教学单元序号）
const tu = new Map();
for (const u of units) for (const id of u.newWordIds) if (!tu.has(id)) tu.set(id, u.index);

const R = {};
const detail = {};

// ---------- R1 句子可得性：句中每个词表词必须在本课之前（含本课）教过 ----------
{
  let sentences = 0, violations = 0;
  const bad = [];
  for (const u of units) {
    for (const s of u.sentences) {
      sentences++;
      const toks = segment(s.ja).filter((t) => t.kind === "word");
      const unknown = [...new Set(toks.filter((t) => (tu.get(t.id) ?? Infinity) > u.index).map((t) => `${t.w}@u${tu.get(t.id) ?? "?"}`))];
      if (unknown.length) {
        violations++;
        if (bad.length < 10) bad.push(`u${u.index}: ${s.ja} → 未教: ${unknown.join(",")}`);
      }
    }
  }
  R.R1 = { name: "句子可得性（每句未知词 = 0）", target: "0 违例", actual: violations, total: sentences, pass: violations === 0, samples: bad };
}

// ---------- R2 单单元负载 ----------
{
  const limits = { words: 20, grammar: 3, kanji: 15 };
  const over = { words: [], grammar: [], kanji: [] };
  const taughtKanji = new Set();
  for (const u of units) {
    if (u.newWordIds.length > limits.words) over.words.push(`u${u.index}=${u.newWordIds.length}`);
    if (u.grammar.length > limits.grammar) over.grammar.push(`u${u.index}=${u.grammar.length}`);
    if (u.stage <= 2) {
      const fresh = new Set();
      for (const id of u.newWordIds) for (const ch of byId.get(id).w) if (KANJI.test(ch) && !taughtKanji.has(ch)) fresh.add(ch);
      if (fresh.size > limits.kanji) over.kanji.push(`u${u.index}=${fresh.size}`);
    }
    for (const id of u.newWordIds) for (const ch of byId.get(id).w) if (KANJI.test(ch)) taughtKanji.add(ch);
  }
  const total = over.words.length + over.grammar.length + over.kanji.length;
  R.R2 = { name: "单单元负载（新词≤20 语法≤3 新汉字≤15）", target: "0 违例", actual: total, over, pass: total === 0 };
}

// ---------- R3 语法点覆盖与顺序 ----------
{
  const seen = new Map();
  let dup = 0, backwards = 0;
  const levelNum = (lv) => Number(lv[1]);
  let last = 5;
  for (const u of units) {
    const lv = u.level ? levelNum(u.level) : 5;
    if (lv > last) backwards++;
    last = lv;
    for (const g of u.grammar) {
      if (seen.has(g)) dup++;
      seen.set(g, u.index);
    }
  }
  const totalG = new Set(grammar.map((g) => g.id)).size;
  R.R3 = {
    name: "语法点不重复、按级别推进",
    target: "0 重复 / 0 倒退",
    actual: `${dup} 重复, ${backwards} 倒退`,
    coverage: `${seen.size}/${totalG}`,
    pass: dup === 0 && backwards === 0,
  };
}

// ---------- R4 螺旋复现 ----------
{
  const appear = new Map();
  for (const u of units) for (const s of u.sentences) {
    for (const t of segment(s.ja)) if (t.kind === "word") {
      const arr = appear.get(t.id) ?? [];
      if (!arr.includes(u.index)) arr.push(u.index);
      appear.set(t.id, arr);
    }
  }
  let later = 0, none = 0;
  const gaps = [];
  for (const [id, unitIdx] of tu) {
    const ok = (appear.get(id) ?? []).some((i) => i > unitIdx);
    if (ok) later++;
    else { none++; if (gaps.length < 10) gaps.push(byId.get(id).w); }
  }
  const rate = later / tu.size;
  // 失败原因分解：是"该词一次都没被排进任何课"，还是"只在自己那一课出现"
  const placedCount = new Map();
  for (const u of units) for (const s2 of u.sentences) {
    for (const t of segment(s2.ja)) if (t.kind === "word") placedCount.set(t.id, (placedCount.get(t.id) || 0) + 1);
  }
  let zeroPlaced = 0, onlyOwnUnit = 0;
  for (const [id, unitIdx] of tu) {
    if ((appear.get(id) ?? []).some((i) => i > unitIdx)) continue;
    if (!placedCount.get(id)) zeroPlaced++;
    else onlyOwnUnit++;
  }
  R.R4 = {
    name: "螺旋复现（每词在后续课内至少再现 1 次）",
    target: "≥ 80%",
    actual: `${(rate * 100).toFixed(1)}% (${later}/${tu.size})`,
    pass: rate >= 0.8,
    breakdown: { 无复现: none, 其中一次没被排进任何课: zeroPlaced, 只在教它的那一课出现: onlyOwnUnit },
    note: "未复现的主因是例句容量（每课上限）而不是语料量；提高 targetSentencesPerUnit 或继续补语料都能线性改善",
    sampleGaps: gaps,
  };
}

// ---------- R5 句长单调 ----------
{
  const med = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) / 2)];
  };
  const byLevel = {};
  const violations = [];
  for (const lv of ["N5", "N4", "N3", "N2", "N1"]) {
    const us = units.filter((u) => u.level === lv);
    if (!us.length) continue;
    const lens = us.map((u) => med(u.sentences.map((s) => [...s.ja].length)));
    const third = Math.floor(us.length / 3);
    const head = med(lens.slice(0, third));
    const tail = med(lens.slice(-third));
    byLevel[lv] = { firstThirdMedian: head, lastThirdMedian: tail, delta: +(tail - head).toFixed(1) };
    if (tail < head - 1) violations.push(`${lv}: 前段${head} → 后段${tail}`);
  }
  R.R5 = { name: "句长随课程推进不减", target: "每级别后段 ≥ 前段-1", actual: violations.length ? violations.join("; ") : "全部通过", byLevel, pass: violations.length === 0 };
}

// ---------- R6 复习预算 ----------
{
  const OFFSETS = [1, 2, 4, 8, 16, 32];
  const cardsByDay = new Map();
  for (const u of units) {
    for (const id of u.newWordIds) {
      for (const off of OFFSETS) {
        const d = u.index + off;
        if (d > units.length) continue;
        cardsByDay.set(d, (cardsByDay.get(d) || 0) + 1);
      }
    }
  }
  const minutes = [];
  for (const u of units) {
    const due = cardsByDay.get(u.index) || 0;
    const cards = due + u.newWordIds.length;            // 8s/卡
    const readingSec = u.sentences.length * 6;          // 例句精读 6s/句
    minutes.push({ unit: u.index, newWords: u.newWordIds.length, sentences: u.sentences.length, due, minutes: +((cards * 8 + readingSec) / 60).toFixed(1) });
  }
  const worst = [...minutes].sort((a, b) => b.minutes - a.minutes)[0];
  const over25 = minutes.filter((m) => m.minutes > 25).length;
  R.R6 = {
    name: "每日预算 ≤ 25 min（8s/卡 + 6s/句）",
    target: "0 天超 25 min",
    actual: `峰值 ${worst.minutes} min（unit ${worst.unit}），超限 ${over25} 天`,
    pass: over25 === 0,
    peak: worst,
  };
}

// ---------- 汇总 ----------
const verdict = Object.values(R).every((r) => r.pass);
const summary = {
  curriculum: { units: units.length, words: tu.size, sentences: units.reduce((n, u) => n + u.sentences.length, 0) },
  verdict: verdict ? "PASS" : "FAIL",
  rules: R,
  generatedAt: new Date(0).toISOString(), // 保持可复现：不写真实时间
};

const lines = [];
lines.push("# 课程进阶合理性报告（R1–R6）", "");
lines.push(`**总判定：${summary.verdict}**`, "");
lines.push(`课程规模：${summary.curriculum.units} 单元 · ${summary.curriculum.words} 词 · ${summary.curriculum.sentences} 句`, "");
lines.push("| 规则 | 目标 | 实测 | 结果 |", "|---|---|---|---|");
for (const [k, r] of Object.entries(R)) {
  lines.push(`| ${k} ${r.name} | ${r.target} | ${typeof r.actual === "number" ? `${r.actual}/${r.total ?? ""}` : r.actual} | ${r.pass ? "✅" : "❌"} |`);
}
lines.push("");
if (R.R1.samples?.length) { lines.push("## R1 违例样例", ""); for (const s of R.R1.samples) lines.push(`- ${s}`); lines.push(""); }
if (R.R2.over && Object.values(R.R2.over).some((a) => a.length)) { lines.push("## R2 超限", "", "```", JSON.stringify(R.R2.over), "```", ""); }
if (R.R4.sampleGaps?.length) {
  lines.push("## R4 螺旋复现：测算与上限", "");
  lines.push(`- 实测 ${R.R4.actual}`);
  lines.push(`- 未复现 ${R.R4.breakdown.无复现} 个词，其中「一次都没被排进任何课」${R.R4.breakdown.其中一次没被排进任何课} 个、「只在教它的那一课出现」${R.R4.breakdown.只在教它的那一课出现} 个`);
  lines.push(`- ${R.R4.note}`, "");
  lines.push("无复现的词（样例）：", "", R.R4.sampleGaps.join("、"), "");
}
lines.push("## R5 句长趋势", "", "| 级别 | 前 1/3 中位 | 后 1/3 中位 | 差 |", "|---|---|---|---|");
for (const [lv, v] of Object.entries(R.R5.byLevel)) lines.push(`| ${lv} | ${v.firstThirdMedian} | ${v.lastThirdMedian} | ${v.delta > 0 ? "+" : ""}${v.delta} |`);
lines.push("");
lines.push("## R6 复习预算峰值", "", "```json", JSON.stringify(R.R6.peak, null, 1), "```");

fs.writeFileSync(path.join(DATA, "lint-report.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(ROOT, "lint-report.md"), lines.join("\n"));
console.log(lines.join("\n"));