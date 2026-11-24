// 把牌组的词性字符串解析成结构化标签。
// 牌组用「動1/動2/動3」表示动词三组：1=五段 2=一段 3=サ変/カ変（靠词形再区分）
// 也会用「自/他/自他」表示自他，和 イ形/ナ形/形動トタル 表示形容词。
import { stripPitchMarks } from "./furigana.mjs";

const VERB = /^(自他|自|他)?(動|補動)([123])?$/;

export function parsePos(raw) {
  const cleaned = stripPitchMarks(raw || "").replace(/\s+/g, "");
  const parts = cleaned.split("・").filter(Boolean);

  const classes = [];
  let verbGroup = null;
  let transit = null;
  let adj = null;
  let isNoun = false;
  let isVerb = false;

  for (const p of parts) {
    const vm = p.match(VERB);
    if (vm) {
      isVerb = true;
      const [, kind, head, num] = vm;
      if (head === "補動") classes.push("補動");
      else {
        classes.push("動");
        transit = kind || null;
      }
      if (num) verbGroup = Number(num);
      continue;
    }
    if (p === "イ形") { adj = "i"; classes.push("イ形"); continue; }
    if (p === "ナ形") { adj = "na"; classes.push("ナ形"); continue; }
    if (p === "形動トタル") { adj = "na-total"; classes.push("形動トタル"); continue; }
    if (p === "名") isNoun = true;
    classes.push(p);
  }

  return {
    raw: cleaned,
    classes,
    isVerb,
    isNoun,
    verbGroup,
    transit,
    adj,
  };
}