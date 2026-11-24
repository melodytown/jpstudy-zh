// 04b-corpus.mjs —— 从 Tatoeba 补例句（jpn 句 + cmn 译文），只保留"词全在词表内"的句子
// 输出 data/corpus-extra.json；05-curriculum 会自动合并
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { buildSegmenter } from "./lib/tokenize.mjs";
import { parseFurigana, align } from "./lib/furigana.mjs";
import { readingOfSurface } from "./lib/conjugate.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const RAW = path.join(ROOT, "raw/tatoeba");

const words = JSON.parse(fs.readFileSync(path.join(DATA, "words.json"), "utf8"));
const segment = buildSegmenter(words);
const bySurface = new Map();
for (const w of words) {
  for (const key of [w.w, w.r]) if (key && !bySurface.has(key)) bySurface.set(key, w);
}

const bz = (f) => execSync(`bunzip2 -c "${path.join(RAW, f)}"`, { maxBuffer: 512 * 1024 * 1024 }).toString("utf8");

function loadSentences(file) {
  const map = new Map();
  for (const line of bz(file).split("\n")) {
    if (!line) continue;
    const [id, lang, text] = line.split("\t");
    if (text) map.set(id, text);
  }
  return map;
}

const jpn = loadSentences("jpn_sentences.tsv.bz2");
const cmn = loadSentences("cmn_sentences.tsv.bz2");

const pairs = [];
for (const line of bz("jpn-cmn_links.tsv.bz2").split("\n")) {
  if (!line) continue;
  const [j, c] = line.split("\t");
  const ja = jpn.get(j);
  const zh = cmn.get(c);
  if (ja && zh) pairs.push({ ja, zh });
}

// 注音：优先用词典里的原形读音，屈折形用活用器反查
function rubyFor(text) {
  const out = [];
  for (const t of segment(text)) {
    if (t.kind !== "word") {
      if (t.s.trim()) out.push([t.s, null]);
      continue;
    }
    const w = bySurface.get(t.s) ?? bySurface.get(t.w);
    const reading = w ? readingOfSurface(w, t.s) : null;
    if (w && reading && [...t.s].some((ch) => /[\u4e00-\u9fff\u3005\u3006]/.test(ch))) {
      for (const [base, rd] of align(t.s, reading)) out.push([base, rd]);
    } else {
      out.push([t.s, null]);
    }
  }
  return out;
}

const seen = new Set();
const accepted = [];
const reject = { tooLong: 0, tooShort: 0, fewWords: 0, unknownWord: 0, duplicate: 0 };
const unknownSamples = [];

for (const { ja, zh } of pairs) {
  const len = [...ja].length;
  if (len > 34) { reject.tooLong++; continue; }
  if (len < 5) { reject.tooShort++; continue; }
  if (seen.has(ja)) { reject.duplicate++; continue; }

  const toks = segment(ja);
  const wordToks = toks.filter((t) => t.kind === "word");
  if (wordToks.length < 2) { reject.fewWords++; continue; }
  const unknown = [...new Set(toks.filter((t) => t.kind === "word" && !t.id).map((t) => t.s))];
  const missing = [...new Set(toks.filter((t) => t.kind === "word" && !bySurface.has(t.s) && !t.id).map((t) => t.s))];
  // segment() 只返回命中的词；未命中的字会被切成 other，所以这里用"未命中汉字串"判断
  const kanjiOutsideDict = [...new Set([...ja].filter(() => false))]; // 占位，实际判断见下
  const unresolvedKanji = toks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.kind === "other" && /[\u4e00-\u9fff\u3005\u3006]/.test(t.s));
  if (unresolvedKanji.length) {
    reject.unknownWord++;
    if (unknownSamples.length < 12) unknownSamples.push(`${ja} → ${unresolvedKanji.map((x) => x.t.s).join("")}`);
    continue;
  }

  seen.add(ja);
  accepted.push({ ja, zh, ruby: rubyFor(ja), len, wordIds: [...new Set(wordToks.map((t) => t.id))], src: "tatoeba" });
}

const report = {
  pairs: pairs.length,
  accepted: accepted.length,
  reject,
  unknownSamples,
  lengthHist: (() => {
    const h = {};
    for (const s of accepted) {
      const b = s.len <= 10 ? "≤10" : s.len <= 16 ? "11-16" : s.len <= 24 ? "17-24" : "25-34";
      h[b] = (h[b] || 0) + 1;
    }
    return h;
  })(),
  sample: accepted.slice(0, 5).map((s) => ({ ja: s.ja, zh: s.zh, ruby: s.ruby.slice(0, 6), words: s.wordIds.length })),
};

fs.writeFileSync(path.join(DATA, "corpus-extra.json"), JSON.stringify(accepted));
fs.writeFileSync(path.join(DATA, "report-04b-corpus.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));