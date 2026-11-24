// 活用器：给定「读音 + 组别」，产出 ~66 个形态的读音（每形态可多个并存形）。
// 组别：g5=五段 g1=一段 vs=サ変(suru) vz=ずる vk=カ変(kuru) adji=イ形 adjna=ナ形
// 设计原则：只吃平假名读音；汉字表层用「尾替换」从读音反推（见 toSurface）。

const ROW = {
  u: [..."うくぐすつぬぶむる"],
  i: [..."いきぎしちにびみり"],
  a: [..."わかがさたなばまら"],
  e: [..."えけげせてねべめれ"],
  o: [..."おこごそとのぼもろ"],
};
const idx = (ch) => ROW.u.indexOf(ch);
const to = (ch, row) => (idx(ch) < 0 ? null : ROW[row][idx(ch)]);

const TE = { う: "って", つ: "って", る: "って", む: "んで", ぬ: "んで", ぶ: "んで", く: "いて", ぐ: "いで", す: "して" };

// 有连用形特例的五段动词（读音尾 3 字内匹配）
const G5_IRREGULAR = {
  いく: { masu: "き", te: "って", ta: "った" },
  ゆく: { masu: "き", te: "って", ta: "った" },
  ある: {
    // ある 的否定形是硬替换（ない/なかった/なくて…），其他形态仍用 あら-
    aStem: "あら",
    neg: "ない",
    override: {
      past_neg: ["なかった"],
      te_form_neg: ["なくて", "ないで"],
      conditional_neg: ["なかったら"],
      provisional_neg: ["なければ"],
      imperative_neg_polite: ["ないでください"],
      adverbial: ["なく"],
    },
  },
  くださる: {
    masu: "い",
    imper: "ください",
    override: {
      imperative_polite: ["くださいます"],
      imperative_neg: ["くださいな"],
      imperative_neg_polite: ["くださないでください"],
    },
  },
  おっしゃる: { masu: "い" },
  いらっしゃる: { masu: "い" },
  なさる: { masu: "い" },
  ござる: { masu: "い" },
  とう: { masu: "い", te: "うて", ta: "うた" },
  こう: { masu: "い", te: "うて", ta: "うた" },
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/** 把一组基础形展开成 8 个派生形态（对应 kanjium 的 8 列命名） */
function expand(prefix, bases) {
  // 派生基形（られる/させる/せる/れる）都是一段动词，后接形态要先去 る
  const suffixes = ["", "ます", "ない", "ません", "た", "ました", "なかった", "ませんでした"];
  const keys = ["", "_polite", "_neg", "_neg_polite", "_past", "_past_polite", "_neg_past", "_neg_past_polite"];
  const out = {};
  const stems = bases.map((b) => (b.endsWith("る") ? b.slice(0, -1) : b));
  for (let i = 0; i < suffixes.length; i++) {
    out[prefix + keys[i]] = uniq(bases.map((b, k) => (i === 0 ? b : stems[k] + suffixes[i])));
  }
  return out;
}

export function conjugate(reading, group) {
  const r = reading;
  const out = {};

  if (group === "g5" || group === "v5i") {
    const stem = r.slice(0, -1);
    const last = r.slice(-1);
    const irr = G5_IRREGULAR[r] ?? {};
    const iStem = irr.masu ? stem + irr.masu : stem + to(last, "i");
    const aStem = stem + to(last, "a");
    const eStem = stem + to(last, "e");
    const oStem = stem + to(last, "o");
    const te = irr.te ? stem + irr.te : stem + TE[last];
    const ta = irr.ta ? stem + irr.ta : te.replace(/て$/, "た").replace(/で$/, "だ");
    const aStemX = irr.aStem ?? aStem;
    const neg = irr.neg ?? aStemX + "ない";

    out.plain = [r];
    out.plain_polite = [iStem + "ます"];
    out.plain_neg = [neg];
    out.plain_neg_polite = [iStem + "ません"];
    out.nu_form = [aStemX + "ぬ"];
    out.mu_form = [aStemX + "む", aStemX + "ん"];
    out.past = [ta];
    out.past_polite = [iStem + "ました"];
    out.past_neg = [aStemX + "なかった"];
    out.past_neg_polite = [iStem + "ませんでした"];
    out.te_form = [te];
    out.te_form_polite = [iStem + "まして"];
    out.te_form_neg = [aStemX + "なくて", aStemX + "ないで"];
    out.te_form_neg_polite = [iStem + "ませんで"];
    out.zu_form = [aStemX + "ず", aStemX + "ずに"];
    out.conditional = [ta + "ら"];
    out.conditional_polite = [iStem + "ましたら"];
    out.conditional_neg = [aStemX + "なかったら"];
    out.conditional_neg_polite = [iStem + "ませんでしたら"];
    out.provisional = [eStem + "ば"];
    out.provisional_polite = [iStem + "ますれば", iStem + "ませば", iStem + "れば"];
    out.provisional_neg = [aStemX + "なければ"];
    out.provisional_neg_polite = [iStem + "ませんなら"];
    out.volitional = [oStem + "う"];
    out.volitional_polite = [iStem + "ましょう"];
    out.volitional_neg = [r + "まい"];
    out.volitional_neg_polite = [iStem + "ますまい"];
    out.imperative = [irr.imper ?? eStem];
    out.imperative_polite = [iStem + "なさい", te + "ください"];
    out.imperative_neg = [r + "な"];
    out.imperative_neg_polite = [aStemX + "ないでください"];
    Object.assign(out, expand("potential", [eStem + "る"]));
    Object.assign(out, expand("passive", [aStemX + "れる"]));
    Object.assign(out, expand("causative", [aStemX + "せる"]));
    Object.assign(out, expand("caus_passive", [aStemX + "せられる", aStemX + "される"]));
    out.adverbial = [aStemX + "なく"];
    out.nominalization = [iStem];
    if (irr.override) Object.assign(out, irr.override);
    return out;
  }

  if (group === "g1") {
    const stem = r.slice(0, -1);
    const aStemX = stem;
    out.plain = [r];
    out.plain_polite = [stem + "ます"];
    out.plain_neg = [stem + "ない"];
    out.plain_neg_polite = [stem + "ません"];
    out.nu_form = [stem + "ぬ"];
    out.mu_form = [stem + "む", stem + "ん"];
    out.past = [stem + "た"];
    out.past_polite = [stem + "ました"];
    out.past_neg = [stem + "なかった"];
    out.past_neg_polite = [stem + "ませんでした"];
    out.te_form = [stem + "て"];
    out.te_form_polite = [stem + "まして"];
    out.te_form_neg = [stem + "なくて", stem + "ないで"];
    out.te_form_neg_polite = [stem + "ませんで"];
    out.zu_form = [stem + "ず", stem + "ずに"];
    out.conditional = [stem + "たら"];
    out.conditional_polite = [stem + "ましたら"];
    out.conditional_neg = [stem + "なかったら"];
    out.conditional_neg_polite = [stem + "ませんでしたら"];
    out.provisional = [stem + "れば"];
    out.provisional_polite = [stem + "ませば", stem + "れば"];
    out.provisional_neg = [stem + "なければ"];
    out.provisional_neg_polite = [stem + "ませんなら"];
    out.volitional = [stem + "よう"];
    out.volitional_polite = [stem + "ましょう"];
    out.volitional_neg = [stem + "まい", r + "まい"];
    out.volitional_neg_polite = [stem + "ますまい"];
    out.imperative = [stem + "ろ", stem + "よ"];
    out.imperative_polite = [stem + "よ", stem + "なさい", stem + "てください"];
    out.imperative_neg = [r + "な"];
    out.imperative_neg_polite = [stem + "ないでください"];
    Object.assign(out, expand("potential", [stem + "られる"]));
    Object.assign(out, expand("passive", [stem + "られる"]));
    Object.assign(out, expand("causative", [stem + "させる"]));
    Object.assign(out, expand("caus_passive", [stem + "させられる"]));
    out.adverbial = [stem + "なく"];
    out.nominalization = [stem];
    return out;
  }

  if (group === "vs") {
    // する / 名词+する
    const base = r.endsWith("する") ? r.slice(0, -2) : r;
    const s = base + "し";
    out.plain = [base + "する"];
    out.plain_polite = [s + "ます"];
    out.plain_neg = [base + "さない", s + "ない"];
    out.plain_neg_polite = [s + "ません"];
    out.nu_form = [base + "さぬ", base + "せぬ", s + "ぬ"];
    out.mu_form = [base + "さむ", base + "さん", base + "せむ", base + "せん", s + "む", s + "ん"];
    out.past = [s + "た"];
    out.past_polite = [s + "ました"];
    out.past_neg = [base + "さなかった", s + "なかった"];
    out.past_neg_polite = [s + "ませんでした"];
    out.te_form = [s + "て"];
    out.te_form_polite = [s + "まして"];
    out.te_form_neg = [base + "さなくて", base + "さないで", s + "なくて", s + "ないで"];
    out.te_form_neg_polite = [s + "ませんで"];
    out.zu_form = [base + "さず", base + "さずに", base + "せず", base + "せずに", s + "ず", s + "ずに"];
    out.conditional = [s + "たら"];
    out.conditional_polite = [s + "ましたら"];
    out.conditional_neg = [base + "さなかったら", s + "なかったら"];
    out.conditional_neg_polite = [s + "ませんでしたら"];
    out.provisional = [base + "すれば", base + "せば", s + "れば"];
    out.provisional_polite = [s + "ませば", s + "れば"];
    out.provisional_neg = [base + "さなければ", s + "なければ"];
    out.provisional_neg_polite = [s + "ませんなら"];
    out.volitional = [base + "そう", s + "よう"];
    out.volitional_polite = [s + "ましょう"];
    out.volitional_neg = [base + "すまい", base + "するまい"];
    out.volitional_neg_polite = [s + "ますまい"];
    out.imperative = [base + "せ", s + "ろ", base + "せよ"];
    out.imperative_polite = [base + "せよ", s + "なさい", s + "てください"];
    out.imperative_neg = [base + "するな"];
    out.imperative_neg_polite = [base + "さないでください", s + "ないでください"];
    Object.assign(out, expand("potential", [base + "できる", base + "せる"]));
    Object.assign(out, expand("passive", [base + "される"]));
    Object.assign(out, expand("causative", [base + "させる"]));
    Object.assign(out, expand("caus_passive", [base + "させられる"]));
    out.adverbial = [base + "さなく", s + "なく"];
    out.nominalization = [s];
    return out;
  }

  if (group === "vz") {
    // 信ずる 型
    const base = r.endsWith("ずる") ? r.slice(0, -2) : r;
    const j = base + "じ";
    out.plain = [base + "ずる"];
    out.plain_polite = [j + "ます"];
    out.plain_neg = [j + "ない"];
    out.plain_neg_polite = [j + "ません"];
    out.nu_form = [base + "ぜぬ", j + "ぬ"];
    out.mu_form = [base + "ぜむ", base + "ぜん", j + "む", j + "ん"];
    out.past = [j + "た"];
    out.past_polite = [j + "ました"];
    out.past_neg = [j + "なかった"];
    out.past_neg_polite = [j + "ませんでした"];
    out.te_form = [j + "て"];
    out.te_form_polite = [j + "まして"];
    out.te_form_neg = [j + "なくて", j + "ないで"];
    out.te_form_neg_polite = [j + "ませんで"];
    out.zu_form = [base + "ぜず", base + "ぜずに", j + "ず", j + "ずに"];
    out.conditional = [j + "たら"];
    out.conditional_polite = [j + "ましたら"];
    out.conditional_neg = [j + "なかったら"];
    out.conditional_neg_polite = [j + "ませんでしたら"];
    out.provisional = [j + "れば"];
    out.provisional_polite = [j + "ませば", j + "れば"];
    out.provisional_neg = [j + "なければ"];
    out.provisional_neg_polite = [j + "ませんなら"];
    out.volitional = [j + "よう", base + "ぜよう"];
    out.volitional_polite = [j + "ましょう"];
    out.volitional_neg = [base + "ずまい", base + "ずるまい"];
    out.volitional_neg_polite = [j + "ますまい"];
    out.imperative = [j + "ろ", base + "ぜよ"];
    out.imperative_polite = [base + "ぜよ", j + "なさい", j + "てください"];
    out.imperative_neg = [base + "ずるな"];
    out.imperative_neg_polite = [j + "ないでください"];
    Object.assign(out, expand("potential", [j + "られる", base + "ぜられる"]));
    Object.assign(out, expand("passive", [j + "られる"]));
    Object.assign(out, expand("causative", [j + "させる"]));
    Object.assign(out, expand("caus_passive", [j + "させられる"]));
    out.adverbial = [j + "なく"];
    out.nominalization = [j];
    return out;
  }

  if (group === "vk") {
    out.plain = ["くる"];
    out.plain_polite = ["きます"];
    out.plain_neg = ["こない"];
    out.plain_neg_polite = ["きません"];
    out.nu_form = ["こぬ"];
    out.mu_form = ["こむ", "こん"];
    out.past = ["きた"];
    out.past_polite = ["きました"];
    out.past_neg = ["こなかった"];
    out.past_neg_polite = ["きませんでした"];
    out.te_form = ["きて"];
    out.te_form_polite = ["きまして"];
    out.te_form_neg = ["こなくて", "こないで"];
    out.te_form_neg_polite = ["きませんで"];
    out.zu_form = ["こず", "こずに"];
    out.conditional = ["きたら"];
    out.conditional_polite = ["きましたら"];
    out.conditional_neg = ["こなかったら"];
    out.conditional_neg_polite = ["きませんでしたら"];
    out.provisional = ["くれば"];
    out.provisional_polite = ["きますれば", "きませば", "きれば"];
    out.provisional_neg = ["こなければ"];
    out.provisional_neg_polite = ["きませんなら"];
    out.volitional = ["こよう"];
    out.volitional_polite = ["きましょう"];
    out.volitional_neg = ["こまい", "くるまい"];
    out.volitional_neg_polite = ["きますまい"];
    out.imperative = ["こい"];
    out.imperative_polite = ["きなさい", "きてください"];
    out.imperative_neg = ["くるな"];
    out.imperative_neg_polite = ["こないでください"];
    Object.assign(out, expand("potential", ["こられる"]));
    Object.assign(out, expand("passive", ["こられる"]));
    Object.assign(out, expand("causative", ["こさせる"]));
    Object.assign(out, expand("caus_passive", ["こさせられる"]));
    out.adverbial = ["こなく"];
    out.nominalization = ["き"];
    return out;
  }

  if (group === "adji") {
    const base = r === "いい" ? "よ" : r.slice(0, -1);
    out.plain = [r];
    out.plain_polite = [r + "です"];
    out.plain_neg = [base + "くない"];
    out.plain_neg_polite = [base + "くありません", base + "くないです"];
    out.past = [base + "かった"];
    out.past_polite = [base + "かったです"];
    out.past_neg = [base + "くなかった"];
    out.past_neg_polite = [base + "くなかったです", base + "くありませんでした"];
    out.te_form = [base + "くて"];
    out.te_form_neg = [base + "くなくて"];
    out.conditional = [base + "かったら"];
    out.conditional_neg = [base + "くなかったら"];
    out.provisional = [base + "ければ"];
    out.provisional_neg = [base + "くなければ"];
    out.adverbial = [base + "く"];
    out.nominalization = [base + "さ", base + "み"];
    return out;
  }

  if (group === "adjna") {
    const base = r.replace(/だ$/, "");
    out.plain = [base + "だ"];
    out.plain_polite = [base + "です"];
    out.plain_neg = [base + "ではない", base + "じゃない"];
    out.plain_neg_polite = [base + "ではありません", base + "じゃありません"];
    out.past = [base + "だった"];
    out.past_polite = [base + "でした"];
    out.past_neg = [base + "ではなかった", base + "じゃなかった"];
    out.past_neg_polite = [base + "ではありませんでした"];
    out.te_form = [base + "で"];
    out.te_form_neg = [base + "ではなくて", base + "じゃなくて"];
    out.conditional = [base + "だったら"];
    out.provisional = [base + "なら", base + "であれば"];
    out.provisional_neg = [base + "でなければ"];
    out.adverbial = [base + "に"];
    out.nominalization = [base + "さ"];
    return out;
  }

  return out;
}

/**
 * 从读音形态反推汉字表层：只在「读音尾变、表层尾同变」时成立（五段/一段/イ形）。
 * 无法安全推导时返回 null，调用方退化为只显示假名。
 */
export function toSurface(surface, reading, conjReading) {
  if (!surface || !reading || !conjReading) return null;
  let p = 0;
  while (p < reading.length && p < conjReading.length && reading[p] === conjReading[p]) p++;
  const drop = reading.length - p;
  if (drop > surface.length) return null;
  return surface.slice(0, surface.length - drop) + conjReading.slice(p);
}
/** 给定词的汉字形与某个屈折形，反查该屈折形的读音（复用活用器，避免再做一套变形表） */
export function readingOfSurface(word, surface) {
  if (!word || !surface) return null;
  if (surface === word.w || surface === word.r) return word.r;
  const groups = [];
  if (word.pos?.isVerb) groups.push(word.pos.verbGroup === 1 ? "g5" : word.pos.verbGroup === 2 ? "g1" : "vs");
  if (word.pos?.adj === "i") groups.push("adji");
  if (word.pos?.adj === "na") groups.push("adjna");
  for (const g of groups) {
    const forms = conjugate(word.r, g);
    for (const vals of Object.values(forms)) {
      for (const v of vals) if (toSurface(word.w, word.r, v) === surface) return v;
    }
  }
  return null;
}
