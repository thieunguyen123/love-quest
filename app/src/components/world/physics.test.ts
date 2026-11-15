import { describe, it, expect } from "vitest";
import { drive, mergeInput, nearestZone, spawnAt, yawOf, CAR, type Input } from "./physics";
import { ZONES, MY_HOUSE, OBSTACLES, TREES, RAMP, bowlingPins, crateStack, WORLD_HALF } from "./data";

const run = (v0: number, inp: Partial<Input>, secs: number) => {
  let v = v0, yaw = 0;
  for (let i = 0; i < secs * 60; i++) { const r = drive(v, { throttle: 0, steer: 0, ...inp }, 1 / 60); v = r.speed; yaw += r.yawRate / 60; }
  return { v, yaw };
};
const noKeys = { up: false, down: false, left: false, right: false, brake: false, boost: false };

describe("lái xe 3D (W3D-01)", () => {
  it("giữ ga thì tăng tốc, không vượt tốc độ tối đa", () => {
    expect(run(0, { throttle: 1 }, 0.5).v).toBeGreaterThan(5);
    expect(run(0, { throttle: 1 }, 10).v).toBeCloseTo(CAR.maxSpeed, 5);
  });
  it("Shift (boost) chạy nhanh hơn, thả boost thì giảm mượt về tốc độ thường", () => {
    const b = run(0, { throttle: 1, boost: true }, 10).v;
    expect(b).toBeCloseTo(CAR.boostSpeed, 5);
    const after = run(b, { throttle: 1 }, 0.1).v;
    expect(after).toBeLessThan(b); expect(after).toBeGreaterThan(CAR.maxSpeed);
  });
  it("lùi tối đa maxReverse; đang tiến mà bấm lùi thì phanh trước", () => {
    expect(run(0, { throttle: -1 }, 10).v).toBeCloseTo(-CAR.maxReverse, 5);
    expect(run(15, { throttle: -1 }, 0.2).v).toBeLessThan(15 - 8);
  });
  it("thả ga thì dừng hẳn; phanh tay dừng nhanh hơn", () => {
    expect(run(15, {}, 4).v).toBe(0);
    expect(run(15, { brake: true }, 0.5).v).toBeLessThan(run(15, {}, 0.5).v);
  });
  it("đứng yên không quay; đang chạy rẽ trái làm h tăng; lùi thì đánh lái ngược", () => {
    expect(run(0, { steer: 1 }, 1).yaw).toBe(0);
    expect(drive(10, { throttle: 0, steer: 1 }, 1 / 60).yawRate).toBeGreaterThan(0);
    expect(drive(-5, { throttle: 0, steer: 1 }, 1 / 60).yawRate).toBeLessThan(0);
  });
  it("joystick analog cộng với bàn phím, bị kẹp trong [-1,1]", () => {
    expect(mergeInput({ ...noKeys, up: true }, { x: 0, y: 1 }).throttle).toBe(1);
    expect(mergeInput(noKeys, { x: 0.5, y: 0.3 })).toMatchObject({ throttle: 0.3, steer: -0.5 });
    expect(mergeInput({ ...noKeys, left: true }, { x: 0, y: 0 }).steer).toBe(1);
  });
  it("yawOf khôi phục góc quay quanh Y", () => {
    for (const h of [0, 1, -2, 3]) expect(yawOf({ y: Math.sin(h / 2), w: Math.cos(h / 2) })).toBeCloseTo(h, 6);
  });
});

describe("bản đồ", () => {
  it("điểm xuất phát mặc định và ?at=... không đè lên vật cản", () => {
    for (const at of [undefined, "home", "partner", "arena", "library", "market", "ramp"]) for (const side of [-1, 0, 1]) {
      const s = spawnAt(at, side);
      expect(OBSTACLES.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > o.r + 1.5), `spawn ${at} side ${side}`).toBe(true);
    }
  });
  it("2 người cùng điểm xuất phát → 2 xe cách nhau ≥ 4 m, cùng hướng", () => {
    for (const at of [undefined, "home", "library", "ramp"]) {
      const a = spawnAt(at, -1), b = spawnAt(at, 1);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(4.9);
      expect(a.h).toBe(b.h);
    }
  });
  it("cây không mọc trên đường, dốc, khu bowling, chồng thùng; nằm trong bản đồ", () => {
    const things = [{ x: RAMP.x, z: RAMP.z }, ...bowlingPins(), ...crateStack()];
    for (const t of TREES) {
      expect(Math.abs(t.x) >= 6 && Math.abs(t.z - 8) >= 6).toBe(true);
      expect(Math.max(Math.abs(t.x), Math.abs(t.z))).toBeLessThan(WORLD_HALF);
      for (const o of things) expect(Math.hypot(o.x - t.x, o.z - t.z)).toBeGreaterThan(4);
    }
  });
  it("10 ky bowling, 6 thùng", () => { expect(bowlingPins()).toHaveLength(10); expect(crateStack()).toHaveLength(6); });
});

describe("khu tương tác (W3D-02)", () => {
  it("lại gần Thư viện thì nhận ra", () => {
    const z = ZONES.find((x) => x.id === "library")!;
    expect(nearestZone(z.x + 3, z.z)?.id).toBe("library");
  });
  it("lại gần nhà mình thì vào /base", () => expect(nearestZone(MY_HOUSE.x + 5, MY_HOUSE.z)?.href).toBe("/base"));
  it("ngoài đồng thì không có khu nào", () => expect(nearestZone(50, 50)).toBeNull());
  it("các khu không chồng lên nhau", () => {
    for (const a of ZONES) for (const b of ZONES) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.r + b.r);
  });
});
