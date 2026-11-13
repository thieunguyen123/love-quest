import { ZONES, MY_HOUSE, PARTNER_HOUSE, RAMP, SPAWN, type Zone } from "./data";

// Đầu vào lái: throttle/steer trong [-1, 1] (bàn phím = ±1, joystick = analog)
export type Input = { throttle: number; steer: number; brake?: boolean; boost?: boolean };
export const CAR = { accel: 26, brakeAccel: 45, reverseAccel: 16, maxSpeed: 18, boostSpeed: 28, maxReverse: 8, steerRate: 2.5, jump: 7 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Lái kiểu arcade (W3D-01): từ tốc độ hiện tại (đọc lại từ vật lý, nên đâm tường thì tốc độ tự giảm)
 * và đầu vào → tốc độ mới theo hướng mũi xe + tốc độ quay (rad/s). Va chạm do rapier xử lý.
 */
export function drive(speed: number, inp: Input, dtRaw: number): { speed: number; yawRate: number } {
  const dt = Math.min(dtRaw, 0.05);
  const t = clamp(inp.throttle, -1, 1), st = clamp(inp.steer, -1, 1);
  const top = inp.boost ? CAR.boostSpeed : CAR.maxSpeed;
  let v = speed;
  if (inp.brake) v *= Math.pow(0.02, dt);
  else if (t > 0.05) v += t * (v < 0 ? CAR.brakeAccel : CAR.accel * (inp.boost ? 1.5 : 1)) * dt;
  else if (t < -0.05) v += t * (v > 0 ? CAR.brakeAccel : CAR.reverseAccel) * dt;
  else v *= Math.pow(0.12, dt);                 // thả ga: trôi chậm dần
  if (Math.abs(v) < 0.05 && Math.abs(t) <= 0.05) v = 0;
  // vượt trần: nếu trước đó đã nhanh hơn trần (vừa thả boost) thì giảm mượt, không thì kẹp đúng trần
  if (v > top) v = speed > top ? Math.max(top, Math.min(v, speed - 30 * dt)) : top;
  v = Math.max(v, -CAR.maxReverse);
  // không đứng yên mà quay tại chỗ; lùi thì đánh lái ngược như xe thật
  const yawRate = st * CAR.steerRate * Math.min(1, Math.abs(v) / 4) * (v < 0 ? -1 : 1);
  return { speed: v, yawRate };
}

/** Gộp bàn phím + joystick thành 1 đầu vào */
export function mergeInput(k: { up: boolean; down: boolean; left: boolean; right: boolean; brake: boolean; boost: boolean }, joy: { x: number; y: number }): Input {
  return {
    throttle: clamp((k.up ? 1 : 0) - (k.down ? 1 : 0) + joy.y, -1, 1),
    steer: clamp((k.left ? 1 : 0) - (k.right ? 1 : 0) - joy.x, -1, 1),
    brake: k.brake, boost: k.boost,
  };
}

/** Góc quay quanh trục Y từ quaternion chỉ xoay quanh Y (mũi xe hướng (sin h, cos h)) */
export const yawOf = (q: { y: number; w: number }) => 2 * Math.atan2(q.y, q.w);

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
export function spawnAt(at?: string | null): { x: number; z: number; h: number } {
  if (at === "ramp") return { x: RAMP.x, z: RAMP.z - 16, h: 0 };   // đứng trước dốc nhảy, mũi xe hướng lên dốc
  const target = at === "home" ? MY_HOUSE : at === "partner" ? PARTNER_HOUSE : ZONES.find((z) => z.id === at);
  if (!target) return { x: SPAWN.x, z: SPAWN.z, h: Math.PI };
  const sx = target.x + (target.x < 0 ? 12 : -12), sz = target.z + 10;
  return { x: sx, z: sz, h: Math.atan2(target.x - sx, target.z - sz) };
}
