// 05-curriculum.mjs —— 语法点 → 单元；按难度分塞词；两遍法挂例句（保证 R1 = 0 违例）
//
// 两遍法的关键：例句不按"属于哪个词"分配，而是按"最早能用在哪一课"分配。
//   tu(w) = 词 w 被教的单元序号
//   一句话的 requiredUnit = max(tu(句中所有词表词))
//   → 把句子放到 requiredUnit，则此后任何一课都不会出现生词，同时天然满足"螺旋复现"
import fs from "node:fs";
import path from "node:path";
import { buildSegmenter } from "./lib/tokenize.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");

const words = JSON.parse(fs.readFileSync(path.join(DATA, "words.json"), "utf8"));
const grammar = JSON.parse(fs.readFileSync(path.join(DATA, "grammar.json"), "utf8"));
const segment = buildSegmenter(words);
const byId = new Map(words.map((w) => [w.id, w]));

const LEVELS = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };
const KANJI = /[一-鿿々〆]/;
const CONFIG = {
  minSentenceLen: 5,
  levels: ["N5", "N4", "N3", "N2", "N1"],
  grammarPerUnit: 2,
  wordsPerUnit: 20,
  targetSentencesPerUnit: 24,
  maxSentenceLen: { 1: 22, 2: 28, 3: 34, 4: 40, 5: 46 },
  kanjiPerUnit: 15,
};

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ---------- 第一遍：单元骨架 + 词分配 ----------
const units = [];
// 全语料里每个词能命中多少句（含 Tatoeba）—— 用来决定同难度档内的先后
const sentFreq = new Map();
for (const w of words) if (w.sentences.length) sentFreq.set(w.id, (sentFreq.get(w.id) || 0) + w.sentences.length);
const extraPoolPath = path.join(DATA, "corpus-extra.json");
if (fs.existsSync(extraPoolPath)) {
  for (const s of JSON.parse(fs.readFileSync(extraPoolPath, "utf8"))) {
    for (const id of s.wordIds) sentFreq.set(id, (sentFreq.get(id) || 0) + 1);
  }
}

const tu = new Map(); // wordId → unitIndex(从 1 开始)
let seq = 0;

for (const level of CONFIG.levels) {
  const stage = LEVELS[level];
  const gChunks = chunk(grammar.filter((g) => g.level === level), CONFIG.grammarPerUnit);
  // 排序键：难度分；但"配不出例句"的词（语料里命中的句子 < 3）整体后置，
  // 否则第一课会全是五日/七日这类只出现在词表里、没有语料的词。
  const keyD = (w) => w.difficulty + ((sentFreq.get(w.id) ?? 0) < 3 ? 60 : 0);
  const pool = words
    .filter((w) => w.level === level)
    .sort((a, b) => keyD(a) - keyD(b) || (a.freqRank ?? 1e9) - (b.freqRank ?? 1e9));
  // 单元数取「语法点块数」与「词汇块数」的较大者：语法教完了就只剩词汇课
  const total = Math.max(gChunks.length, Math.ceil(pool.length / CONFIG.wordsPerUnit));
  const perUnit = Math.max(1, Math.ceil(pool.length / total));
  // 汉字预算：stage≤2 每课最多引入 15 个新汉字，超出的词顺延到下一课
  const taughtKanji = new Set();
  let pending = [...pool];

  for (let gi = 0; gi < total; gi++) {
    seq += 1;
    // 每个级别的前两课：在 10 分难度带内优先"例句资源多"的词，
    // 否则第一课会全是五日/七日这种几乎不出现在例句里的词
    if (gi < 1) {
      const band = (w) => Math.round(w.difficulty / 20);
      pending = [...pending].sort(
        (a, b) => band(a) - band(b) || (sentFreq.get(b.id) ?? 0) - (sentFreq.get(a.id) ?? 0) || a.difficulty - b.difficulty
      );
    }
    const newWords = [];
    const rest = [];
    for (const w of pending) {
      if (newWords.length >= perUnit) { rest.push(w); continue; }
      if (stage <= 2) {
        const fresh = [...new Set([...w.w].filter((c) => KANJI.test(c) && !taughtKanji.has(c)))];
        const wouldBe = new Set([...newWords.flatMap((x) => [...x.w].filter((c) => KANJI.test(c) && !taughtKanji.has(c))), ...fresh]);
        if (wouldBe.size > CONFIG.kanjiPerUnit) { rest.push(w); continue; }
      }
      newWords.push(w);
    }
    pending = rest;
    for (const w of newWords) {
      for (const c of w.w) if (KANJI.test(c)) taughtKanji.add(c);
      tu.set(w.id, seq);
    }
    const g = gChunks[gi] ?? [];
    units.push({
      index: seq,
      id: `u${String(seq).padStart(3, "0")}`,
      stage,
      level,
      grammar: g.map((x) => x.id),
      grammarPatterns: g.map((x) => x.pattern),
      newWordIds: newWords.map((w) => w.id),
      sentences: [],
    });
  }
}

// ---------- 第二遍：例句按"最早可用单元"归位 ----------
const globalKnown = new Set(tu.keys());
const seen = new Set();
// 候选池：牌组自带例句 + corpus-extra.json（Tatoeba）
const candidates = [];
for (const w of words) for (const s of w.sentences) candidates.push({ ...s, ownerId: w.id, src: "deck" });
const extraPath = path.join(DATA, "corpus-extra.json");
if (fs.existsSync(extraPath)) {
  for (const s of JSON.parse(fs.readFileSync(extraPath, "utf8"))) {
    candidates.push({ ja: s.ja, ruby: s.ruby, zh: s.zh, audio: null, ownerId: null, src: "tatoeba" });
  }
}
const dropped = { tooLong: 0, hasUnassignedWord: 0, duplicate: 0, beyondCurriculum: 0 };
const accepted = [];

for (const s of candidates) {
  {
    if (seen.has(s.ja)) { dropped.duplicate++; continue; }
    seen.add(s.ja);

    const toks = segment(s.ja);
    const wordToks = toks.filter((t) => t.kind === "word");
    if (!wordToks.length) { dropped.hasUnassignedWord++; continue; }
    if (wordToks.some((t) => !globalKnown.has(t.id))) { dropped.hasUnassignedWord++; continue; }

    const requiredUnit = Math.max(...wordToks.map((t) => tu.get(t.id)));
    const unit = units[requiredUnit - 1];
    if (!unit) { dropped.beyondCurriculum++; continue; }
    if ([...s.ja].length > (CONFIG.maxSentenceLen[unit.stage] ?? 30)) { dropped.tooLong++; continue; }
    if ([...s.ja].length < CONFIG.minSentenceLen) { dropped.tooShort = (dropped.tooShort || 0) + 1; continue; }

    accepted.push({
      req: requiredUnit,
      unit,
      sentence: {
        ja: s.ja,
        ruby: s.ruby,
        zh: s.zh,
        audio: s.audio,
        ownerId: s.ownerId,
        wordIds: [...new Set(wordToks.map((t) => t.id))],
        src: s.src,
        len: [...s.ja].length,
      },
    });
  }
}

// 贪心集合覆盖：每单元从"已经可用"的句子里挑，优先覆盖"还没在任何后置课里出现过的已学词"。
// 这一步直接优化 R4（螺旋复现），而不是单纯按 req 排队。
const buckets = new Map();
for (const c of accepted) {
  const arr = buckets.get(c.req) ?? [];
  arr.push(c);
  buckets.set(c.req, arr);
}

const reviewed = new Set();   // 已经在"教会之后的课"里出现过的词
const used = new Set();
const WINDOW = 9999;          // 候选不设时间窗：老句子留着能给旧词更多复现机会

for (const unit of units) {
  const k = unit.index;
  const pool = [];
  for (let r = Math.max(1, k - WINDOW); r <= k; r++) {
    for (const c of buckets.get(r) ?? []) if (!used.has(c.sentence.ja)) pool.push(c);
  }
  if (!pool.length) { unit.sentences = []; continue; }

  const score = (c) => {
    const s2 = c.sentence;
    let review = 0, fresh = 0;
    for (const id of s2.wordIds) {
      const t = tu.get(id);
      if (t === undefined) continue;
      if (t === k) fresh++;
      else if (!reviewed.has(id)) review++;
    }
    // 教学句（含本课新词）只留少量；主力是"能复习旧词"的句子
    const teaching = fresh > 0 ? -fresh * 4 : 0;

    return { c, fresh, review, score: review * 3 + teaching - s2.len * 0.02 };
  };
  const scored = pool.map(score);
  const takeList = [];
  const picked = new Set();

  // ① 先补教学句（最多 3 句）
  const teach = scored.filter((x) => x.fresh > 0).sort((x, y) => y.fresh - x.fresh || x.c.sentence.len - y.c.sentence.len);
  for (const x of teach) {
    if (takeList.length >= 3) break;
    takeList.push(x);
    picked.add(x.c.sentence.ja);
  }
  // ② 其余按复习价值填满
  const rest = scored.filter((x) => !picked.has(x.c.sentence.ja)).sort((x, y) => y.score - x.score);
  for (const x of rest) {
    if (takeList.length >= CONFIG.targetSentencesPerUnit) break;
    takeList.push(x);
    picked.add(x.c.sentence.ja);
  }

  unit.sentences = takeList.map((x) => x.c.sentence);
  for (const { c } of takeList) {
    used.add(c.sentence.ja);
    for (const id of c.sentence.wordIds) if ((tu.get(id) ?? Infinity) < k) reviewed.add(id);
  }
}
dropped.beyondCurriculum = accepted.length - used.size;

// ---------- 报告 ----------
const flat = units.flatMap((u) => u.sentences);
const byLevel = {};
for (const lv of CONFIG.levels) {
  const us = units.filter((u) => u.level === lv);
  byLevel[lv] = {
    units: us.length,
    sentences: us.reduce((n, u) => n + u.sentences.length, 0),
    emptyUnits: us.filter((u) => u.sentences.length === 0).map((u) => u.id),
    thinUnits: us.filter((u) => u.sentences.length > 0 && u.sentences.length < 3).length,
    avgSentences: +(us.reduce((n, u) => n + u.sentences.length, 0) / us.length).toFixed(2),
  };
}

const report = {
  config: CONFIG,
  units: units.length,
  wordsTaught: tu.size,
  sentences: {
    placed: flat.length,
    unique: new Set(flat.map((s) => s.ja)).length,
    rejected: dropped,
    perUnitAvg: +(flat.length / units.length).toFixed(2),
  },
  byLevel,
  // 复现：每个词被教的单元之后，它还在多少课里作为句中词出现
  spiral: (() => {
    const appear = new Map();
    for (const u of units) for (const s of u.sentences) for (const id of s.wordIds) {
      const arr = appear.get(id) ?? [];
      arr.push(u.index);
      appear.set(id, arr);
    }
    let later = 0, none = 0;
    for (const [id, unitIdx] of tu) {
      const laterCount = (appear.get(id) ?? []).filter((i) => i > unitIdx).length;
      if (laterCount > 0) later++;
      else none++;
    }
    return { wordsWithLaterReview: later, wordsWithout: none, rate: `${((later / tu.size) * 100).toFixed(1)}%` };
  })(),
  samples: units.slice(0, 3).map((u) => ({
    id: u.id,
    level: u.level,
    grammar: u.grammarPatterns,
    words: u.newWordIds.slice(0, 6).map((id) => byId.get(id).w),
    sentences: u.sentences.slice(0, 3).map((s) => ({ ja: s.ja, zh: s.zh, len: s.len })),
  })),
};

fs.writeFileSync(path.join(DATA, "units.json"), JSON.stringify(units));
fs.writeFileSync(path.join(DATA, "report-05-curriculum.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));