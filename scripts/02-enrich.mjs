// 02-enrich.mjs —— 用 OpenJLPT + kanjium 补强 words.json，并单独导出语法点与汉字表
// join 键：优先 (词形, 假名) 精确；退化为 (词形) 唯一命中；再做片假名→平假名归一化
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const OJ = path.join(ROOT, "raw/openjlpt/data/json");

const toHira = (s) => (s || "").replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const key = (w, r) => `${w}\u0000${toHira(r)}`;
const lvNum = (l) => (l ? Number(l[1]) : null);

// ---------- 读入上游 ----------
const words = JSON.parse(fs.readFileSync(path.join(DATA, "words.json"), "utf8"));

const ojlptVocab = [];
for (const lv of ["n5", "n4", "n3", "n2", "n1"]) {
  const file = path.join(OJ, "vocab", `${lv}.json`);
  if (fs.existsSync(file)) ojlptVocab.push(...JSON.parse(fs.readFileSync(file, "utf8")));
}
const grammar = [];
for (const lv of ["n5", "n4", "n3", "n2", "n1"]) {
  const file = path.join(OJ, "grammar", `${lv}.json`);
  if (fs.existsSync(file)) grammar.push(...JSON.parse(fs.readFileSync(file, "utf8")));
}
const kanji = [];
for (const lv of ["n5", "n4", "n3", "n2", "n1"]) {
  const file = path.join(OJ, "kanji", `${lv}.json`);
  if (fs.existsSync(file)) kanji.push(...JSON.parse(fs.readFileSync(file, "utf8")));
}

// ---------- 建索引 ----------
const clean = (w) => (w || "").replace(/^〜/, "").replace(/[（(].*?[）)]/g, "").trim();
const byKey = new Map();
const byWord = new Map();
const byClean = new Map();
for (const v of ojlptVocab) {
  byKey.set(key(v.word, v.reading), v);
  const arr = byWord.get(v.word) ?? [];
  arr.push(v);
  byWord.set(v.word, arr);
  const ck = clean(v.word);
  const carr = byClean.get(ck) ?? [];
  carr.push(v);
  byClean.set(ck, carr);
}

// ---------- 合并 ----------
const stat = { exact: 0, byWord: 0, byWordAmbiguous: 0, miss: 0, levelConflict: 0, pitchFilled: 0, pitchAlready: 0, pitchFilledList: [] };
const missSamples = [];
const conflicts = [];

for (const w of words) {
  let hit = byKey.get(key(w.w, w.r));

  if (!hit) {
    // 牌组里有 "〜やすい" "〜さん" 这类带波浪号的前后缀形，清洗后再试一次
    const cands = byWord.get(w.w) ?? byClean.get(clean(w.w));
    if (cands && cands.length === 1) { hit = cands[0]; stat.byWord++; }
    else if (cands && cands.length > 1) {
      // 同形多读音：用假名归一化再挑一次
      const picked = cands.filter((c) => toHira(c.reading) === toHira(w.r));
      if (picked.length === 1) { hit = picked[0]; stat.byWord++; }
      else { stat.byWordAmbiguous++; }
    }
  } else stat.exact++;

  if (!hit) {
    stat.miss++;
    if (missSamples.length < 15) missSamples.push(`${w.w}/${w.r} [${w.level}]`);
  }

  w.jmdictId = hit?.jmdict_id ?? null;
  w.romaji = hit?.romaji ?? null;
  w.ojlptLevel = hit?.level ?? null;
  w.en = hit?.meanings ?? null;

  // 级别交叉校验（牌组是真题向，OpenJLPT 是 Waller 表，允许 ±1 级差异）
  if (w.level && w.ojlptLevel) {
    const d = Math.abs(lvNum(w.level) - lvNum(w.ojlptLevel));
    if (d >= 2) {
      stat.levelConflict++;
      if (conflicts.length < 10) conflicts.push(`${w.w}/${w.r} deck=${w.level} ojlpt=${w.ojlptLevel}`);
    }
  }
}

// ---------- kanjium：音调补缺 ----------
const { DatabaseSync } = await (async () => {
  // node 22+ 内置 sqlite（node:sqlite），避免引第三方依赖
  try { return await import("node:sqlite"); }
  catch { return {}; }
})();

if (DatabaseSync) {
  const db = new DatabaseSync(path.join(ROOT, "raw/kanjium/data/kanjidb.sqlite"), { readOnly: true });
  const rows = db.prepare("select kanji, reading, annotated_acc, acc_pos from edict").all();
  const accMap = new Map();
  for (const r of rows) {
    if (!r.annotated_acc) continue;
    const k = key(r.kanji, r.reading);
    if (!accMap.has(k)) accMap.set(k, r);
  }
  for (const w of words) {
    const r = accMap.get(key(w.w, w.r));
    w.pitchKanjium = r?.annotated_acc ?? null;
    w.accPos = r?.acc_pos ? Number(r.acc_pos) : null;
    if (w.pitchKanjium && !w.pitch) { stat.pitchFilled++; if (stat.pitchFilledList.length < 10) stat.pitchFilledList.push(w.w); }
    else if (w.pitchKanjium) stat.pitchAlready++;
  }
  db.close();
}

// ---------- 导出语法点 / 汉字表 ----------
const grammarOut = grammar.map((g) => ({
  id: g.id,
  level: g.level,
  pattern: g.pattern,
  formation: g.formation ?? null,
  meaningEn: g.meaning ?? null,
  tags: g.tags ?? [],
  notes: g.notes ?? null,
  examples: (g.examples ?? []).map((e) => ({ ja: e.ja, furigana: e.furigana, en: e.en })),
}));

const kanjiOut = kanji.map((k) => ({
  c: k.character,
  level: k.level,
  strokes: k.strokes,
  grade: k.grade,
  freq: k.freq,
  radical: k.radical,
  onyomi: k.onyomi ?? [],
  kunyomi: k.kunyomi ?? [],
  meaningEn: k.meanings ?? [],
}));

fs.writeFileSync(path.join(DATA, "words.json"), JSON.stringify(words));
fs.writeFileSync(path.join(DATA, "grammar.json"), JSON.stringify(grammarOut));
fs.writeFileSync(path.join(DATA, "kanji.json"), JSON.stringify(kanjiOut));

const report = {
  words: words.length,
  ojlptVocab: ojlptVocab.length,
  join: {
    exact: stat.exact,
    byWord: stat.byWord,
    ambiguous: stat.byWordAmbiguous,
    miss: stat.miss,
    hitRate: `${(((stat.exact + stat.byWord) / words.length) * 100).toFixed(1)}%`,
    missSamples,
  },
  levelCrossCheck: { conflictsOver1: stat.levelConflict, samples: conflicts },
  pitch: {
    fromDeck: words.filter((w) => w.pitch).length,
    filledByKanjium: stat.pitchFilled,
    totalNow: words.filter((w) => w.pitch || w.pitchKanjium).length,
    overlap: stat.pitchAlready,
    note: "kanjium 音调仅覆盖高频词，缺口补不上（实测填充 0），只用于交叉校验",
  },
  grammar: { total: grammarOut.length, byLevel: countBy(grammarOut, "level") },
  kanji: { total: kanjiOut.length, byLevel: countBy(kanjiOut, "level") },
  sqliteAvailable: Boolean(DatabaseSync),
};

function countBy(arr, k) {
  const out = {};
  for (const x of arr) out[x[k]] = (out[x[k]] || 0) + 1;
  return out;
}

fs.writeFileSync(path.join(DATA, "report-02-enrich.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));