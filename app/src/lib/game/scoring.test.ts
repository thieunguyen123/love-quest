import { describe, it, expect } from "vitest";
import { calcPoints, decideWinner, winCoins } from "./scoring";

const C = { base: 100, speedMax: 50, comboStep: 10, comboCap: 50 };
describe("calcPoints (LVL-05)", () => {
  it("ví dụ spec: câu 15s, đúng sau 6s, đúng liên tiếp thứ 4 = 160", () => {
    expect(calcPoints(true, 6000, 15000, 4, C)).toEqual({ base: 100, speed: 30, combo: 30, total: 160 });
  });
  it("sai / hết giờ = 0", () => expect(calcPoints(false, 1000, 15000, 5, C).total).toBe(0));
  it("câu đúng đầu tiên không có combo", () => expect(calcPoints(true, 0, 10000, 1, C)).toEqual({ base: 100, speed: 50, combo: 0, total: 150 }));
  it("combo bị chặn trần 50", () => expect(calcPoints(true, 10000, 10000, 20, C).combo).toBe(50));
  it("không thưởng tốc độ âm", () => expect(calcPoints(true, 99999, 10000, 1, C).speed).toBe(0));
});
describe("decideWinner (LVL-08)", () => {
  it("điểm cao thắng", () => expect(decideWinner({ score: 10, timeMs: 5 }, { score: 9, timeMs: 1 })).toBe("A"));
  it("bằng điểm → thời gian ít hơn thắng", () => expect(decideWinner({ score: 10, timeMs: 9 }, { score: 10, timeMs: 5 })).toBe("B"));
  it("bằng điểm & thời gian → hòa", () => expect(decideWinner({ score: 10, timeMs: 5 }, { score: 10, timeMs: 5 })).toBe("DRAW"));
  it("một người không chơi → người kia thắng mặc định", () => {
    expect(decideWinner({ score: 0, timeMs: 0 }, null)).toBe("A");
    expect(decideWinner(null, { score: 0, timeMs: 0 })).toBe("B");
  });
});
describe("winCoins", () => {
  it("màn 1 = 200, màn 10 BOSS ×1.5 = 1650, màn 20 ×2 = 4200", () => {
    expect(winCoins(1, 1, 200, 100)).toBe(200);
    expect(winCoins(10, 1.5, 200, 100)).toBe(1650);
    expect(winCoins(20, 2, 200, 100)).toBe(4200);
  });
});
