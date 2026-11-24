// 分词器：动态规划全局最优切分（不是贪心最长匹配）
// 目标：让"未被词表覆盖的汉字"尽量少，其次让 token 数尽量少。
// 这样能避免「この世界」被切成 この世 + 界 这类"贪心留下的孤儿汉字"。
//
// 支持三种命中：
//   1) 词表精确命中（词形或读音）
//   2) 词干命中：取「词形去掉尾部假名」当词干，后面的假名串当作活用尾巴吃掉
//   3) 功能词（助詞/助動詞）与兜底单字

const MAXLEN = 8;
const MAX_STEMLEN = 4;
const KANJI = /[\u4e00-\u9fff\u3005\u3006\u30f6]/;
const KANA = /[\u3041-\u309f\u30a0-\u30ff]/;

const FUNC = new Set([
  "は", "が", "を", "に", "で", "と", "も", "の", "へ", "や", "か", "ね", "よ", "な", "ぞ", "ぜ", "わ",
  "から", "まで", "より", "など", "しか", "だけ", "ばかり", "ので", "のに", "けど", "けれど", "けれども",
  "たら", "なら", "ながら", "ても", "でも", "って", "ては", "では", "には", "とは", "のは", "のが",
  "です", "ます", "ました", "ません", "でした", "でしょう", "ましょう", "だろう", "らしい", "みたい",
  "だ", "だった", "れば", "させ", "られ", "せる", "れる", "たい", "たく", "そう", "よう",
  "し", "て", "た", "ない", "なく", "ず", "ぬ", "ば", "ろ", "せ", "れ", "き", "く", "い",
]);

const isKanji = (c) => KANJI.test(c);
const isKana = (c) => KANA.test(c);

export function buildSegmenter(words) {
  const exact = new Map();   // 词形/读音 → word
  const stems = new Map();   // 词干（去尾假名）→ word

  for (const w of words) {
    if (w.w) exact.set(w.w, w);
    if (w.r && w.r !== w.w && !exact.has(w.r)) exact.set(w.r, w);
  }
  for (const w of words) {
    // 只有动词/形容词才有"词干+活用尾巴"，名词硬拆会误配
    if (!(w.pos?.isVerb || w.pos?.adj)) continue;
    const stem = (w.w || "").replace(/[ぁ-ゖァ-ヶー]+$/, "");
    if (!stem || stem === w.w) continue;              // 无尾部假名：不需要词干
    if (![...stem].some(isKanji)) continue;
    if (exact.has(stem)) continue;                     // 词干本身就是词表词 → 交给精确命中
    if ([...stem].length > MAX_STEMLEN) continue;
    if (!stems.has(stem)) stems.set(stem, w);          // 同词干取先出现者
  }

  /** 返回 [{s, kind:'word'|'func'|'other', id?, w?}] */
  function segment(text) {
    const n = text.length;
    const cost = new Array(n + 1).fill(Infinity);
    const back = new Array(n + 1).fill(null);
    cost[0] = 0;

    const relax = (to, c, info) => {
      if (c < cost[to] - 1e-9) { cost[to] = c; back[to] = info; }
    };

    for (let i = 0; i < n; i++) {
      if (cost[i] === Infinity) continue;
      const base = cost[i];

      // 1) 精确命中
      for (let len = Math.min(MAXLEN, n - i); len >= 1; len--) {
        const cand = text.slice(i, i + len);
        const hit = exact.get(cand);
        if (hit) {
          // 1–2 字的纯假名"词"多半其实是助词，压低它的优先级
          const kanaOnly = /^[ぁ-ゖァ-ヶー]+$/.test(cand) && len <= 2;
          relax(i + len, base + (kanaOnly ? 0.15 : 0.01), { kind: "word", len, word: hit });
        }
      }

      // 2) 词干命中 + 吞掉后面的假名串
      for (let len = Math.min(MAX_STEMLEN, n - i); len >= 1; len--) {
        const hit = stems.get(text.slice(i, i + len));
        if (!hit) continue;
        let j = i + len;
        while (j < n && isKana(text[j]) && j - i < len + 5) j++;
        relax(j, base + 0.02 + 0.01 * (j - i - len), { kind: "word", len: j - i, word: hit });
      }

      // 3) 功能词
      for (let len = Math.min(4, n - i); len >= 1; len--) {
        if (FUNC.has(text.slice(i, i + len))) relax(i + len, base + 0.05, { kind: "func", len });
      }

      // 3b) 标点
      if (/[、。！？…「」『』（）・ー〜]/.test(text[i])) relax(i + 1, base + 0.01, { kind: "func", len: 1 });

      // 4) 兜底：单字（汉字代价高，避免留下孤儿汉字）
      const ch = text[i];
      relax(i + 1, base + (isKanji(ch) ? 10 : 0.2), { kind: "other", len: 1 });
    }

    // 回溯
    const out = [];
    let p = n;
    while (p > 0) {
      const info = back[p];
      if (!info) break;
      const start = p - info.len;
      const s = text.slice(start, p);
      if (info.kind === "word") {
        out.push({ s, kind: "word", id: info.word.id, w: info.word.w, level: info.word.level });
      } else {
        out.push({ s, kind: info.kind });
      }
      p = start;
    }
    out.reverse();
    return out;
  }

  return segment;
}

export const tokenizeUtils = { isKanji, isKana };