import { describe, it, expect } from "vitest";
import { stepCar, nearestZone, spawnAt, type CarState } from "./physics";
import { WORLD_HALF, ZONES, MY_HOUSE, OBSTACLES } from "./data";

const none = { up: false, down: false, left: false, right: false };
const run = (s: CarState, k: Partial<typeof none>, secs: number) => { let c = s; for (let i = 0; i < secs * 60; i++) c = stepCar(c, { ...none, ...k }, 1 / 60, []); return c; };

describe("lái xe 3D", () => {
  it("giữ ↑ thì tiến theo hướng mũi xe (h=π → z giảm)", () => {
    const s = run({ x: 0, z: 0, h: Math.PI, v: 0 }, { up: true }, 2);
    expect(s.z).toBeLessThan(-5); expect(Math.abs(s.x)).toBeLessThan(0.01); expect(s.v).toBeGreaterThan(5);
  });
  it("tốc độ tối đa 17, lùi tối đa 7", () => {
    expect(run({ x: 0, z: 0, h: 0, v: 0 }, { up: true }, 10).v).toBeLessThanOrEqual(17);
    expect(run({ x: 0, z: 0, h: 0, v: 0 }, { down: true }, 10).v).toBeGreaterThanOrEqual(-7);
  });
  it("đứng yên thì không quay được; đang chạy thì rẽ trái làm h tăng", () => {
    expect(run({ x: 0, z: 0, h: 1, v: 0 }, { left: true }, 1).h).toBeCloseTo(1, 5);
    expect(run({ x: 0, z: 0, h: 1, v: 10 }, { left: true }, 0.5).h).toBeGreaterThan(1);
  });
  it("thả ga thì xe dừng dần", () => {
    const s = run({ x: 0, z: 0, h: 0, v: 15 }, {}, 3);
    expect(Math.abs(s.v)).toBeLessThan(0.1);
  });
  it("va chạm: không xuyên qua vật cản (đẩy ra ngoài bán kính)", () => {
    let c: CarState = { x: 0, z: 10, h: Math.PI, v: 15 };
    for (let i = 0; i < 120; i++) c = stepCar(c, { ...none, up: true }, 1 / 60, [{ x: 0, z: 0, r: 3 }]);
    expect(Math.hypot(c.x, c.z)).toBeGreaterThanOrEqual(3 + 1.1 - 0.01);
  });
  it("không ra khỏi bản đồ", () => {
    const c = run({ x: 0, z: 0, h: Math.PI / 2, v: 0 }, { up: true }, 20);
    expect(Math.abs(c.x)).toBeLessThanOrEqual(WORLD_HALF);
  });
  it("điểm xuất phát mặc định và ?at=home không đè lên vật cản", () => {
    for (const at of [undefined, "home", "partner", "arena", "library"]) {
      const s = spawnAt(at);
      expect(OBSTACLES.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > o.r + 0.5), `spawn ${at}`).toBe(true);
    }
  });
});
describe("khu tương tác", () => {
  it("lại gần Thư viện thì nhận ra", () => {
    const z = ZONES.find((x) => x.id === "library")!;
    expect(nearestZone(z.x + 3, z.z)?.id).toBe("library");
  });
  it("lại gần nhà mình thì vào /base", () => expect(nearestZone(MY_HOUSE.x + 5, MY_HOUSE.z)?.href).toBe("/base"));
  it("ngoài đồng thì không có khu nào", () => expect(nearestZone(50, 50)).toBeNull());
});
