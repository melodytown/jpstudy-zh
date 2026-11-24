// 公共工具：DOM、数据加载、注音渲染、音频、IndexedDB
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

const cache = new Map();
export async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return r.json();
  });
  cache.set(url, p);
  return p;
}

/** ruby: [[base, reading|null], ...] → DocumentFragment */
export function rubyFrag(ruby) {
  const frag = document.createDocumentFragment();
  for (const pair of ruby ?? []) {
    const [base, reading] = pair;
    if (!base) continue;
    if (reading) {
      const rt = el("rt", {}, reading);
      frag.append(el("ruby", {}, base, rt));
    } else {
      frag.append(document.createTextNode(base));
    }
  }
  return frag;
}

export function rubySpan(ruby, cls = "ja") {
  const span = el("span", { class: cls });
  span.append(rubyFrag(ruby));
  return span;
}

let audioEl = null;
export function playAudio(file) {
  if (!file) return;
  if (!audioEl) audioEl = new Audio();
  audioEl.src = `media/${file}`;
  audioEl.currentTime = 0;
  audioEl.play().catch(() => {});
}

export function audioBtn(file) {
  if (!file) return el("span");
  return el("button", { class: "play", title: "播放", onclick: () => playAudio(file) }, "🔊");
}

// ---------- IndexedDB ----------
const DB_NAME = "jpstudy";
let dbp = null;
export function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("cards")) d.createObjectStore("cards", { keyPath: "id" });
      if (!d.objectStoreNames.contains("units")) d.createObjectStore("units", { keyPath: "id" });
      if (!d.objectStoreNames.contains("logs")) d.createObjectStore("logs", { keyPath: "k", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

export async function idbAll(store) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(store, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(store, "readwrite").objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(store, key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbBulkPut(store, values) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    for (const v of values) tx.objectStore(store).put(v);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export const qs = (k) => new URLSearchParams(location.search).get(k);
export const today = () => new Date().toISOString().slice(0, 10);

export function toast(msg) {
  const t = el("div", { class: "card small", style: "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 1600);
}

// ---------- 运行时信息（只有桌面版提供 /__jpstudy） ----------
// 静态服务器（python -m http.server）下取不到，返回 null，页面当作普通站点用。
export async function runtimeInfo() {
  try {
    const r = await fetch("__jpstudy", { cache: "no-store" });
    if (!r.ok) return null;
    const info = await r.json();
    return info?.app === "jpstudy" ? info : null;
  } catch {
    return null;
  }
}

// 跑在备用端口时提醒一句：进度按端口隔离，换个端口就等于换了一套进度。
async function mountRuntimeNotice() {
  const info = await runtimeInfo();
  if (!info || info.primary) return;
  const bar = el("div", { class: "notice" },
    el("strong", {}, `备用端口 ${info.port}　`),
    "默认端口 17321 被别的程序占用，本次改用这个端口。学习进度按端口隔离：这里看到的进度与默认端口互不相通，要迁移请用首页的「导出进度 / 导入进度」。",
  );
  const top = document.querySelector("header.top");
  if (top) top.after(bar); else document.body.prepend(bar);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountRuntimeNotice);
  else mountRuntimeNotice();
}

// ---------- 系统语音（TTS） ----------
// 真人录音只覆盖 687 / 12951 句，其余句子和五十音都靠系统日语语音。
// 系统没装 ja-JP 语音时 speechSynthesis 会静默不发声，所以必须明确告诉用户怎么装，
// 不能让按钮点了像坏的一样。
export function japaneseVoice() {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices() || [];
  return voices.find((v) => /^ja([-_]|$)/i.test(v.lang)) || null;
}

export const TTS_HINT = "系统里没有日语语音：设置 → 时间和语言 → 语言 → 添加「日本語」并勾选「语音」";

export function speak(text, { rate = 0.9 } = {}) {
  if (!text) return false;
  if (typeof speechSynthesis === "undefined") {
    toast("这个浏览器不支持语音合成");
    return false;
  }
  const voice = japaneseVoice();
  if (!voice) {
    toast(TTS_HINT);
    return false;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice.lang;
  u.voice = voice;
  u.rate = rate;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}