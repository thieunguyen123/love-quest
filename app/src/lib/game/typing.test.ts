import { describe, it, expect } from "vitest";
import { normalizeVi, matchesAny, difficulty, pendingCoins, pickWord, type TypingCfg } from "./typing";

const C: TypingCfg = { lives: 3, fallStartSec: 10, fallMinSec: 4, speedupPct: 0.08, speedupEvery: 10, maxStart: 3, maxEnd: 5, rewardEvery: 10, rewardCoins: 20, dailyCap: 300, noDiacritics: true };

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
  it("bắt đầu 10s, 3 từ", () => expect(difficulty(0, C)).toEqual({ fallSec: 10, maxOnScreen: 3 }));
  it("sau 10 từ: giảm 8%, +1 từ", () => {
    const d = difficulty(10, C);
    expect(d.fallSec).toBeCloseTo(9.2); expect(d.maxOnScreen).toBe(4);
  });
  it("không dưới 4s và tối đa 5 từ", () => {
    const d = difficulty(1000, C);
    expect(d.fallSec).toBe(4); expect(d.maxOnScreen).toBe(5);
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
