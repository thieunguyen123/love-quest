import { describe, it, expect } from "vitest";
import levels from "../../supabase/seed/levels.json";
import config from "../../supabase/seed/game_config.json";

describe("seed từ spec.xlsx", () => {
  it("có đủ 20 màn, thưởng màn 1 = 200 và màn 20 = 4200", () => {
    expect(levels).toHaveLength(20);
    expect(levels[0].win_coins).toBe(200);
    expect(levels[19].win_coins).toBe(4200);
  });
  it("có key cấu hình quan trọng", () => {
    const keys = config.map((c) => c.key);
    for (const k of ["STARTING_COINS", "LEVEL_LOCK_HOURS", "SHIELD_PRICE"]) expect(keys).toContain(k);
  });
});
