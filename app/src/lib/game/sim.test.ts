import { describe, expect, it } from "vitest";
import { autoDeploys, createSim, deploy, deployError, runBattle, step, type Deploy, type Snapshot } from "./sim";
import { buildSnapshot, houseArmor } from "./snapshot";

const cfg = { seconds: 60, tickMs: 100, houseRatio: 0.02, aggro: 8, deployMin: 4, groupSize: 5, maxGroups: 24, splashMax: 4 };
const sword = { unit: "sword", qty: 10, hp: 60, dps: 10, hitSec: 1, range: 1.5, speed: 3.5, target: "any" as const };
// ví dụ sheet 2 mục G: nhà cấp 1 (HP 500, DEF 20, nền 3×3 ô → nửa cạnh 3 m), 10 Lính kiếm
const base: Snapshot = { v: 1, half: 20, cfg, house: { level: 1, r: 3, hp: 500, maxHp: 500, armor: houseArmor(20, 300) }, defenses: [], traps: [], guards: [], army: [sword] };
const two: Deploy[] = [{ t: 0, unit: "sword", n: 5, x: 7, z: 0 }, { t: 0, unit: "sword", n: 5, x: -7, z: 0 }];
const tower = { id: "t1", code: "def_tower", x: 0, z: 6, r: 2, hp: 960, dmg: 12, hitSec: 0.8, range: 9, splash: 0 };
const out = (s: Snapshot, d: Deploy[], end?: number) => { const r = runBattle(s, d, end); if (!r.ok) throw new Error(r.error); return r.out; };

describe("mô phỏng trận (BTL-02, TC-26)", () => {
  it("ví dụ sheet 2: 10 Lính kiếm, không phòng thủ → nhà mất 111 HP, loot 56", () => {
    const o = out(base, two);
    expect(o.damage).toBe(111); expect(o.hpAfter).toBe(389); expect(o.reason).toBe("time");
    expect(Math.round(o.damage * 0.5)).toBe(56);
    expect(o.lost.sword).toBe(0);
  });
  it("xác định: chạy 2 lần ra cùng kết quả (client = server)", () => {
    const s: Snapshot = { ...base, defenses: [tower], traps: [{ id: "x", code: "trap_spike", x: 5, z: 0, dmg: 35, trigger: 1.6, splash: 2.2 }] };
    expect(out(s, two)).toEqual(out(JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(two))));
  });
  it("không rải quân → 0 sát thương; rút quân sớm → dừng đúng tick", () => {
    expect(out(base, []).damage).toBe(0);
    const o = out(base, two, 100);
    expect(o.reason).toBe("retreat"); expect(o.ticks).toBe(100); expect(o.damage).toBeLessThan(111);
  });
  it("tháp canh không bị đánh sẽ hạ hết lính: sát thương nhà giảm mạnh", () => {
    const o = out({ ...base, defenses: [tower] }, two);
    expect(o.reason).toBe("wiped"); expect(o.lost.sword).toBe(10); expect(o.damage).toBeLessThan(60);
  });
  it("thả cạnh tháp thì diệt được tháp (lính đánh thứ gần nhất)", () => {
    const o = out({ ...base, defenses: [tower] }, [{ t: 0, unit: "sword", n: 5, x: 1, z: 12.5 }, { t: 0, unit: "sword", n: 5, x: -1, z: 12.5 }]);
    expect(o.defsDown).toBe(1); expect(o.damage).toBeGreaterThan(0);
  });
  it("bẫy nổ 1 lần khi lính bước vào, gây sát thương lan tối đa splashMax lính", () => {
    const s: Snapshot = { ...base, traps: [{ id: "x", code: "trap_spike", x: 5.5, z: 0, dmg: 35, trigger: 1.6, splash: 2.2 }] };
    const sim = createSim(s); deploy(sim, two[0]);
    let sprung = 0; while (!sim.ended && sim.tick < 50) sprung += step(sim).filter((e) => e.e === "trap").length;
    expect(sprung).toBe(1); expect(sim.atk[0].hp).toBe(300 - 35 * 4);
  });
  it("xe pháo nổ lan trúng nhiều tốp đứng gần nhau", () => {
    const cannon = { id: "c", code: "def_cannon", x: 0, z: 6, r: 2, hp: 5000, dmg: 30, hitSec: 2.5, range: 7.5, splash: 2.5 };
    const sim = createSim({ ...base, defenses: [cannon] });
    deploy(sim, { t: 0, unit: "sword", n: 5, x: 0.5, z: 12.4 }); deploy(sim, { t: 0, unit: "sword", n: 5, x: -0.5, z: 12.4 });
    while (!sim.ended && !(sim.atk[0].hp < 300)) step(sim);
    expect(sim.atk[0].hp).toBe(300 - 30 * 4); expect(sim.atk[1].hp).toBe(300 - 30 * 4);
  });
  it("đội gác xông ra khi địch vào tầm; Kỵ binh ưu tiên tháp; Máy bắn đá chỉ bắn nhà", () => {
    const s: Snapshot = { ...base, defenses: [tower], guards: [{ unit: "sword", qty: 5, x: 8, z: 3, hp: 60, dps: 5, hitSec: 1, range: 1.5, speed: 3.5 }],
      army: [{ unit: "knight", qty: 2, hp: 320, dps: 70, hitSec: 1.2, range: 1.8, speed: 4.5, target: "defense" }, { unit: "catapult", qty: 1, hp: 220, dps: 200, hitSec: 3, range: 13, speed: 1.8, target: "house" }] };
    const sim = createSim(s);
    deploy(sim, { t: 0, unit: "knight", n: 2, x: 12, z: 0 }); deploy(sim, { t: 0, unit: "catapult", n: 1, x: 17, z: 0 });
    step(sim);
    expect(sim.atk[0].target).toEqual({ k: "def", i: 0 }); expect(sim.atk[1].target).toEqual({ k: "house" });
    for (let i = 0; i < 30; i++) step(sim);
    expect(sim.guards[0].state).not.toBe("idle");
  });
  it("vùng cấm & nhật ký giả bị từ chối (BTL-07, BTL-08)", () => {
    const sim = createSim({ ...base, defenses: [tower] });
    expect(deployError(sim, { t: 0, unit: "sword", n: 5, x: 5, z: 0 })).toBe("TOO_CLOSE");            // sát nhà (3 + 4 m)
    expect(deployError(sim, { t: 0, unit: "sword", n: 5, x: 3, z: 11 })).toBe("TOO_CLOSE");           // sát tháp
    expect(deployError(sim, { t: 0, unit: "sword", n: 5, x: 25, z: 0 })).toBe("OUT_OF_BOUNDS");
    expect(deployError(sim, { t: 0, unit: "sword", n: 6, x: 15, z: 0 })).toBe("BAD_COUNT");
    expect(deployError(sim, { t: 0, unit: "dragon", n: 1, x: 15, z: 0 })).toBe("NO_UNIT");
    expect(runBattle(base, [{ t: 0, unit: "sword", n: 999, x: 15, z: 0 }])).toMatchObject({ ok: false, error: "BAD_COUNT" });
    expect(runBattle(base, [...two, { t: 0, unit: "sword", n: 1, x: 15, z: 0 }])).toMatchObject({ ok: false, error: "BAD_COUNT", index: 2 });   // quá 10 lính
    expect(runBattle(base, [{ t: 5, unit: "sword", n: 5, x: 15, z: 0 }, { t: 2, unit: "sword", n: 5, x: 15, z: 3 }])).toMatchObject({ ok: false, error: "BAD_TIME" });
  });
  it("nhà lệch tâm: mục tiêu & vùng cấm tính theo tâm nhà thật", () => {
    const s: Snapshot = { ...base, house: { ...base.house, x: -1, z: -1 } };
    expect(out(s, [{ t: 0, unit: "sword", n: 5, x: 6, z: -1 }, { t: 0, unit: "sword", n: 5, x: -8, z: -1 }]).damage).toBe(111);
    const sim = createSim(s);
    expect(deployError(sim, { t: 0, unit: "sword", n: 5, x: 5.9, z: -1 })).toBe("TOO_CLOSE");
    expect(deployError(sim, { t: 0, unit: "sword", n: 5, x: 6, z: -1 })).toBeNull();
  });
  it("TC-47 tường bao quanh nhà: lính phải phá tường rồi mới đánh nhà → sát thương nhỏ hơn", () => {
    const ring: { x: number; z: number; hp: number }[] = [];
    for (let k = -3; k <= 3; k++) for (const [x, z] of [[k * 2, -6], [k * 2, 6], [-6, k * 2], [6, k * 2]]) if (!ring.some((w) => w.x === x && w.z === z)) ring.push({ x, z, hp: 300 });
    const walled: Snapshot = { ...base, walls: ring };
    const d = [{ t: 0, unit: "sword", n: 5, x: 12, z: 0 }, { t: 0, unit: "sword", n: 5, x: -12, z: 0 }];
    const free = out(base, d), blocked = out(walled, d);
    expect(blocked.wallsDown).toBeGreaterThan(0);
    expect(blocked.damage).toBeLessThan(free.damage);
    const sim = createSim(walled);
    expect(deployError(sim, { t: 0, unit: "sword", n: 5, x: 6, z: 0 })).toBe("TOO_CLOSE");   // không thả lên tường
  });
  it("cung thủ bắn qua tường (tầm đủ thì không cần phá)", () => {
    const wall: Snapshot = { ...base, walls: [{ x: 5, z: 0, hp: 100000 }], army: [{ unit: "archer", qty: 5, hp: 40, dps: 25, hitSec: 1, range: 8, speed: 3.2, target: "any" }] };
    const o = out(wall, [{ t: 0, unit: "archer", n: 5, x: 11, z: 0 }]);
    expect(o.damage).toBeGreaterThan(0); expect(o.wallsDown).toBe(0);
  });
  it("sát thương không vượt HP hiện tại; nhà sập thì trận dừng", () => {
    const o = out({ ...base, house: { ...base.house, hp: 20 } }, two);
    expect(o.damage).toBe(20); expect(o.hpAfter).toBe(0); expect(o.reason).toBe("ruin"); expect(o.ticks).toBeLessThan(600);
  });
  it("tự rải quân: thả hết, hợp lệ, xác định", () => {
    const s: Snapshot = { ...base, defenses: [tower], army: [{ ...sword, qty: 12 }, { unit: "archer", qty: 3, hp: 40, dps: 25, hitSec: 1, range: 8, speed: 3.2, target: "any" }] };
    const d = autoDeploys(s);
    expect(d.reduce((a, x) => a + x.n, 0)).toBe(15); expect(d).toEqual(autoDeploys(s));
    expect(runBattle(s, d).ok).toBe(true);
  });
});

describe("dựng ảnh chụp (snapshot)", () => {
  const c = { BASE_GRID_SIZE: 20, ARMY_UPGRADE_ATK_PCT: 0.15, DEFENDER_ARMY_RATIO: 0.5, HOUSE_ARMOR_K: 300, DEFENSE_HOUSE_LEVEL_PCT: 0.2, BATTLE_SECONDS: 60, BATTLE_TICK_MS: 100, HOUSE_DAMAGE_RATIO: 0.02, GUARD_AGGRO_M: 8, DEPLOY_MIN_DIST_M: 4, DEPLOY_GROUP_SIZE: 5, BATTLE_MAX_GROUPS: 24, SPLASH_MAX_HITS: 4 };
  it("giáp, hệ số cấp nhà, đội gác 50%, sức đánh có cấp quân + vũ khí + rồng", () => {
    const s = buildSnapshot(
      { houseLevel: 2, houseHp: 800, houseMaxHp: 1000, houseSize: 3, def: 100, armyLevel: 2, placed: [
        { kind: "DEFENSE", ref: "a", x: 2, z: 2, rot: 0, code: "def_tower", size: 2, stats: { hp: 800, dmg: 10, hit_sec: 0.8, range: 9, splash: 0 } },
        { kind: "TRAP", ref: "b", x: 0, z: 0, rot: 0, code: "trap_spike", size: 1, stats: { dmg: 35, trigger: 1.6, splash: 2.2 } },
        { kind: "UNIT", ref: "sword", x: 12, z: 12, rot: 0, code: "sword", size: 2, qty: 5, stats: { atk: 10, hp: 60, speed: 3.5, range: 1.5, hit_sec: 1 } },
        { kind: "PET", ref: "p", x: 5, z: 5, rot: 0, code: "cat", size: 1, stats: {} },
      ] },
      { army: [{ unit: "sword", qty: 8, stats: { atk: 10, hp: 60, speed: 3.5, range: 1.5, hit_sec: 1, target: "any" } }], armyLevel: 2, weaponPcts: [0.1], dragonPct: 0.05 }, 20, c);
    expect(s.house.armor).toBeCloseTo(0.25); expect(s.house.r).toBe(3); expect(s.half).toBe(20);
    expect([s.house.x, s.house.z]).toEqual([-1, -1]);   // nhà 3×3 trên lưới 20: ô 8..10 → tâm lệch 1 m
    expect(s.defenses).toHaveLength(1); expect(s.defenses[0]).toMatchObject({ hp: 1120, x: -14, z: -14, r: 2 }); expect(s.defenses[0].dmg).toBeCloseTo(14);
    expect(s.traps[0]).toMatchObject({ x: -19, z: -19 }); expect(s.traps[0].dmg).toBeCloseTo(49);
    expect(s.guards[0].dps).toBeCloseTo(10 * 1.3 * 0.5); expect(s.guards[0].qty).toBe(5);
    expect(s.army[0].dps).toBeCloseTo(10 * 1.3 * 1.1 * 1.05);
  });
});
