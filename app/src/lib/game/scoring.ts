// Twin TypeScript của calc_points / thắng-thua / thưởng ở SQL (nguồn sự thật là server). Dùng để hiển thị & test.
export type ScoreCfg = { base: number; speedMax: number; comboStep: number; comboCap: number };

export function calcPoints(correct: boolean, tMs: number, limitMs: number, streak: number, c: ScoreCfg) {
  if (!correct) return { base: 0, speed: 0, combo: 0, total: 0 };
  const speed = Math.round((c.speedMax * Math.max(0, limitMs - tMs)) / limitMs);
  const combo = streak >= 2 ? Math.min(c.comboStep * (streak - 1), c.comboCap) : 0;
  return { base: c.base, speed, combo, total: c.base + speed + combo };
}

export type Side = { score: number; timeMs: number } | null;
// 'A' | 'B' | 'DRAW'. Chỉ 1 người nộp → người đó thắng mặc định.
export function decideWinner(a: Side, b: Side): "A" | "B" | "DRAW" {
  if (a && !b) return "A";
  if (b && !a) return "B";
  if (!a || !b) return "DRAW";
  if (a.score !== b.score) return a.score > b.score ? "A" : "B";
  if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs ? "A" : "B";
  return "DRAW";
}

export function winCoins(order: number, mult: number, base: number, step: number) {
  return Math.round((base + step * (order - 1)) * mult);
}
