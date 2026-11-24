#!/usr/bin/env bash
# 拉取上游数据源到 raw/ ，并记录 commit + 许可，保证可复现。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p raw

clone() { # url dir
  if [ -d "raw/$2/.git" ]; then
    echo "skip raw/$2 (exists)"
  else
    git clone --depth 1 -q "$1" "raw/$2"
    echo "cloned raw/$2"
  fi
}

# 1) 中文释义 + 音调 + 例句 + 音频（CC BY-NC 4.0，个人自用）
clone https://github.com/5mdld/anki-jlpt-decks.git anki-jlpt-decks
# 2) 语法点 526 + 汉字表 + jmdict_id（CC BY-SA 4.0）
clone https://github.com/evanclan/OpenJLPT.git openjlpt
# 3) 活用表（用于对拍）+ 音调补缺（CC BY-SA 4.0）
clone https://github.com/mifunetoshiro/kanjium.git kanjium

# 4) Tatoeba 日中句对（不是 git 仓，只能下快照；04b 依赖它补例句）
TATOEBA="https://downloads.tatoeba.org/exports/per_language"
fetch_bz() { # src-path dest-name
  if [ -s "raw/tatoeba/$2" ]; then
    echo "skip raw/tatoeba/$2 (exists)"
  else
    mkdir -p raw/tatoeba
    curl -fsSL --retry 3 --max-time 600 -o "raw/tatoeba/$2" "$TATOEBA/$1"
    echo "fetched raw/tatoeba/$2"
  fi
}
fetch_bz jpn/jpn_sentences.tsv.bz2 jpn_sentences.tsv.bz2
fetch_bz cmn/cmn_sentences.tsv.bz2 cmn_sentences.tsv.bz2
fetch_bz jpn/jpn-cmn_links.tsv.bz2 jpn-cmn_links.tsv.bz2

node -e '
const fs=require("fs"),cp=require("child_process");
const dirs=["anki-jlpt-decks","openjlpt","kanjium"];
const out={};
for(const d of dirs){
  const c=cp.execSync(`git -C raw/${d} rev-parse HEAD`).toString().trim();
  const date=cp.execSync(`git -C raw/${d} log -1 --format=%cI`).toString().trim();
  out[d]={commit:c,date};
}
fs.writeFileSync("raw/SOURCES.json",JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
'