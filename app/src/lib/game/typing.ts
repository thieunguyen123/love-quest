// Logic thuần của Mưa chữ (LRN-05) – có unit test. Mọi tham số lấy từ game_config.
export function normalizeVi(s: string, stripDiacritics = true): string {
  let t = s.normalize("NFC").toLowerCase().replace(/[.,;:!?'"“”‘’()\-–—_/\\]/g, " ").replace(/\s+/g, " ").trim();
  if (stripDiacritics) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  return t;
}

export function matchesAny(input: string, meanings: string[], stripDiacritics = true): boolean {
  const n = normalizeVi(input, stripDiacritics);
  return n !== "" && meanings.some((m) => normalizeVi(m, stripDiacritics) === n);
}

export type TypingCfg = {
  lives: number; fallStartSec: number; fallMinSec: number; speedupPct: number; speedupEvery: number;
  maxStart: number; maxEnd: number; rewardEvery: number; rewardCoins: number; dailyCap: number; noDiacritics: boolean;
  /** khoảng cách ra từ mới (giây) lúc đầu / ngắn nhất — mỗi lần tăng tốc ngắn lại speedupPct × 1.25 */
  spawnGapStartSec: number; spawnGapMinSec: number;
};

// Độ khó theo số từ đã bắn trúng: cứ speedupEvery từ giảm speedupPct thời gian rơi (min fallMinSec), +1 từ cùng lúc
export function difficulty(hits: number, c: TypingCfg) {
  const steps = Math.floor(hits / c.speedupEvery);
  return {
    fallSec: Math.max(c.fallMinSec, c.fallStartSec * Math.pow(1 - c.speedupPct, steps)),
    maxOnScreen: Math.min(c.maxEnd, c.maxStart + steps),
    spawnGapSec: Math.max(c.spawnGapMinSec, c.spawnGapStartSec * Math.pow(1 - Math.min(0.9, c.speedupPct * 1.25), steps)),
    step: steps,   // cấp tốc độ (0 = mới vào)
  };
}

export function pendingCoins(hits: number, usedToday: number, c: TypingCfg) {
  const earn = Math.floor(hits / c.rewardEvery) * c.rewardCoins;
  const grant = Math.min(earn, Math.max(0, c.dailyCap - usedToday));
  return { earn, grant, capped: earn > grant };
}

// Chọn từ theo trọng số (1 + số lần sai), tránh các từ đang rơi
export function pickWord<T extends { id: string; wrong: number }>(pool: T[], active: Set<string>, rnd = Math.random): T | null {
  const cand = pool.filter((w) => !active.has(w.id));
  if (!cand.length) return null;
  const total = cand.reduce((a, w) => a + 1 + w.wrong, 0);
  let r = rnd() * total;
  for (const w of cand) { r -= 1 + w.wrong; if (r <= 0) return w; }
  return cand[cand.length - 1];
}
