// Vật cản quanh căn cứ (BASE-13): cây, bụi, đá, núi nhỏ phủ VÒNG NGOÀI lưới. Trả xu để dọn → mở rộng chỗ xây.
// THUẦN & XÁC ĐỊNH: seed sinh ra 1 lần vào bảng `obstacles` (dùng chung cho mọi người chơi); ai dọn cái nào lưu ở `base_clear`.
import type { Rect } from "./layout";

export type ObstacleKind = { code: string; name: string; emoji: string; size: number; model: string };
export const OBSTACLE_KINDS: ObstacleKind[] = [
  // mô hình nhẹ (≤ 1.100 tam giác) vì có cả trăm vật cản — giữ 60 FPS trên điện thoại (SYS-05)
  { code: "bush", name: "Bụi cây", emoji: "🌿", size: 1, model: "bush" },
  { code: "rock", name: "Tảng đá", emoji: "🪨", size: 1, model: "rock_single_B" },
  { code: "trees", name: "Lùm cây", emoji: "🌳", size: 2, model: "trees_A_medium" },
  { code: "pines", name: "Rừng thông", emoji: "🌲", size: 2, model: "trees_B_medium" },
  { code: "boulder", name: "Đồi đá", emoji: "⛰️", size: 3, model: "rts_mountain" },
];
export type Obstacle = { id: string; code: string; x: number; z: number; size: number; price: number };

/**
 * Sinh vật cản phủ phần lưới NGOÀI vùng trống ở giữa (cạnh `free` ô). `density` 0..1 = tỉ lệ ô bị phủ (xấp xỉ).
 * Giá dọn = số ô × costPerCell (núi đá đắt hơn ×1,5).
 */
export function generateObstacles(grid: number, free: number, costPerCell: number, density = 0.75, seed = 2026): Obstacle[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const f0 = Math.floor((grid - free) / 2), f1 = f0 + free;
  const used = new Set<string>();
  const inFree = (x: number, z: number) => x >= f0 && x < f1 && z >= f0 && z < f1;
  const fits = (x: number, z: number, n: number) => {
    if (x + n > grid || z + n > grid) return false;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (used.has(`${x + i},${z + j}`) || inFree(x + i, z + j)) return false;
    return true;
  };
  const out: Obstacle[] = [];
  for (let z = 0; z < grid; z++) for (let x = 0; x < grid; x++) {
    if (inFree(x, z) || used.has(`${x},${z}`) || rnd() > density) continue;
    const r = rnd();
    const kind = r < 0.12 ? OBSTACLE_KINDS[4] : r < 0.55 ? OBSTACLE_KINDS[r < 0.33 ? 2 : 3] : OBSTACLE_KINDS[r < 0.8 ? 0 : 1];
    const k = [kind, ...OBSTACLE_KINDS.filter((o) => o.size < kind.size).reverse()].find((o) => fits(x, z, o.size));
    if (!k) continue;
    for (let i = 0; i < k.size; i++) for (let j = 0; j < k.size; j++) used.add(`${x + i},${z + j}`);
    out.push({ id: `o${out.length + 1}`, code: k.code, x, z, size: k.size, price: Math.round(k.size * k.size * costPerCell * (k.code === "boulder" ? 1.5 : 1)) });
  }
  return out;
}
export const obstacleKind = (code: string) => OBSTACLE_KINDS.find((o) => o.code === code) ?? OBSTACLE_KINDS[0];
export const obstacleRects = (obs: { x: number; z: number; size: number }[]): Rect[] => obs.map((o) => ({ x: o.x, z: o.z, s: o.size }));
