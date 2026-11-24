// 解析 Anki 牌组里的注音字段： 麻[マー]婆[ボー]茄子[なす]
// 特点：① 用 <b>…</b> 标出本词 ② 为了 ruby 渲染会在标记前后插空格
// 难点：base 里常混着前接假名（"また会[あ]い" / "お茶[おちゃ]"），
//       直接整块注音会把假名也盖上 ruby，所以要按「假名对齐」切分。

const KANJI = /[\u4e00-\u9fff\u3005\u3006\u30f6]/;
const KANA = /[\u3041-\u309f\u30a0-\u30ff]/;
const BOLD = /<\/?b>/g;
const PITCH_MARK = /[\u2460-\u2473\u24ea-\u24f4\u3251-\u325f\u32b1-\u32bf]/g;

const toHira = (s) => s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const isKanji = (c) => KANJI.test(c);
const isKana = (c) => KANA.test(c);
const splitChars = (s) => [...s];

/**
 * 把一个 base(可能混杂假名) + reading 对齐成 ruby 片段。
 * 返回 [base, reading|null][]，reading 为 null 表示不注音。
 */
export function align(base, reading) {
  const b = splitChars(base);
  const r = splitChars(reading);

  // 若 base 里没有汉字，整块不注音
  if (!b.some(isKanji)) return base ? [[base, null]] : [];

  let bi = 0, ri = 0;
  // ① 前接假名：与 reading 头部逐字对齐
  while (bi < b.length && ri < r.length && isKana(b[bi]) && toHira(b[bi]) === toHira(r[ri])) { bi++; ri++; }

  let bj = b.length, rj = r.length;
  // ② 送り仮名：与 reading 尾部逐字对齐
  while (bj > bi && rj > ri && isKana(b[bj - 1]) && toHira(b[bj - 1]) === toHira(r[rj - 1])) { bj--; rj--; }

  let midBase = b.slice(bi, bj).join("");
  let midRead = r.slice(ri, rj).join("");

  // ③ midBase 头部还残留假名（通常是前接假名没对上，如 "また会"+"あ"）
  let lead = "";
  while (midBase && !isKanji(midBase[0])) { lead += midBase[0]; midBase = midBase.slice(1); }

  const out = [];
  const head = b.slice(0, bi).join("") + lead;
  if (head) out.push([head, null]);
  if (midBase) out.push([midBase, midRead || null]);
  const tail = b.slice(bj).join("");
  if (tail) out.push([tail, null]);
  return out;
}

/**
 * @returns {{plain:string, ruby:[string,string|null][], bold:string|null}}
 */
export function parseFurigana(src) {
  if (!src) return { plain: "", ruby: [], bold: null };

  let bold = null;
  const m = src.match(/<b>\s*([\s\S]*?)\s*<\/b>/);
  if (m) bold = m[1].replace(BOLD, "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "");

  const body = src.replace(BOLD, "");
  const ruby = [];
  let plain = "";
  let last = 0;
  let hit;
  const re = /([^\[]+)\[([^\]]*)\]/g;

  while ((hit = re.exec(body))) {
    const rawBefore = body.slice(last, hit.index);
    const base = hit[1];
    // base 前面的裸文本（不含 base 本身）
    const glue = splitChars(base).filter((c) => !isKanji(c) && !isKana(c)).join("");
    const plainBefore = rawBefore + (glue ? "" : "");
    plain += plainBefore;

    // base 自身可能含标点，先把标点摘出去
    const punctLead = [];
    let b2 = base;
    while (b2 && !isKanji(b2[0]) && !isKana(b2[0])) { punctLead.push(b2[0]); b2 = b2.slice(1); }
    if (punctLead.length) plain += punctLead.join("");

    const segs = align(b2.replace(/\s+/g, ""), (hit[2] || "").replace(/\s+/g, ""));
    for (const [s, rd] of segs) {
      plain += s;
      if (rd !== null) ruby.push([s, rd]);
    }
    last = hit.index + hit[0].length;
  }
  plain += body.slice(last);

  plain = plain.replace(/\s+/g, "");
  return { plain, ruby, bold };
}

/** 去掉注音标记/空格后的纯文本，用于和原句比对 */
export function stripSpace(s) {
  return (s || "").replace(BOLD, "").replace(/\s+/g, "");
}

/** 去掉词性里的音调标记（"副①・自動3①・ナ形⓪" → "副・自動3・ナ形"） */
export function stripPitchMarks(s) {
  return (s || "").replace(PITCH_MARK, "");
}