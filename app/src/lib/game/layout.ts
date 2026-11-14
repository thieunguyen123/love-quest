// Bố cục căn cứ kiểu Clash of Clans (BASE-07). Twin của SQL save_base_layout: cùng luật kiểm tra.
export type Kind = "UNIT" | "PET" | "WEAPON" | "DECOR" | "DEFENSE" | "TRAP" | "WALL" | "FACTORY";
export type Placed = { kind: Kind; ref: string; x: number; z: number; rot: number };
/** `near` = khoá (kind:ref) của vật mà vật này nên đứng sát cạnh khi tự đặt (lính → nhà máy luyện ra nó) */
export type Item = { kind: Kind; ref: string; size: number; near?: string };
export type Rect = { x: number; z: number; s: number };

export const TILE = 2;   // mét / ô
export const keyOf = (p: { kind: Kind; ref: string }) => `${p.kind}:${p.ref}`;

export function houseRect(grid: number, houseSize: number): Rect {
  const h0 = Math.floor((grid - houseSize) / 2);
  return { x: h0, z: h0, s: houseSize };
}
export const overlap = (a: Rect, b: Rect) => a.x < b.x + b.s && a.x + a.s > b.x && a.z < b.z + b.s && a.z + a.s > b.z;
export const inGrid = (r: Rect, grid: number) => r.x >= 0 && r.z >= 0 && r.x + r.s <= grid && r.z + r.s <= grid;

export type LayoutError = "OUT_OF_BOUNDS" | "OVERLAP_HOUSE" | "OVERLAP_OBSTACLE" | "OVERLAP" | "DUPLICATE_ITEM" | "ITEM_NOT_OWNED";

/** Kiểm tra 1 vị trí cho `item` khi các vật khác (trừ chính nó) đã nằm trong `placed`. `blocked` = vật cản chưa dọn (BASE-13) */
export function canPlace(item: Item, x: number, z: number, placed: Placed[], sizeOf: (p: Placed) => number, grid: number, houseSize: number, blocked: Rect[] = []): LayoutError | null {
  const r = { x, z, s: item.size };
  if (!inGrid(r, grid)) return "OUT_OF_BOUNDS";
  if (overlap(r, houseRect(grid, houseSize))) return "OVERLAP_HOUSE";
  for (const b of blocked) if (overlap(r, b)) return "OVERLAP_OBSTACLE";
  for (const p of placed) if (keyOf(p) !== keyOf(item) && overlap(r, { x: p.x, z: p.z, s: sizeOf(p) })) return "OVERLAP";
  return null;
}

/** Kiểm tra cả bố cục (giống server) */
export function validateLayout(placed: Placed[], owned: Map<string, Item>, grid: number, houseSize: number, blocked: Rect[] = []): LayoutError | null {
  const seen = new Set<string>();
  for (const p of placed) {
    const k = keyOf(p);
    if (seen.has(k)) return "DUPLICATE_ITEM"; seen.add(k);
    if (!owned.has(k)) return "ITEM_NOT_OWNED";
  }
  const size = (p: Placed) => owned.get(keyOf(p))!.size;
  for (const p of placed) {
    const e = canPlace(owned.get(keyOf(p))!, p.x, p.z, placed, size, grid, houseSize, blocked);
    if (e) return e;
  }
  return null;
}

/**
 * Đặt tự động các vật chưa có chỗ: quét các vòng quanh nhà từ trong ra ngoài, vị trí đầu tiên hợp lệ.
 * Xác định (deterministic) để 2 máy thấy giống nhau. Vật đã đặt giữ nguyên; vật không còn sở hữu bị bỏ.
 */
export function autoPlace(saved: Placed[], items: Item[], grid: number, houseSize: number, blocked: Rect[] = []): { placed: Placed[]; unplaced: Item[] } {
  const owned = new Map(items.map((i) => [keyOf(i), i]));
  const placed: Placed[] = [];
  const size = (p: Placed) => owned.get(keyOf(p))?.size ?? 1;
  for (const p of saved) if (owned.has(keyOf(p)) && !canPlace(owned.get(keyOf(p))!, p.x, p.z, placed, size, grid, houseSize, blocked)) placed.push(p);
  const done = new Set(placed.map(keyOf));
  const h = houseRect(grid, houseSize);
  const cx = h.x + h.s / 2, cz = h.z + h.s / 2;
  // các ô theo khoảng cách tới tâm nhà (vòng trong trước), cố định thứ tự
  const cells: [number, number][] = [];
  for (let x = 0; x < grid; x++) for (let z = 0; z < grid; z++) cells.push([x, z]);
  const unplaced: Item[] = [];
  // vật to đặt trước để không bị vật nhỏ chiếm chỗ; vật có `near` đặt sau vật nó bám theo; tường đặt sau cùng (vòng quanh nhà)
  const order = [...items].filter((i) => !done.has(keyOf(i)) && i.kind !== "WALL").sort((a, b) => (a.near ? 1 : 0) - (b.near ? 1 : 0) || b.size - a.size);
  const unplacedWalls = items.filter((i) => !done.has(keyOf(i)) && i.kind === "WALL");
  for (const it of order) {
    const anchor = it.near ? placed.find((p) => keyOf(p) === it.near) : undefined;
    const ax = anchor ? anchor.x + size(anchor) / 2 : cx, az = anchor ? anchor.z + size(anchor) / 2 : cz, ar = anchor ? size(anchor) / 2 : h.s / 2;
    const sorted = cells
      .map(([x, z]) => ({ x, z, d: Math.max(Math.abs(x + it.size / 2 - ax), Math.abs(z + it.size / 2 - az)) + (Math.abs(x + it.size / 2 - ax) + Math.abs(z + it.size / 2 - az)) * 0.01 }))
      .sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);
    // chừa 1 ô trống quanh nhà làm "sân" cho đẹp (bám nhà máy thì đứng sát rìa nhà máy)
    const spot = sorted.find((c) => c.d >= ar + it.size / 2 + (anchor ? 0 : 1) && !canPlace(it, c.x, c.z, placed, size, grid, houseSize, blocked))
      ?? sorted.find((c) => !canPlace(it, c.x, c.z, placed, size, grid, houseSize, blocked));
    if (spot) placed.push({ kind: it.kind, ref: it.ref, x: spot.x, z: spot.z, rot: 0 });
    else unplaced.push(it);
  }
  // tường mới mua tự xây thành vòng quanh nhà (cách nhà 2 ô, đầy thì vòng ngoài hơn) — thứ tự cố định để 2 máy & server thấy giống nhau
  const pool = [...unplacedWalls];
  for (let g = 2; pool.length && g < grid; g++) {
    const x0 = h.x - g - 1, z0 = h.z - g - 1, x1 = h.x + h.s + g, z1 = h.z + h.s + g;
    if (x0 < 0 && z0 < 0 && x1 >= grid && z1 >= grid) break;
    const ring: [number, number][] = [];
    for (let x = x0; x <= x1; x++) ring.push([x, z0]);
    for (let z = z0 + 1; z <= z1; z++) ring.push([x1, z]);
    for (let x = x1 - 1; x >= x0; x--) ring.push([x, z1]);
    for (let z = z1 - 1; z > z0; z--) ring.push([x0, z]);
    for (const [x, z] of ring) {
      if (!pool.length) break;
      if (canPlace(pool[0], x, z, placed, size, grid, houseSize, blocked)) continue;
      const w = pool.shift()!; placed.push({ kind: "WALL", ref: w.ref, x, z, rot: 0 });
    }
  }
  return { placed, unplaced: [...unplaced, ...pool] };
}

/** Tâm (mét) của 1 vật trên lưới, gốc toạ độ = tâm lưới */
export function cellCenter(x: number, z: number, s: number, grid: number) {
  return { x: (x + s / 2 - grid / 2) * TILE, z: (z + s / 2 - grid / 2) * TILE };
}
/** Ô (góc trên-trái) gần nhất để đặt vật kích thước s có tâm gần điểm (mét) */
export function cellFromPoint(px: number, pz: number, s: number, grid: number) {
  return { x: Math.round(px / TILE + grid / 2 - s / 2), z: Math.round(pz / TILE + grid / 2 - s / 2) };
}
