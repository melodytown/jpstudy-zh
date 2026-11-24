// 五十音表：清音/浊音/半浊音/拗音 × 平假名/片假名
import { $, el, getJSON, speak, japaneseVoice, TTS_HINT } from "./lib.js";

const app = $("#app");
const GROUPS = ["清音", "濁音", "半濁音", "拗音"];

async function main() {
  const kana = await getJSON("data/kana.json");
  let script = localStorage.getItem("kanaScript") ?? "hira";

  app.textContent = "";
  app.append(el("h1", {}, "五十音"));

  const tabs = el("div", { class: "row" });
  const render = () => {
    for (const b of tabs.children) b.classList.toggle("primary", b.dataset.script === script);
    const host = $("#grids");
    host.textContent = "";
    for (const g of GROUPS) {
      const items = kana.filter((k) => k.group === g);
      if (!items.length) continue;
      host.append(el("h2", {}, g, el("span", { class: "dim small" }, `　${items.length} 个`)));
      host.append(el("div", { class: "kana-grid" },
        items.map((k) => el("div", { class: "kana", onclick: () => speak(k[script]) },
          el("div", { class: "k jp" }, k[script]),
          el("div", { class: "a" }, k.roma),
        )),
      ));
    }
  };

  for (const [key, label] of [["hira", "平假名"], ["kata", "片假名"]]) {
    tabs.append(el("button", { "data-script": key, onclick: () => { script = key; localStorage.setItem("kanaScript", key); render(); } }, label));
  }
  const voice = japaneseVoice();
  app.append(tabs, el("div", { class: "dim small", style: "margin-top:8px" },
    voice ? `点假名可朗读（系统语音：${voice.name}）` : "点假名可朗读，但需要先安装日语语音"));
  if (!voice) {
    app.append(el("div", { class: "card small", style: "margin-top:10px" },
      el("div", {}, "当前系统没有日语语音，点了不会出声。"),
      el("div", { class: "dim", style: "margin-top:4px" }, TTS_HINT)));
  }
  app.append(el("div", { id: "grids" }));
  render();
}

main().catch((e) => { app.innerHTML = `<div class="empty">加载失败：${e.message}</div>`; });