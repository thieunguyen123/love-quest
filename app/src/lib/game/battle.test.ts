import { describe, it, expect } from "vitest";
import { calcAtk, calcDef, calcBattle } from "./battle";

const C = { armyAtkPct: 0.15, defenderArmyRatio: 0.5, minDamageRatio: 0.1, lootPerDamage: 0.5 };
describe("trận đánh (BTL-02) – ví dụ ở sheet 2 mục G", () => {
  const atk = calcAtk([{ atk: 10, qty: 8 }, { atk: 25, qty: 2 }], 2, [0.1], 0, C);
  const def = calcDef(20, 16, [{ atk: 10, qty: 5 }], 0, C);
  it("ATK = (80+50)×1.3×1.1 = 185.9", () => expect(atk).toBeCloseTo(185.9, 5));
  it("DEF = 20 + 16 + 25 = 61", () => expect(def).toBeCloseTo(61, 5));
  it("sát thương 125, loot 63 (random = 1)", () => expect(calcBattle(atk, def, 1, 500, C)).toEqual({ damage: 125, loot: 63 }));
  it("sát thương tối thiểu 10% ATK khi DEF > ATK", () => expect(calcBattle(100, 500, 1, 500, C).damage).toBe(10));
  it("không vượt HP còn lại", () => expect(calcBattle(1000, 0, 1.1, 40, C)).toEqual({ damage: 40, loot: 20 }));
  it("dragon + vũ khí cộng dồn", () => expect(calcAtk([{ atk: 100, qty: 1 }], 0, [0.1, 0.2], 0.25, C)).toBeCloseTo(100 * 1.3 * 1.25, 5));
});
