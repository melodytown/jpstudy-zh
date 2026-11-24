// 03-conjugate.mjs —— 活用器 golden test：拿 kanjium 的 conjugations 表（1389 词 × 66 形态）对拍
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { conjugate, toSurface } from "./lib/conjugate.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");

const TYPE2GROUP = { v5: "g5", v5i: "v5i", v1: "g1", vsi: "vs", vz: "vz", adji: "adji" };

// 上游 type 有时按活用表标错（来る/する 被标成 v5i）；读音说了算
function resolveGroup(type, reading) {
  // 只有 v5i 里的 くる/する 才是カ変/サ変；刷る(する)・繰る(くる) 仍是五段
  if (type === "v5i" && reading === "くる") return "vk";
  if (type === "v5i" && reading === "する") return "vs";
  return TYPE2GROUP[type];
}

// 列语义校验：上游有些格子是脚本拼接错误（如 potential_past="あたける"、te_form_polite="なごみましてください"）
const SUFFIX = [
  [/_past$/, /(た|だ)$/],
  [/^past$/, /(た|だ)$/],
  [/te_form_polite$/, /まして$/],
  [/_polite$/, /(ます|ました|ません|ませんでした|ませんで|ませんでしたら|ませんなら|ましたら|ましょう|ませば|ますれば|ますまい|まして|です|でした|なさい|ください|せよ)$/],
];
function plausible(form, v) {
  for (const [re, ok] of SUFFIX) if (re.test(form) && !ok.test(v)) return false;
  return true;
}

// 参与对拍的形态列（跳过 * _acc / search / id）
const FORMS = [
  "plain", "plain_polite", "plain_neg", "plain_neg_polite", "nu_form", "mu_form",
  "past", "past_polite", "past_neg", "past_neg_polite",
  "te_form", "te_form_polite", "te_form_neg", "te_form_neg_polite", "zu_form",
  "conditional", "conditional_polite", "conditional_neg", "conditional_neg_polite",
  "provisional", "provisional_polite", "provisional_neg", "provisional_neg_polite",
  "volitional", "volitional_polite", "volitional_neg", "volitional_neg_polite",
  "imperative", "imperative_polite", "imperative_neg", "imperative_neg_polite",
  "potential", "potential_polite", "potential_neg", "potential_neg_polite",
  "potential_past", "potential_past_polite", "potential_neg_past", "potential_neg_past_polite",
  "passive", "passive_polite", "passive_neg", "passive_neg_polite",
  "passive_past", "passive_past_polite", "passive_neg_past", "passive_neg_past_polite",
  "causative", "causative_polite", "causative_neg", "causative_neg_polite",
  "causative_past", "causative_past_polite", "causative_neg_past", "causative_neg_past_polite",
  "caus_passive", "caus_passive_polite", "caus_passive_neg", "caus_passive_neg_polite",
  "caus_passive_past", "caus_passive_past_polite", "caus_passive_neg_past", "caus_passive_neg_past_polite",
  "adverbial", "nominalization",
];

const db = new DatabaseSync(path.join(ROOT, "raw/kanjium/data/kanjidb.sqlite"), { readOnly: true });
const rows = db.prepare(`select okurigana, type, ${FORMS.join(",")} from conjugations`).all();
db.close();

const perForm = Object.fromEntries(FORMS.map((f) => [f, { ok: 0, bad: 0 }]));
const failures = [];
let checked = 0, mismatchedCells = 0, skippedTypes = 0, implausible = 0, evaluated = 0;
const skippedSamples = [];

for (const row of rows) {
  const group = resolveGroup(row.type, row.plain);
  if (!group) { skippedTypes++; continue; }

  const mine = conjugate(row.plain, group);
  checked++;

  for (const f of FORMS) {
    const theirs = (row[f] || "").trim();
    if (!theirs) continue; // 上游没给这一格，不判
    const alts = theirs.split("、").map((s) => s.trim()).filter(Boolean);
    const okAlts = alts.filter((a) => plausible(f, a));
    if (!okAlts.length) {
      // 上游整格都不成立（脚本拼接错误），跳过并单独计数
      implausible++;
      if (skippedSamples.length < 12) skippedSamples.push(`${row.okurigana}[${row.type}] ${f}=${theirs}`);
      continue;
    }
    evaluated++;
    const got = mine[f] ?? [];
    const ok = got.some((g) => okAlts.includes(g));
    if (ok) perForm[f].ok++;
    else {
      perForm[f].bad++;
      mismatchedCells++;
      failures.push({ word: row.okurigana, type: row.type, form: f, theirs: alts.join("、"), mine: got.join("、") });
    }
  }
}

// 表层反推抽样
const words = JSON.parse(fs.readFileSync(path.join(DATA, "words.json"), "utf8"));
const surfaceSamples = [];
for (const w of words) {
  if (!w.pos.isVerb || w.pos.verbGroup !== 1) continue;
  const g = conjugate(w.r, "g5");
  for (const f of ["plain_polite", "past", "te_form", "potential", "passive", "causative"]) {
    const s = toSurface(w.w, w.r, g[f][0]);
    if (s && surfaceSamples.length < 12) surfaceSamples.push(`${w.w}(${w.r}) ${f} → ${s} / ${g[f][0]}`);
  }
  if (surfaceSamples.length >= 12) break;
}

const summary = {
  words: checked,
  skippedTypes,
  cells: { evaluated, mismatched: mismatchedCells, upstreamImplausibleSkipped: implausible, passRate: `${((1 - mismatchedCells / evaluated) * 100).toFixed(2)}%` },
  skippedSamples,
  byForm: Object.fromEntries(Object.entries(perForm).map(([k, v]) => [k, `${v.ok}/${v.ok + v.bad}`])),
  worstForms: Object.entries(perForm)
    .map(([k, v]) => ({ form: k, ok: v.ok, bad: v.bad }))
    .filter((x) => x.bad > 0)
    .sort((a, b) => b.bad - a.bad)
    .slice(0, 15),
  failures,
  surfaceSamples,
};

fs.writeFileSync(path.join(DATA, "report-03-conjugate.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, failures: failures.slice(0, 20), surfaceSamples }, null, 2));