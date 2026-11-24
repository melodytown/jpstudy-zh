// 08-site.mjs —— 生成纯静态站点数据（无构建工具、无依赖）
// 产物：site/data/{index.json, words-lite.json, kana.json, units/uXXX.json} + site/media/*
import fs from "node:fs";
import path from "node:path";
import { conjugate, toSurface } from "./lib/conjugate.mjs";
import { buildSegmenter } from "./lib/tokenize.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const SITE = path.join(ROOT, "site");

const words = JSON.parse(fs.readFileSync(path.join(DATA, "words.json"), "utf8"));
const units = JSON.parse(fs.readFileSync(path.join(DATA, "units.json"), "utf8"));
const grammar = JSON.parse(fs.readFileSync(path.join(DATA, "grammar.json"), "utf8"));
// 中文讲解（人工/LLM 起草后审「接续」「反例」两栏）
const grammarZhPath = path.join(ROOT, "content/grammar-zh.json");
const grammarZh = fs.existsSync(grammarZhPath) ? JSON.parse(fs.readFileSync(grammarZhPath, "utf8")) : {};
const byId = new Map(words.map((w) => [w.id, w]));
const gById = new Map(grammar.map((g) => [g.id, g]));
const segment = buildSegmenter(words);

const OUT = path.join(SITE, "data");
// 07 只打包指定 stage 的音频；08 反过来只暴露真实存在的文件，
// 否则 N4–N1 的单元页会挂一堆点了没声音的喇叭。
const MEDIA_SRC = path.join(ROOT, "public/media");
const haveMedia = fs.existsSync(MEDIA_SRC) ? new Set(fs.readdirSync(MEDIA_SRC)) : null;
if (!haveMedia) console.warn("警告：public/media 不存在，音频字段原样保留（先跑 npm run media）");
const audioOf = (f) => (f && haveMedia && !haveMedia.has(f) ? null : f ?? null);
// 纯假名句子没有 ruby 段 → 用整句兜底，前端统一渲染
const fixRuby = (ruby, ja) => (Array.isArray(ruby) && ruby.length ? ruby : [[ja, null]]);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "units"), { recursive: true });

// ---------- 五十音 ----------
const V = "あいうえお";
const rows = [
  ["", "あいうえお"],
  ["k", "かきくけこ"],
  ["s", "さしすせそ"],
  ["t", "たちつてと"],
  ["n", "なにぬねの"],
  ["h", "はひふへほ"],
  ["m", "まみむめも"],
  ["y", "やゆよ"],
  ["r", "らりるれろ"],
  ["w", "わを"],
  ["n'", "ん"],
];
const ROMAJI_FIX = {
  し: "shi", ち: "chi", つ: "tsu", ふ: "fu", じ: "ji", ぢ: "ji", づ: "zu", を: "o", ん: "n",
  ゃ: "ya", ゅ: "yu", ょ: "yo",
};
const VOWEL = { あ: "a", い: "i", う: "u", え: "e", お: "o" };
function romaji(ch, cons) {
  if (ROMAJI_FIX[ch]) return ROMAJI_FIX[ch];
  const v = VOWEL[ch];
  return v ? cons + v : cons + "i";
}
const DAKU = { か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご", さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ", た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど", は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ" };
const HANDAKU = { は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ" };
const toKata = (s) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

const kana = [];
const push = (group, hira, roma) => kana.push({ group, hira, kata: toKata(hira), roma });

for (const [cons, chars] of rows) for (const ch of chars) push("清音", ch, romaji(ch, cons));
for (const [k, v] of Object.entries(DAKU)) push("濁音", v, romaji(k, k === "し" ? "j" : "g"));
// 浊音罗马字按行修正
for (const k of kana.filter((x) => x.group === "濁音")) {
  const base = Object.entries(DAKU).find(([, v]) => v === k.hira)?.[0];
  const line = "かさたは".includes(base) ? base : null;
  const cons = { か: "g", さ: "z", た: "d", は: "b" }[line] ?? "g";
  k.roma = romaji(base, cons);
}
for (const [k, v] of Object.entries(HANDAKU)) push("半濁音", v, romaji(k, "p"));
const YOUON = ["き", "し", "ち", "に", "ひ", "み", "り", "ぎ", "じ", "び", "ぴ"];
const YOUON_ROMA = { き: "ky", し: "sh", ち: "ch", に: "ny", ひ: "hy", み: "my", り: "ry", ぎ: "gy", じ: "j", び: "by", ぴ: "py" };
for (const base of YOUON) for (const small of "ゃゅょ") push("拗音", base + small, YOUON_ROMA[base] + { ゃ: "a", ゅ: "u", ょ: "o" }[small]);
fs.writeFileSync(path.join(OUT, "kana.json"), JSON.stringify(kana));

// ---------- 词表精简版（点击查词用） ----------
const wordsLite = words.map((w) => ({
  i: w.id, w: w.w, r: w.r, z: w.zh, p: w.pitch, a: w.audio, l: w.level,
  k: w.pos?.isVerb ? `v${w.pos.verbGroup ?? ""}` : w.pos?.adj ? `adj-${w.pos.adj}` : w.pos?.isNoun ? "n" : "",
  d: w.difficulty,
}));
fs.writeFileSync(path.join(OUT, "words-lite.json"), JSON.stringify(wordsLite));

// ---------- 操练题 ----------
const FORM_ASK = [
  ["plain_polite", "ます形"],
  ["te_form", "て形"],
  ["past", "た形"],
  ["plain_neg", "ない形"],
  ["potential", "可能形"],
  ["passive", "受身形"],
  ["causative", "使役形"],
  ["volitional", "意志形"],
  ["provisional", "仮定形（〜ば）"],
];
const PARTICLES = new Set(["は", "が", "を", "に", "で", "と", "も", "の", "へ", "や", "から", "まで", "より"]);

function buildDrills(unit) {
  const drills = [];
  const ws = unit.newWordIds.map((id) => byId.get(id)).filter(Boolean);

  // 1) 活用题
  let n = 0;
  for (const w of ws) {
    if (n >= 5) break;
    if (!w.pos?.isVerb && w.pos?.adj !== "i") continue;
    const group = w.pos.isVerb ? (w.pos.verbGroup === 1 ? "g5" : w.pos.verbGroup === 2 ? "g1" : "vs") : "adji";
    const forms = conjugate(w.r, group);
    const options = FORM_ASK.filter(([k]) => forms[k]?.length);
    if (!options.length) continue;
    const [key, label] = options[(unit.index + n) % options.length];
    const reading = forms[key][0];
    const surface = toSurface(w.w, w.r, reading) ?? reading;
    drills.push({ type: "conjugate", prompt: w.w, reading: w.r, ask: label, answer: surface, hint: reading, pos: w.pos.raw });
    n++;
  }

  // 2) 助词填空题（只用本课及以前的句子，保证认识每个词）
  let m = 0;
  for (const s of unit.sentences) {
    if (m >= 4) break;
    const toks = segment(s.ja);
    const idx = toks.findIndex((t) => t.kind === "func" && PARTICLES.has(t.s));
    if (idx < 0) continue;
    const target = toks[idx].s;
    let pos = 0;
    for (let i = 0; i < idx; i++) pos += toks[i].s.length;
    const blanked = s.ja.slice(0, pos) + "（　）" + s.ja.slice(pos + target.length);
    const pool = [...PARTICLES].filter((p) => p !== target).sort(() => 0.5 - Math.random()).slice(0, 3);
    drills.push({
      type: "particle",
      sentence: blanked,
      ruby: fixRuby(s.ruby, s.ja),
      options: [target, ...pool].sort(() => 0.5 - Math.random()),
      answer: target,
      zh: s.zh,
    });
    m++;
  }

  // 3) 中译日（自评）
  for (const s of unit.sentences.slice(0, 4)) {
    drills.push({ type: "zh2ja", zh: s.zh, ja: s.ja, ruby: fixRuby(s.ruby, s.ja) });
  }
  return drills;
}

// ---------- 单元页数据 ----------
const index = [];
const MAX_SENT_WORDS = 900;

for (const u of units) {
  const ws = u.newWordIds.map((id) => byId.get(id)).filter(Boolean);
  const sentences = u.sentences.slice(0, 30).map((s) => ({
    ja: s.ja, ruby: fixRuby(s.ruby, s.ja), zh: s.zh, audio: audioOf(s.audio), src: s.src ?? "deck",
  }));

  const unitData = {
    id: u.id,
    index: u.index,
    level: u.level,
    stage: u.stage,
    grammar: u.grammar.map((gid) => {
      const g = gById.get(gid);
      if (!g) return null;
      return {
        id: g.id, pattern: g.pattern, formation: g.formation, meaningEn: g.meaningEn,
        tags: g.tags, notes: g.notes,
        examples: (g.examples ?? []).slice(0, 3).map((e) => ({ ja: e.ja, furigana: e.furigana, en: e.en })),
        zh: grammarZh[g.id] ?? null,
      };
    }).filter(Boolean),
    words: ws.map((w) => ({
      id: w.id, w: w.w, r: w.r, zh: w.zh, pitch: w.pitch, audio: audioOf(w.audio),
      pos: w.pos.raw, d: w.difficulty, confusable: w.confusable ?? null,
      ex: (w.sentences ?? []).slice(0, 2).map((s) => ({ ja: s.ja, ruby: fixRuby(s.ruby, s.ja), zh: s.zh, audio: audioOf(s.audio) })),
    })),
    sentences,
    drills: buildDrills(u),
  };

  fs.writeFileSync(path.join(OUT, "units", `${u.id}.json`), JSON.stringify(unitData));

  index.push({
    id: u.id, level: u.level, stage: u.stage, n: u.index,
    g: u.grammarPatterns, wc: ws.length, sc: sentences.length,
    first: ws.slice(0, 3).map((w) => w.w).join("・"),
  });
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));

// ---------- 媒体 ----------
const mediaSrc = path.join(ROOT, "public/media");
const mediaDst = path.join(SITE, "media");
if (fs.existsSync(mediaSrc)) {
  fs.rmSync(mediaDst, { recursive: true, force: true });
  fs.cpSync(mediaSrc, mediaDst, { recursive: true });
}

const totalBytes = fs.readdirSync(path.join(OUT, "units")).reduce(
  (n, f) => n + fs.statSync(path.join(OUT, "units", f)).size, 0);
console.log(JSON.stringify({
  grammarWithZh: units.reduce((n, u) => n + u.grammar.filter((id) => grammarZh[id]).length, 0),
  kana: kana.length,
  wordsLite: `${(fs.statSync(path.join(OUT, "words-lite.json")).size / 1024 / 1024).toFixed(1)}MB`,
  units: index.length,
  unitJsonAvgKB: +(totalBytes / index.length / 1024).toFixed(1),
  drillsTotal: units.reduce((n, u) => n + buildDrillsCount(u), 0),
  mediaCopied: fs.existsSync(mediaDst),
}, null, 2));

function buildDrillsCount(u) {
  const ws = u.newWordIds.map((id) => byId.get(id)).filter(Boolean);
  return Math.min(5, ws.filter((w) => w.pos?.isVerb || w.pos?.adj === "i").length) + Math.min(4, u.sentences.length) + Math.min(4, u.sentences.length);
}