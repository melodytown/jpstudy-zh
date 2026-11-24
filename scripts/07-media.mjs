// 07-media.mjs —— 把课程用到的音频复制到 public/media（按 stage 分批），生成 manifest
// 用法：node scripts/07-media.mjs            # 默认 stage 1（N5）
//       node scripts/07-media.mjs --stage=2  # 含 N4
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "raw/anki-jlpt-decks/deck-source/medias");
const OUT = path.join(ROOT, "public/media");

const stageArg = process.argv.find((a) => a.startsWith("--stage="));
const maxStage = stageArg ? Number(stageArg.split("=")[1]) : 1;

const words = JSON.parse(fs.readFileSync(path.join(ROOT, "data/words.json"), "utf8"));
const units = JSON.parse(fs.readFileSync(path.join(ROOT, "data/units.json"), "utf8"));
const byId = new Map(words.map((w) => [w.id, w]));

const wanted = new Set();
let unitsIncluded = 0;
for (const u of units) {
  if (u.stage > maxStage) continue;
  unitsIncluded++;
  for (const id of u.newWordIds) {
    const w = byId.get(id);
    if (w?.audio) wanted.add(w.audio);
    // 单词卡片下面的例句也会发音（08 每个词只暴露前 2 句）
    for (const s of (w?.sentences ?? []).slice(0, 2)) if (s.audio) wanted.add(s.audio);
  }
  for (const s of u.sentences) if (s.audio) wanted.add(s.audio);
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
let copied = 0, skipped = 0, bytes = 0;
const missing = [];

for (const name of wanted) {
  const from = path.join(SRC, name);
  const to = path.join(OUT, name);
  if (!fs.existsSync(from)) { missing.push(name); continue; }
  const stat = fs.statSync(from);
  if (!fs.existsSync(to) || fs.statSync(to).size !== stat.size) {
    fs.copyFileSync(from, to);
    copied++;
  } else skipped++;
  bytes += stat.size;
  manifest[name] = stat.size;
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest));

const report = {
  maxStage,
  unitsIncluded,
  filesNeeded: wanted.size,
  copied,
  alreadyPresent: skipped,
  missing: missing.length,
  totalBytes: bytes,
  totalMB: +(bytes / 1024 / 1024).toFixed(1),
  avgKB: +(bytes / 1024 / (wanted.size || 1)).toFixed(1),
};
fs.writeFileSync(path.join(ROOT, "data/report-07-media.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));