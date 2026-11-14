import { describe, it, expect } from "vitest";
import { normalizeVi, matchesAny, difficulty, pendingCoins, pickWord, type TypingCfg } from "./typing";

// cấu hình mặc định (sheet 3): mới vào chậm, cứ 10 từ nhanh dần
const C: TypingCfg = { lives: 3, fallStartSec: 16, fallMinSec: 5, speedupPct: 0.12, speedupEvery: 10, maxStart: 1, maxEnd: 4, rewardEvery: 10, rewardCoins: 20, dailyCap: 300, noDiacritics: true, spawnGapStartSec: 3.5, spawnGapMinSec: 1.2 };

describe("normalizeVi", () => {
  it("bỏ dấu, đ→d, hoa thường, dấu câu", () => {
    expect(normalizeVi("Tạm biệt!")).toBe("tam biet");
    expect(normalizeVi("  Đồ   ĂN, ")).toBe("do an");
  });
  it("giữ dấu khi tắt noDiacritics", () => {
    expect(normalizeVi("Tạm biệt", false)).toBe("tạm biệt");
  });
});
describe("matchesAny", () => {
  it("gõ không dấu khớp nhiều nghĩa", () => {
    expect(matchesAny("tam biet", ["tạm biệt"])).toBe(true);
    expect(matchesAny("gap go", ["gặp", "gặp gỡ"])).toBe(true);
    expect(matchesAny("xin chao", ["chào"])).toBe(false);
    expect(matchesAny("", ["chào"])).toBe(false);
  });
  it("khi bắt buộc dấu thì không dấu không khớp", () => {
    expect(matchesAny("tam biet", ["tạm biệt"], false)).toBe(false);
    expect(matchesAny("tạm biệt", ["tạm biệt"], false)).toBe(true);
  });
});
describe("difficulty", () => {
  it("mới vào chậm: rơi 16s, 1 từ, 3.5s mới ra từ mới", () => expect(difficulty(0, C)).toEqual({ fallSec: 16, maxOnScreen: 1, spawnGapSec: 3.5, step: 0 }));
  it("9 từ đầu vẫn tốc độ ban đầu", () => expect(difficulty(9, C).step).toBe(0));
  it("sau 10 từ: rơi nhanh hơn 12%, +1 từ, ra từ nhanh hơn 15%", () => {
    const d = difficulty(10, C);
    expect(d.step).toBe(1); expect(d.fallSec).toBeCloseTo(14.08); expect(d.maxOnScreen).toBe(2); expect(d.spawnGapSec).toBeCloseTo(2.975);
  });
  it("mỗi 10 từ lại nhanh dần (đơn điệu)", () => {
    for (let h = 10; h <= 100; h += 10) expect(difficulty(h, C).fallSec).toBeLessThan(difficulty(h - 10, C).fallSec);
  });
  it("không dưới 5s, tối đa 4 từ, ra từ không dưới 1.2s", () => {
    const d = difficulty(1000, C);
    expect(d.fallSec).toBe(5); expect(d.maxOnScreen).toBe(4); expect(d.spawnGapSec).toBe(1.2);
  });
});
describe("pendingCoins", () => {
  it("+20 mỗi 10 từ", () => expect(pendingCoins(25, 0, C)).toEqual({ earn: 40, grant: 40, capped: false }));
  it("áp trần 300 xu/ngày", () => {
    expect(pendingCoins(100, 280, C)).toEqual({ earn: 200, grant: 20, capped: true });
    expect(pendingCoins(100, 300, C).grant).toBe(0);
  });
});
describe("pickWord", () => {
  const pool = [{ id: "a", wrong: 0 }, { id: "b", wrong: 9 }];
  it("tránh từ đang rơi", () => expect(pickWord(pool, new Set(["a"]), () => 0)?.id).toBe("b"));
  it("từ sai nhiều dễ ra hơn", () => expect(pickWord(pool, new Set(), () => 0.5)?.id).toBe("b"));
  it("hết từ → null", () => expect(pickWord(pool, new Set(["a", "b"]))).toBeNull());
});
