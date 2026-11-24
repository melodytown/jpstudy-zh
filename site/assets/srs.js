// SRS：ts-fsrs + IndexedDB
// 卡片 id = 词 id；每张卡只在"用户完成某课"时入库，避免一次性塞进 10645 张。
import { fsrs, generatorParameters, Rating, createEmptyCard } from "../vendor/ts-fsrs.js";
import { idbAll, idbPut, idbBulkPut, idbGet } from "./lib.js";

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }));

export { Rating };

export const RATING_LABEL = {
  [Rating.Again]: "完全忘了",
  [Rating.Hard]: "勉强想起",
  [Rating.Good]: "想起来了",
  [Rating.Easy]: "太简单",
};

export async function ensureUnitCards(unitId, wordIds) {
  const existing = await idbGet("units", unitId);
  if (existing) return { added: 0, existed: true };
  const now = new Date();
  const cards = wordIds.map((id) => ({
    id,
    unitId,
    card: createEmptyCard(now),
    addedAt: now.toISOString(),
  }));
  await idbBulkPut("cards", cards);
  await idbPut("units", { id: unitId, doneAt: now.toISOString() });
  return { added: cards.length, existed: false };
}

export async function allCards() {
  return idbAll("cards");
}

export async function dueCards(now = new Date()) {
  const cards = await allCards();
  return cards.filter((c) => new Date(c.card.due) <= now).sort((a, b) => new Date(a.card.due) - new Date(b.card.due));
}

export async function newCards() {
  const cards = await allCards();
  return cards.filter((c) => c.card.state === 0 /* New */);
}

export async function rate(cardRow, rating) {
  const now = new Date();
  const { card, log } = scheduler.next(cardRow.card, now, rating);
  await idbPut("cards", { ...cardRow, card, lastReview: now.toISOString() });
  await idbPut("logs", { wordId: cardRow.id, rating, at: now.toISOString(), log });
  return card;
}

/** 预览四个评分各自的下次间隔，用于按钮上显示 */
export function preview(card) {
  try {
    const now = new Date();
    const log = scheduler.repeat(card, now);
    const out = {};
    for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
      const c = log[r]?.card;
      if (!c) continue;
      const days = (new Date(c.due) - now) / 86400000;
      out[r] = days < 1 ? `${Math.max(1, Math.round(days * 1440))} 分钟后` : `${Math.round(days)} 天后`;
    }
    return out;
  } catch {
    return null;
  }
}

export async function stats() {
  const cards = await allCards();
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = cards.filter((c) => new Date(c.card.due) <= now).length;
  const fresh = cards.filter((c) => c.card.state === 0).length;
  const learned = cards.filter((c) => c.card.state !== 0).length;
  const reviewedToday = cards.filter((c) => c.lastReview && new Date(c.lastReview) >= dayStart).length;
  return { total: cards.length, due, fresh, learned, reviewedToday };
}

export async function completedUnits() {
  const rows = await idbAll("units");
  return new Set(rows.map((r) => r.id));
}

export async function exportProgress() {
  const cards = await allCards();
  const units = await idbAll("units");
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), units, cards }, null, 1);
}

export async function importProgress(text) {
  const data = JSON.parse(text);
  if (!data.cards) throw new Error("格式不对");
  await idbBulkPut("cards", data.cards);
  await idbBulkPut("units", data.units ?? []);
  return data.cards.length;
}