// 01-words.mjs —— 把牌组的 notes.csv 拆成 data/words.json
// 字段顺序来自上游仓库 scripts/diff_notes.py 的 FIELD_NAMES（官方定义，不是猜的）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseTsv } from "./lib/tsv.mjs";
import { parseFurigana, stripSpace } from "./lib/furigana.mjs";
import { parsePos } from "./lib/pos.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "raw/anki-jlpt-decks/deck-source/notes.csv");
const MEDIA = path.join(ROOT, "raw/anki-jlpt-decks/deck-source/medias");
const OUT_DIR = path.join(ROOT, "data");

const F = {
  notetype: 0, deck: 1, noteId: 2,
  kanji: 3, pitch: 4, pos: 5, furigana: 6,
  defSC: 7, defTC: 8, plus: 9, audio: 10,
  s1: 11, s2: 17, s3: 23, s4: 29,
  sort: 35, alt1: 36, alt2: 37, tags: 38,
};
const SENT_OFF = { kanji: 1, furigana: 2, defSC: 3, defTC: 4, audio: 5 };

const shortId = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
const sound = (v) => {
  const m = (v || "").match(/\[sound:([^\]]+)\]/);
  return m ? m[1] : null;
};

function parseTags(raw) {
  let level = null;
  let band = null;
  for (const t of (raw || "").split(/\s+/)) {
    for (const part of t.split("::")) {
      const lv = part.match(/^\d+-(N[1-5])$/);
      if (lv) level = lv[1];
      const bd = part.match(/^\d+-(高频|中频|低频)$/);
      if (bd && !band) band = bd[1];
    }
  }
  return { level, band };
}

// Sort 列有两种口径：
//   N5/N4  → "1.0001" … "1.0809"：level 前缀 + 作者主观易→难顺序
//   N3/N2/N1 → 整数：JPDB 词频排名（999999 = 无数据）
function parseSort(raw, level) {
  const v = (raw || "").trim();
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return { freqRank: n === 999999 ? null : n };
  }
  const m = v.match(/^(\d)\.(\d+)$/);
  if (m) {
    const levelDigit = Number(m[1]);
    const order = Number(`0.${m[2]}`);
    const expected = level ? 6 - Number(level[1]) : null; // N5→1, N4→2, N3→3 …
    return { levelOrder: order, sortAnomaly: expected !== null && expected !== levelDigit };
  }
  return {};
}

const text = fs.readFileSync(SRC, "utf8");
const rows = parseTsv(text);
const meta = rows.filter((r) => r.length === 1 && r[0].startsWith("#")).map((r) => r[0]);
const notes = rows.filter((r) => r.length > 1);
const badShape = notes.filter((r) => r.length !== 39);

const mediaSet = new Set(fs.existsSync(MEDIA) ? fs.readdirSync(MEDIA) : []);
const stat = {
  badShape: badShape.length,
  hasZh: 0, hasPitch: 0, hasAudio: 0, missingMedia: 0,
  sentCount: 0, sentHasZh: 0, sentHasAudio: 0, sentRuby: 0,
  furiganaMismatch: 0, noKanji: 0, sortAnomaly: 0,
  freqRank: 0, levelOrder: 0,
  byLevel: {}, byVerbGroup: {}, byAdj: {}, byTransit: {},
};
const sampleMismatch = [];

const words = [];
const seen = new Map();

for (const r of notes) {
  const kanji = (r[F.kanji] || "").trim();
  const reading = (r[F.furigana] || "").trim();
  const zh = (r[F.defSC] || "").trim();
  const { level, band } = parseTags(r[F.tags]);
  const audio = sound(r[F.audio]);
  const pos = parsePos(r[F.pos]);

  if (!kanji) stat.noKanji++;
  if (zh) stat.hasZh++;
  if ((r[F.pitch] || "").trim()) stat.hasPitch++;
  if (audio) { stat.hasAudio++; if (!mediaSet.has(audio)) stat.missingMedia++; }

  const sentences = [];
  for (const off of [F.s1, F.s2, F.s3, F.s4]) {
    const ja = (r[off + SENT_OFF.kanji] || "").trim();
    if (!ja) continue;
    const fy = parseFurigana(r[off + SENT_OFF.furigana] || "");
    const zhS = (r[off + SENT_OFF.defSC] || "").trim();
    const audioS = sound(r[off + SENT_OFF.audio]);

    if (fy.plain && stripSpace(ja) !== fy.plain) {
      stat.furiganaMismatch++;
      if (sampleMismatch.length < 5) sampleMismatch.push({ ja, plain: fy.plain, raw: r[off + SENT_OFF.furigana] });
    }
    if (fy.ruby.length) stat.sentRuby++;

    stat.sentCount++;
    if (zhS) stat.sentHasZh++;
    if (audioS) { stat.sentHasAudio++; if (!mediaSet.has(audioS)) stat.missingMedia++; }

    sentences.push({
      ja,
      plain: fy.plain,
      ruby: fy.ruby,
      bold: fy.bold,
      zh: zhS,
      zhTw: (r[off + SENT_OFF.defTC] || "").trim(),
      audio: audioS,
    });
  }

  const w = kanji || reading;
  const id = shortId(`${w}|${reading}`);
  stat.byLevel[level || "?"] = (stat.byLevel[level || "?"] || 0) + 1;
  if (pos.isVerb) stat.byVerbGroup[pos.verbGroup || "?"] = (stat.byVerbGroup[pos.verbGroup || "?"] || 0) + 1;
  if (pos.adj) stat.byAdj[pos.adj] = (stat.byAdj[pos.adj] || 0) + 1;
  if (pos.transit) stat.byTransit[pos.transit] = (stat.byTransit[pos.transit] || 0) + 1;

  if (seen.has(id)) { seen.get(id).dups++; continue; }
  seen.set(id, { dups: 0 });

  const sort = parseSort(r[F.sort], level);
  if (sort.freqRank) stat.freqRank++;
  if (sort.levelOrder !== undefined) stat.levelOrder++;
  if (sort.sortAnomaly) stat.sortAnomaly++;

  words.push({
    id,
    w,
    r: reading,
    pitch: (r[F.pitch] || "").trim() || null,
    pos,
    zh,
    zhTw: (r[F.defTC] || "").trim(),
    plus: (r[F.plus] || "").trim() || null,
    level,
    band,
    freqRank: sort.freqRank ?? null,
    levelOrder: sort.levelOrder ?? null,
    sortAnomaly: sort.sortAnomaly || false,
    audio,
    sentences,
  });
}

const dups = [...seen.values()].filter((v) => v.dups > 0).length;
const report = {
  source: "raw/anki-jlpt-decks/deck-source/notes.csv",
  meta,
  totalNotes: notes.length,
  totalWords: words.length,
  duplicateGroups: dups,
  badShapeRows: stat.badShape,
  byLevel: Object.fromEntries(Object.entries(stat.byLevel).sort()),
  byVerbGroup: stat.byVerbGroup,
  byAdj: stat.byAdj,
  byTransit: stat.byTransit,
  coverage: {
    zh: `${stat.hasZh}/${notes.length}`,
    pitch: `${stat.hasPitch}/${notes.length}`,
    wordAudio: `${stat.hasAudio}/${notes.length}`,
    sentences: stat.sentCount,
    sentencesWithRuby: stat.sentRuby,
    sentenceZh: `${stat.sentHasZh}/${stat.sentCount}`,
    sentenceAudio: `${stat.sentHasAudio}/${stat.sentCount}`,
    freqRank: stat.freqRank,
    levelOrder: stat.levelOrder,
  },
  quality: {
    furiganaRoundTripMismatch: stat.furiganaMismatch,
    mismatchSamples: sampleMismatch,
    missingMediaRefs: stat.missingMedia,
    emptyKanjiField: stat.noKanji,
    sortAnomaly: stat.sortAnomaly,
  },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "words.json"), JSON.stringify(words));
fs.writeFileSync(path.join(OUT_DIR, "report-01-words.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));