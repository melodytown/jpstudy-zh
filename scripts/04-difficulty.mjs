// 04-difficulty.mjs —— 难度分 D(0..100) + stage(1..5) + 中文母语者修正
// D = 40·jlptNorm + 25·freqScore + 15·formCost + 20·zhNorm
import fs from "node:fs";
import path from "node:path";
import { parseTsv } from "./lib/tsv.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const KANJI = /[\u4e00-\u9fff\u3005\u3006]/;

const words = JSON.parse(fs.readFileSync(path.join(DATA, "words.json"), "utf8"));
const kanji = JSON.parse(fs.readFileSync(path.join(DATA, "kanji.json"), "utf8"));

// ---------- 同形异义表 ----------
const confusable = new Map();
const confRows = parseTsv(fs.readFileSync(path.join(ROOT, "content/confusables.tsv"), "utf8"));
for (const r of confRows.slice(1)) {
  if (r[0]) confusable.set(r[0].trim(), { ja: r[1]?.trim(), zh: r[2]?.trim() });
}

// ---------- 词频归一化 ----------
// freqRank: JPDB 词频排名（越小越常见）；levelOrder: 牌组主观易→难序（0..1）
const ranks = words.map((w) => w.freqRank).filter((x) => x && x > 0);
const LOGMAX = Math.log(Math.max(...ranks) || 100000);
function freqScore(w) {
  if (w.freqRank) {
    const s = Math.log(w.freqRank) / LOGMAX; // 0=最常见 → 1=最罕见
    return Math.min(1, Math.max(0, s));
  }
  if (w.levelOrder !== null && w.levelOrder !== undefined) {
    // N5/N4 没有词频，用级别内主观序当代理（同级别内单调）
    return Math.min(1, w.levelOrder * 6); // 1.0001..1.0809 → 0.0006..0.485
  }
  return 0.55; // 兜底：中性
}

// N5→0, N4→0.25, N3→0.5, N2→0.75, N1→1
const jlptScale = (lv) => (lv ? 5 - Number(lv[1]) : 2.5) / 4;
// stage 是"课程阶段"，由语法点级别决定（阶段≈级别带），D 只负责阶段内排序
const STAGE = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };

// ---------- 形态成本 ----------
function formCost(w) {
  const kana = [...w.r];
  const n = kana.length;
  let c = Math.min(n / 8, 1) * 0.35;                      // 长度
  if (/[っゃゅょャュョー]/.test(w.r)) c += 0.2;            // 促音/拗音/长音
  if (/[\u30a1-\u30f6]/.test(w.w)) c += 0.2;               // 片假名（外来语）
  if (w.w === w.r) c += 0.15;                             // 无汉字（纯假名词）
  if (KANJI.test(w.w) && /[っん]/.test(w.r)) c += 0.1;     // 音便
  return Math.min(1, c);
}

// ---------- 中文母语者修正（负值=更容易） ----------
function zhDelta(w) {
  const kanjiCount = [...w.w].filter((c) => KANJI.test(c)).length;
  let raw = 0;
  const isKanaOnly = w.w === w.r;
  if (isKanaOnly) raw += 0.6;                             // 纯假名词最难
  else if (kanjiCount >= 2) raw -= 0.5;                   // 汉语词，可猜义
  else raw -= 0.15;                                        // 单汉字
  if (w.confusable) raw += 1.0;                            // 同形异义陷阱
  if (!w.pos.isVerb && !w.pos.adj && w.pos.isNoun && kanjiCount >= 2) raw -= 0.1; // 名词化的汉词最好记
  return raw; // 约 -0.75 .. +1.6
}
const zhNorm = (raw) => Math.min(1, Math.max(0, (raw + 0.75) / 2.35));

// ---------- 计算 ----------
const stageMatrix = {};
for (const w of words) {
  const conf = confusable.get(w.w);
  w.confusable = conf ? { ja: conf.ja, zh: conf.zh } : null;

  const parts = {
    jlpt: 40 * jlptScale(w.level),
    freq: 25 * freqScore(w),
    form: 15 * formCost(w),
    zh: 20 * zhNorm(zhDelta(w)),
  };
  const D = parts.jlpt + parts.freq + parts.form + parts.zh;
  w.difficulty = Math.round(D * 10) / 10;
  w.difficultyParts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  w.zhDeltaRaw = Math.round(zhDelta(w) * 100) / 100;
  w.stage = STAGE[w.level] ?? 3;

  const k = `s${w.stage}|${w.level ?? "?"}`;
  stageMatrix[k] = (stageMatrix[k] || 0) + 1;
}

// ---------- 报告 ----------
const byLevel = {};
for (const lv of ["N5", "N4", "N3", "N2", "N1"]) {
  const arr = words.filter((w) => w.level === lv).sort((a, b) => a.difficulty - b.difficulty);
  if (!arr.length) continue;
  const q = (p) => arr[Math.floor((arr.length - 1) * p)].difficulty;
  byLevel[lv] = {
    n: arr.length,
    min: arr[0].difficulty,
    p25: q(0.25),
    median: q(0.5),
    p75: q(0.75),
    max: arr[arr.length - 1].difficulty,
    stage: arr[0].stage,
    easiest: arr.slice(0, 5).map((w) => `${w.w}(${w.difficulty})`),
    hardest: arr.slice(-5).map((w) => `${w.w}(${w.difficulty})`),
  };
}

const matched = words.filter((w) => w.confusable).length;
const report = {
  confusables: { inTable: confusable.size, matchedWords: matched },
  difficultyByLevel: byLevel,
  stageMatrix: Object.fromEntries(Object.entries(stageMatrix).sort()),
  distribution: {
    stage1: words.filter((w) => w.stage === 1).length,
    stage2: words.filter((w) => w.stage === 2).length,
    stage3: words.filter((w) => w.stage === 3).length,
    stage4: words.filter((w) => w.stage === 4).length,
    stage5: words.filter((w) => w.stage === 5).length,
  },
  sample: ["手紙", "勉強", "会う", "ある", "取り扱い"].map((s) => {
    const w = words.find((x) => x.w === s);
    return w ? { w: w.w, D: w.difficulty, stage: w.stage, parts: w.difficultyParts, confusable: Boolean(w.confusable) } : null;
  }).filter(Boolean),
};

fs.writeFileSync(path.join(DATA, "words.json"), JSON.stringify(words));
fs.writeFileSync(path.join(DATA, "report-04-difficulty.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));