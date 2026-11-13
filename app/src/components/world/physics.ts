import { OBSTACLES, WORLD_HALF, ZONES, MY_HOUSE, PARTNER_HOUSE, SPAWN, type Zone } from "./data";

export type CarState = { x: number; z: number; h: number; v: number };
export type Keys = { up: boolean; down: boolean; left: boolean; right: boolean };
export type Obstacle = { x: number; z: number; r: number };

// 1 bước vật lý kinematic: tăng tốc/phanh, lái theo tốc độ, va chạm hình tròn, giới hạn bản đồ (W3D-01)
export function stepCar(s: CarState, k: Keys, dtRaw: number, obstacles: Obstacle[] = OBSTACLES): CarState {
  const dt = Math.min(dtRaw, 0.05);
  const acc = (k.up ? 1 : 0) - (k.down ? 0.7 : 0);
  let v = s.v + acc * 22 * dt;
  v *= acc === 0 ? Math.pow(0.04, dt) : Math.pow(0.5, dt);
  v = Math.max(-7, Math.min(17, v));
  const steer = (k.left ? 1 : 0) - (k.right ? 1 : 0);
  const h = s.h + steer * 2.2 * dt * Math.min(1, Math.abs(v) / 5) * Math.sign(v || 1);
  let x = s.x + Math.sin(h) * v * dt, z = s.z + Math.cos(h) * v * dt;
  for (const o of obstacles) {
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), min = o.r + 1.1;
    if (d < min && d > 0.001) { x = o.x + (dx / d) * min; z = o.z + (dz / d) * min; v *= 0.6; }
  }
  x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, x)); z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, z));
  return { x, z, h, v };
}

// Khu gần nhất đủ gần để tương tác (nhà mình / nhà người ấy / các khu chức năng)
export function nearestZone(x: number, z: number): Zone | null {
  let best: Zone | null = null, bd = 1e9;
  for (const zn of ZONES) { const d = Math.hypot(zn.x - x, zn.z - z); if (d < zn.r + 2.5 && d < bd) { best = zn; bd = d; } }
  if (best) return best;
  if (Math.hypot(MY_HOUSE.x - x, MY_HOUSE.z - z) < 9) return { id: "home", name: "Nhà của tôi", emoji: "🏠", href: "/base", x: MY_HOUSE.x, z: MY_HOUSE.z, r: 0, color: "" };
  if (Math.hypot(PARTNER_HOUSE.x - x, PARTNER_HOUSE.z - z) < 9) return { id: "partner", name: "Nhà người ấy", emoji: "⚔️", href: "/base/partner", x: PARTNER_HOUSE.x, z: PARTNER_HOUSE.z, r: 0, color: "" };
  return null;
}

// Điểm xuất phát: mặc định giữa làng; ?at=home|partner|arena... xuất hiện gần nơi đó, quay mặt về phía đó
export function spawnAt(at?: string): CarState {
  const target = at === "home" ? MY_HOUSE : at === "partner" ? PARTNER_HOUSE : ZONES.find((z) => z.id === at);
  if (!target) return { x: SPAWN.x, z: SPAWN.z, h: Math.PI, v: 0 };
  const sx = target.x + (target.x < 0 ? 12 : -12), sz = target.z + 10;
  return { x: sx, z: sz, h: Math.atan2(target.x - sx, target.z - sz), v: 0 };
}
