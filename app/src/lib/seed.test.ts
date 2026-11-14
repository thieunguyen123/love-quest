import { describe, it, expect } from "vitest";
import levels from "../../supabase/seed/levels.json";
import config from "../../supabase/seed/game_config.json";

describe("seed từ spec.xlsx", () => {
  it("có đủ 30 màn, thưởng màn 1 = 200, màn 20 = 4200, màn 30 (BOSS CUỐI ×2,5) = 7750", () => {
    expect(levels).toHaveLength(30);
    expect(levels[0].win_coins).toBe(200);
    expect(levels[19].win_coins).toBe(4200);
    expect(levels[29].win_coins).toBe(7750);
  });
  it("mỗi màn có đủ từ vựng trong seed (words.json + words_*.csv)", async () => {
    const fs = await import("node:fs"), path = await import("node:path");
    const dir = path.resolve(__dirname, "../../supabase/seed");
    const count = new Map<number, number>();
    for (const w of JSON.parse(fs.readFileSync(path.join(dir, "words.json"), "utf8"))) count.set(w.level, (count.get(w.level) ?? 0) + 1);
    for (const f of fs.readdirSync(dir).filter((f) => /^words_.*\.csv$/.test(f)))
      for (const l of fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).slice(1)) { const n = Number(l.split(",")[0]); if (n) count.set(n, (count.get(n) ?? 0) + 1); }
    for (const l of levels) expect([l.order_no, count.get(l.order_no)]).toEqual([l.order_no, l.word_count]);
  });
  it("có key cấu hình quan trọng", () => {
    const keys = config.map((c) => c.key);
    for (const k of ["STARTING_COINS", "LEVEL_LOCK_HOURS", "SHIELD_PRICE"]) expect(keys).toContain(k);
  });
});
