import { describe, it, expect } from "vitest";
import { autoPlace, canPlace, cellCenter, cellFromPoint, houseRect, validateLayout, keyOf, type Item, type Placed } from "./layout";

const G = 20;
const items: Item[] = [
  { kind: "UNIT", ref: "sword", size: 2 }, { kind: "UNIT", ref: "archer", size: 2 },
  { kind: "PET", ref: "p1", size: 1 }, { kind: "WEAPON", ref: "iron_sword", size: 1 },
  { kind: "DECOR", ref: "d1", size: 3 }, { kind: "DECOR", ref: "d2", size: 1 },
];
const owned = new Map(items.map((i) => [keyOf(i), i]));
const size = (p: Placed) => owned.get(keyOf(p))!.size;

describe("bố cục căn cứ (BASE-07)", () => {
  it("nhà nằm giữa lưới", () => {
    expect(houseRect(20, 2)).toEqual({ x: 9, z: 9, s: 2 });
    expect(houseRect(20, 5)).toEqual({ x: 7, z: 7, s: 5 });
  });
  it("không đặt ra ngoài lưới, đè nhà, đè vật khác", () => {
    const sword = items[0];
    expect(canPlace(sword, 19, 0, [], size, G, 3)).toBe("OUT_OF_BOUNDS");
    expect(canPlace(sword, -1, 0, [], size, G, 3)).toBe("OUT_OF_BOUNDS");
    expect(canPlace(sword, 9, 9, [], size, G, 3)).toBe("OVERLAP_HOUSE");          // nhà 3×3 ở (8..10)
    expect(canPlace(sword, 7, 7, [], size, G, 3)).toBe("OVERLAP_HOUSE");          // góc chạm 1 ô
    expect(canPlace(sword, 6, 6, [], size, G, 3)).toBeNull();                      // sát góc nhà, không đè
    const placed: Placed[] = [{ kind: "UNIT", ref: "archer", x: 0, z: 0, rot: 0 }];
    expect(canPlace(sword, 1, 1, placed, size, G, 3)).toBe("OVERLAP");
    expect(canPlace(sword, 2, 0, placed, size, G, 3)).toBeNull();                  // kề bên
  });
  it("di chuyển 1 vật không bị coi là đè lên chính nó", () => {
    const placed: Placed[] = [{ kind: "UNIT", ref: "sword", x: 0, z: 0, rot: 0 }];
    expect(canPlace(items[0], 1, 0, placed, size, G, 3)).toBeNull();
  });
  it("validateLayout: trùng / không sở hữu / hợp lệ", () => {
    const ok: Placed[] = [{ kind: "UNIT", ref: "sword", x: 0, z: 0, rot: 0 }, { kind: "PET", ref: "p1", x: 5, z: 5, rot: 1 }];
    expect(validateLayout(ok, owned, G, 3)).toBeNull();
    expect(validateLayout([...ok, ok[0]], owned, G, 3)).toBe("DUPLICATE_ITEM");
    expect(validateLayout([{ kind: "PET", ref: "khong-co", x: 0, z: 0, rot: 0 }], owned, G, 3)).toBe("ITEM_NOT_OWNED");
    expect(validateLayout([{ kind: "PET", ref: "p1", x: 9, z: 9, rot: 0 }], owned, G, 3)).toBe("OVERLAP_HOUSE");
  });
  it("autoPlace: đặt hết, hợp lệ, xác định, giữ chỗ đã lưu", () => {
    const a = autoPlace([], items, G, 3);
    expect(a.unplaced).toHaveLength(0);
    expect(a.placed).toHaveLength(items.length);
    expect(validateLayout(a.placed, owned, G, 3)).toBeNull();
    expect(autoPlace([], items, G, 3)).toEqual(a);                                // 2 máy thấy giống nhau
    const saved: Placed[] = [{ kind: "UNIT", ref: "sword", x: 0, z: 18, rot: 2 }];
    const b = autoPlace(saved, items, G, 3);
    expect(b.placed.find((p) => p.ref === "sword")).toEqual(saved[0]);
    expect(validateLayout(b.placed, owned, G, 3)).toBeNull();
  });
  it("autoPlace: bỏ vật không còn sở hữu và vật đã lưu nhưng nay bị nhà to ra đè lên", () => {
    const saved: Placed[] = [{ kind: "PET", ref: "da-ban", x: 0, z: 0, rot: 0 }, { kind: "WEAPON", ref: "iron_sword", x: 8, z: 8, rot: 0 }];
    const r = autoPlace(saved, items, G, 5);   // nhà 5×5 chiếm 7..11
    expect(r.placed.some((p) => p.ref === "da-ban")).toBe(false);
    const w = r.placed.find((p) => p.ref === "iron_sword")!;
    expect(w.x === 8 && w.z === 8).toBe(false);
    expect(validateLayout(r.placed, owned, G, 5)).toBeNull();
  });
  it("autoPlace: lưới đầy thì trả về danh sách chưa đặt được", () => {
    const many: Item[] = Array.from({ length: 30 }, (_, i) => ({ kind: "DECOR" as const, ref: `x${i}`, size: 2 }));
    const r = autoPlace([], many, 6, 2);   // lưới 6×6, nhà 2×2 → tối đa 8 vật 2×2
    expect(r.placed.length).toBeLessThanOrEqual(8);
    expect(r.placed.length + r.unplaced.length).toBe(30);
  });
  it("đổi ô ↔ mét khớp nhau", () => {
    for (const [x, z, s] of [[0, 0, 1], [3, 7, 2], [17, 17, 3]]) {
      const c = cellCenter(x, z, s, G);
      expect(cellFromPoint(c.x, c.z, s, G)).toEqual({ x, z });
    }
  });
});

describe("vật cản & mở rộng căn cứ (BASE-13)", () => {
  it("sinh vật cản xác định, chỉ ở vòng ngoài, không chồng nhau, giá theo số ô", async () => {
    const { generateObstacles } = await import("./obstacles");
    const a = generateObstacles(30, 20, 150), b = generateObstacles(30, 20, 150);
    expect(a).toEqual(b); expect(a.length).toBeGreaterThan(40);
    const cells = new Set<string>();
    for (const o of a) for (let i = 0; i < o.size; i++) for (let j = 0; j < o.size; j++) {
      const x = o.x + i, z = o.z + j, k = `${x},${z}`;
      expect(cells.has(k)).toBe(false); cells.add(k);
      expect(x >= 5 && x < 25 && z >= 5 && z < 25).toBe(false);
      expect(x < 30 && z < 30).toBe(true);
    }
    for (const o of a) expect(o.price).toBe(Math.round(o.size * o.size * 150 * (o.code === "boulder" ? 1.5 : 1)));
  });
  it("không đặt đè vật cản chưa dọn; autoPlace tránh vật cản", () => {
    const blocked = [{ x: 0, z: 0, s: 3 }];
    expect(canPlace({ kind: "PET", ref: "p", size: 1 }, 1, 1, [], () => 1, 30, 2, blocked)).toBe("OVERLAP_OBSTACLE");
    expect(canPlace({ kind: "PET", ref: "p", size: 1 }, 3, 3, [], () => 1, 30, 2, blocked)).toBeNull();
    const many = Array.from({ length: 60 }, (_, i) => ({ kind: "DECOR" as const, ref: `d${i}`, size: 1 }));
    const ring = [{ x: 0, z: 0, s: 30 }].filter(() => false);
    const { placed } = autoPlace([], many, 30, 2, [...ring, { x: 12, z: 12, s: 6 }].filter((r) => r.x !== 12));
    expect(placed).toHaveLength(60);
    const wall = [{ x: 10, z: 10, s: 10 }];
    const r = autoPlace([], many.slice(0, 5), 30, 2, wall);
    for (const p of r.placed) expect(p.x >= 10 && p.x < 20 && p.z >= 10 && p.z < 20).toBe(false);
  });
});

describe("nhà máy & tường (BASE-04, BASE-15)", () => {
  it("lính mới luyện đứng sát rìa nhà máy của nó; tường mới tự xây vòng quanh nhà", () => {
    const items: Item[] = [
      { kind: "FACTORY", ref: "fac_sword", size: 3 },
      { kind: "UNIT", ref: "sword", size: 2, near: "FACTORY:fac_sword" },
      { kind: "WALL", ref: "w1", size: 1 }, { kind: "WALL", ref: "w2", size: 1 },
    ];
    const saved: Placed[] = [{ kind: "FACTORY", ref: "fac_sword", x: 4, z: 4, rot: 0 }];
    const { placed, unplaced } = autoPlace(saved, items, 40, 2);
    const u = placed.find((p) => p.kind === "UNIT")!;
    const d = Math.max(Math.abs(u.x + 1 - 5.5), Math.abs(u.z + 1 - 5.5));
    expect(d).toBeLessThanOrEqual(2.5);   // sát nhà máy (3×3 ở ô 4..6)
    const walls = placed.filter((p) => p.kind === "WALL");
    expect(walls).toHaveLength(2);
    expect(unplaced).toHaveLength(0);
    const h = houseRect(40, 2);
    for (const w of walls) expect(Math.max(h.x - w.x, w.x - (h.x + h.s - 1), h.z - w.z, w.z - (h.z + h.s - 1))).toBe(3);   // cách nhà 2 ô
    // đã lưu vị trí tường thì giữ nguyên
    const kept = autoPlace([...saved, { kind: "WALL", ref: "w1", x: 30, z: 30, rot: 0 }], items, 40, 2).placed.find((p) => p.ref === "w1")!;
    expect([kept.x, kept.z]).toEqual([30, 30]);
    expect(autoPlace(saved, items, 40, 2)).toEqual(autoPlace(saved, items, 40, 2));
  });
});
