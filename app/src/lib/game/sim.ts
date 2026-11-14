// Mô phỏng trận đánh kiểu Clash of Clans (BTL-02, BTL-07, BTL-08; luật ở sheet 2 mục G).
// THUẦN & XÁC ĐỊNH: server chạy lại từ nhật ký rải quân để tính kết quả, client chạy cùng hàm này để hiển thị.
// Chỉ dùng + − × ÷ và Math.sqrt/min/max/ceil/round (IEEE-754) → mọi máy ra cùng kết quả. KHÔNG dùng Math.random, sin/cos, hypot.

export type TargetPref = "any" | "defense" | "house";
/** 1 loại lính của người đánh. `dps` = sát thương/giây của 1 lính, ĐÃ nhân cấp quân, vũ khí, buff rồng */
export type UnitStat = { unit: string; qty: number; hp: number; dps: number; hitSec: number; range: number; speed: number; target: TargetPref };
/** Công trình phòng thủ (tháp canh, xe pháo). x,z = tâm (mét, gốc ở tâm đảo); r = nửa cạnh */
export type DefenseSnap = { id: string; code: string; x: number; z: number; r: number; hp: number; dmg: number; hitSec: number; range: number; splash: number };
/** Đoạn tường 1×1 ô: tâm (mét), nửa cạnh 1 m */
export type WallSnap = { x: number; z: number; hp: number };
export type TrapSnap = { id: string; code: string; x: number; z: number; dmg: number; trigger: number; splash: number };
/** Đội gác = đội quân người phòng thủ đặt trong căn cứ. hp/dps của 1 lính (dps đã nhân DEFENDER_ARMY_RATIO) */
export type GuardSnap = { unit: string; qty: number; x: number; z: number; hp: number; dps: number; hitSec: number; range: number; speed: number };
export type SimCfg = { seconds: number; tickMs: number; houseRatio: number; aggro: number; deployMin: number; groupSize: number; maxGroups: number; splashMax: number };
/** Ảnh chụp trận lúc bắt đầu (lưu ở attacks.snapshot) */
export type Snapshot = {
  v: 1; half: number;
  cfg: SimCfg;
  /** x,z = tâm nhà (mét; nhà cạnh lẻ ô thì lệch tâm đảo 1 m); armor 0..1 = phần sát thương bị chặn */
  house: { level: number; x?: number; z?: number; r: number; hp: number; maxHp: number; armor: number };
  defenses: DefenseSnap[]; traps: TrapSnap[]; guards: GuardSnap[];
  walls?: WallSnap[];   // BASE-15
  army: UnitStat[];
  /** chỉ để vẽ & xem lại (mô phỏng không dùng): 2 người chơi + thú cưng/vũ khí/trang trí lúc bắt đầu trận */
  scene?: SnapScene;
};
export type SnapScene = {
  owner: { name: string; color: string; style?: string }; attacker: { name: string; color: string };
  items: { kind: string; ref: string; code: string; size: number; name: string; emoji: string; level?: number; nickname?: string; model?: string; unit?: string; x: number; z: number; rot: number }[];
};
/** 1 lần thả quân: ở tick `t`, `n` lính loại `unit` tại (x,z) mét */
export type Deploy = { t: number; unit: string; n: number; x: number; z: number };

export type Target = { k: "house" } | { k: "def"; i: number } | { k: "grp"; i: number } | { k: "wall"; i: number };
export type Group = {
  id: number; side: "A" | "G"; unit: string; n0: number; unitHp: number; hp: number; dps: number; hitTicks: number; hitSec: number;
  range: number; speed: number; pref: TargetPref; x: number; z: number; cd: number; target: Target | null; state: "idle" | "move" | "attack" | "dead";
};
export type DefState = { hp: number; cd: number };
export type EndReason = "ruin" | "time" | "wiped" | "retreat";
export type SimEvent =
  | { e: "shot"; kind: "melee" | "arrow" | "stone" | "bolt" | "ball" | "magic"; fx: number; fz: number; tx: number; tz: number; high?: boolean }
  | { e: "house"; dmg: number }
  | { e: "trap"; i: number }
  | { e: "defDown"; i: number }
  | { e: "wallDown"; i: number }
  | { e: "grpDown"; id: number }
  | { e: "end"; reason: EndReason };
export type Sim = {
  snap: Snapshot; tick: number; maxTicks: number; dt: number;
  houseHp: number;          // HP nhà (số thực) trong trận
  walls: number[];          // HP từng đoạn tường
  atk: Group[]; guards: Group[]; defs: DefState[]; traps: boolean[];   // traps[i] = còn nạp
  left: Record<string, number>; nGroups: number; lastDeployTick: number;
  ended: EndReason | null;
};
export type DeployError = "ENDED" | "NO_UNIT" | "BAD_COUNT" | "OUT_OF_BOUNDS" | "TOO_CLOSE" | "TOO_MANY_GROUPS" | "BAD_TIME";

const GROUP_R = 0.8;   // bán kính coi như của 1 tốp lính (m)
const WALL_R = 1;      // nửa cạnh 1 đoạn tường (m)
export const houseXZ = (snap: Snapshot): [number, number] => [snap.house.x ?? 0, snap.house.z ?? 0];
/** Làm tròn toạ độ về cm để client và server dùng đúng cùng 1 số */
export const q = (v: number) => Math.round(v * 100) / 100;
const dist = (ax: number, az: number, bx: number, bz: number) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
export const aliveOf = (g: { hp: number; unitHp: number }) => (g.hp <= 0 ? 0 : Math.ceil(g.hp / g.unitHp - 1e-9));

export function createSim(snap: Snapshot): Sim {
  const dt = snap.cfg.tickMs / 1000;
  const ticks = (sec: number) => Math.max(1, Math.round(sec / dt));
  const guards = snap.guards.map<Group>((g, i) => ({
    id: i, side: "G", unit: g.unit, n0: g.qty, unitHp: g.hp, hp: g.hp * g.qty, dps: g.dps, hitSec: g.hitSec, hitTicks: ticks(g.hitSec),
    range: g.range, speed: g.speed, pref: "any", x: g.x, z: g.z, cd: ticks(g.hitSec), target: null, state: "idle",
  }));
  const left: Record<string, number> = {};
  for (const u of snap.army) left[u.unit] = u.qty;
  return {
    snap, tick: 0, maxTicks: Math.round(snap.cfg.seconds / dt), dt, houseHp: snap.house.hp, atk: [], guards,
    defs: snap.defenses.map((d) => ({ hp: d.hp, cd: 0 })), traps: snap.traps.map(() => true), left, nGroups: 0, lastDeployTick: 0, ended: null,
    walls: (snap.walls ?? []).map((w) => w.hp),
  };
}

/** Vùng cấm thả quân: hình vuông quanh nhà và quanh từng công trình phòng thủ (còn hay mất đều tính), nới thêm deployMin */
export function deployError(s: Sim, d: Deploy): DeployError | null {
  if (s.ended) return "ENDED";
  const u = s.snap.army.find((a) => a.unit === d.unit);
  if (!u) return "NO_UNIT";
  if (!Number.isInteger(d.n) || d.n < 1 || d.n > s.snap.cfg.groupSize || d.n > (s.left[d.unit] ?? 0)) return "BAD_COUNT";
  if (!Number.isInteger(d.t) || d.t < s.lastDeployTick || d.t < s.tick || d.t >= s.maxTicks) return "BAD_TIME";
  if (s.nGroups >= s.snap.cfg.maxGroups) return "TOO_MANY_GROUPS";
  if (!(Math.abs(d.x) <= s.snap.half - 0.5 && Math.abs(d.z) <= s.snap.half - 0.5)) return "OUT_OF_BOUNDS";
  const m = s.snap.cfg.deployMin;
  const [hx, hz] = houseXZ(s.snap);
  if (Math.max(Math.abs(d.x - hx), Math.abs(d.z - hz)) < s.snap.house.r + m) return "TOO_CLOSE";
  for (const f of s.snap.defenses) if (Math.max(Math.abs(d.x - f.x), Math.abs(d.z - f.z)) < f.r + m) return "TOO_CLOSE";
  for (const w of s.snap.walls ?? []) if (Math.max(Math.abs(d.x - w.x), Math.abs(d.z - w.z)) < WALL_R + 0.5) return "TOO_CLOSE";
  return null;
}

/** Thả 1 tốp lính (đã kiểm tra hợp lệ). Trả về lỗi nếu không hợp lệ, không đổi trạng thái */
export function deploy(s: Sim, d0: Deploy): DeployError | null {
  const d = { ...d0, x: q(d0.x), z: q(d0.z) };
  const err = deployError(s, d);
  if (err) return err;
  const u = s.snap.army.find((a) => a.unit === d.unit)!;
  const hitTicks = Math.max(1, Math.round(u.hitSec / s.dt));
  s.atk.push({
    id: s.atk.length, side: "A", unit: u.unit, n0: d.n, unitHp: u.hp, hp: u.hp * d.n, dps: u.dps, hitSec: u.hitSec, hitTicks,
    range: u.range, speed: u.speed, pref: u.target, x: d.x, z: d.z, cd: hitTicks, target: null, state: "move",
  });
  s.left[d.unit] -= d.n; s.nGroups++; s.lastDeployTick = d.t;
  return null;
}

function targetAlive(s: Sim, t: Target | null, forAttacker: boolean): boolean {
  if (!t) return false;
  if (t.k === "house") return s.houseHp > 0;
  if (t.k === "def") return s.defs[t.i].hp > 0;
  if (t.k === "wall") return s.walls[t.i] > 0;
  return (forAttacker ? s.guards[t.i] : s.atk[t.i]).hp > 0;
}
/** tâm + bán kính của mục tiêu */
function targetPos(s: Sim, t: Target, forAttacker: boolean): [number, number, number] {
  if (t.k === "house") { const [hx, hz] = houseXZ(s.snap); return [hx, hz, s.snap.house.r]; }
  if (t.k === "def") { const d = s.snap.defenses[t.i]; return [d.x, d.z, d.r]; }
  if (t.k === "wall") { const w = s.snap.walls![t.i]; return [w.x, w.z, WALL_R]; }
  const g = forAttacker ? s.guards[t.i] : s.atk[t.i];
  return [g.x, g.z, GROUP_R];
}

function pickTarget(s: Sim, g: Group): Target | null {
  if (g.pref === "house") return s.houseHp > 0 ? { k: "house" } : null;
  let best: Target | null = null, bd = Infinity;
  const consider = (t: Target, d: number) => { if (d < bd) { bd = d; best = t; } };
  s.snap.defenses.forEach((d, i) => { if (s.defs[i].hp > 0) consider({ k: "def", i }, dist(g.x, g.z, d.x, d.z) - d.r); });
  if (g.pref === "defense" && best) return best;
  s.guards.forEach((o, i) => { if (o.hp > 0) consider({ k: "grp", i }, dist(g.x, g.z, o.x, o.z) - GROUP_R); });
  if (s.houseHp > 0) { const [hx, hz] = houseXZ(s.snap); consider({ k: "house" }, dist(g.x, g.z, hx, hz) - s.snap.house.r); }
  return best;
}

/** đoạn tường (còn đứng) mà tốp lính đang đè lên ở vị trí (x,z); -1 nếu không có */
function blockingWall(s: Sim, x: number, z: number): number {
  const ws = s.snap.walls; if (!ws) return -1;
  const r = WALL_R + GROUP_R * 0.5;
  for (let i = 0; i < ws.length; i++) if (s.walls[i] > 0 && Math.abs(x - ws[i].x) < r && Math.abs(z - ws[i].z) < r) return i;
  return -1;
}

function moveToward(g: Group, tx: number, tz: number, gap: number, step: number) {
  const d = dist(g.x, g.z, tx, tz);
  if (d <= 1e-6) return;
  const m = Math.min(step, Math.max(0, gap));
  g.x += ((tx - g.x) / d) * m; g.z += ((tz - g.z) / d) * m;
}
const shotKind = (g: Group): "melee" | "arrow" | "stone" | "magic" => (g.unit === "catapult" ? "stone" : g.unit === "mage" ? "magic" : g.range > 3 ? "arrow" : "melee");

/** Tiến 1 tick. Trả về các sự kiện để vẽ (bắn, nổ, ngã…) */
export function step(s: Sim, endNow = false): SimEvent[] {
  const ev: SimEvent[] = [];
  if (s.ended) return ev;
  const { snap, dt } = s;
  if (endNow) { s.ended = "retreat"; ev.push({ e: "end", reason: "retreat" }); return ev; }

  // 1) lính tấn công
  for (const g of s.atk) {
    if (g.hp <= 0) continue;
    if (!targetAlive(s, g.target, true)) g.target = pickTarget(s, g);
    if (!g.target) { g.state = "idle"; continue; }
    const [tx, tz, tr] = targetPos(s, g.target, true);
    const gap = dist(g.x, g.z, tx, tz) - tr - g.range;
    if (gap > 1e-6) {
      const bx = g.x, bz = g.z;
      moveToward(g, tx, tz, gap, g.speed * dt);
      const w = g.target.k === "wall" ? -1 : blockingWall(s, g.x, g.z);
      if (w < 0) { g.state = "move"; continue; }
      g.x = bx; g.z = bz; g.target = { k: "wall", i: w };   // tường chắn đường → phá tường trước
    }
    g.state = "attack";
    if (--g.cd > 0) continue;
    g.cd = g.hitTicks;
    const dmg = aliveOf(g) * g.dps * g.hitSec;
    ev.push({ e: "shot", kind: shotKind(g), fx: g.x, fz: g.z, tx, tz, high: g.target.k !== "grp" });
    if (g.target.k === "house") { const d = dmg * snap.cfg.houseRatio * (1 - snap.house.armor); s.houseHp -= d; ev.push({ e: "house", dmg: d }); }
    else if (g.target.k === "def") { const f = s.defs[g.target.i]; f.hp -= dmg; if (f.hp <= 0) ev.push({ e: "defDown", i: g.target.i }); }
    else if (g.target.k === "wall") { const i = g.target.i; s.walls[i] -= dmg; if (s.walls[i] <= 0) { ev.push({ e: "wallDown", i }); g.target = null; } }
    else { const o = s.guards[g.target.i]; o.hp -= dmg; if (o.hp <= 0) { o.state = "dead"; ev.push({ e: "grpDown", id: -1 - o.id }); } }
  }

  // 2) đội gác
  for (const g of s.guards) {
    if (g.hp <= 0) continue;
    if (!targetAlive(s, g.target, false)) {
      g.target = null; let bd = snap.cfg.aggro;
      s.atk.forEach((o, i) => { if (o.hp > 0) { const d = dist(g.x, g.z, o.x, o.z); if (d <= bd && (g.target === null || d < bd)) { bd = d; g.target = { k: "grp", i }; } } });
    }
    if (!g.target) { g.state = "idle"; continue; }
    const o = s.atk[(g.target as { i: number }).i];
    const gap = dist(g.x, g.z, o.x, o.z) - GROUP_R - g.range;
    if (gap > 1e-6) { g.state = "move"; moveToward(g, o.x, o.z, gap, g.speed * dt); continue; }
    g.state = "attack";
    if (--g.cd > 0) continue;
    g.cd = g.hitTicks;
    ev.push({ e: "shot", kind: shotKind(g), fx: g.x, fz: g.z, tx: o.x, tz: o.z });
    o.hp -= aliveOf(g) * g.dps * g.hitSec;
  }

  // 3) tháp canh / xe pháo
  snap.defenses.forEach((d, i) => {
    const f = s.defs[i];
    if (f.hp <= 0) return;
    if (f.cd > 0) f.cd--;
    if (f.cd > 0) return;
    let t: Group | null = null, bd = d.range;
    for (const o of s.atk) { if (o.hp <= 0) continue; const dd = dist(d.x, d.z, o.x, o.z); if (dd <= bd && (t === null || dd < bd)) { bd = dd; t = o; } }
    if (!t) return;
    f.cd = Math.max(1, Math.round(d.hitSec / dt));
    const tx = (t as Group).x, tz = (t as Group).z;
    ev.push({ e: "shot", kind: d.splash > 0 ? "ball" : "bolt", fx: d.x, fz: d.z, tx, tz });
    if (d.splash > 0) { for (const o of s.atk) if (o.hp > 0 && dist(tx, tz, o.x, o.z) <= d.splash) o.hp -= d.dmg * Math.min(aliveOf(o), snap.cfg.splashMax); }
    else (t as Group).hp -= d.dmg;
  });

  // 4) bẫy
  snap.traps.forEach((tr, i) => {
    if (!s.traps[i]) return;
    if (!s.atk.some((o) => o.hp > 0 && dist(tr.x, tr.z, o.x, o.z) <= tr.trigger)) return;
    s.traps[i] = false; ev.push({ e: "trap", i });
    for (const o of s.atk) if (o.hp > 0 && dist(tr.x, tr.z, o.x, o.z) <= tr.splash) o.hp -= tr.dmg * Math.min(aliveOf(o), snap.cfg.splashMax);
  });

  for (const g of s.atk) if (g.hp <= 0 && g.state !== "dead") { g.state = "dead"; g.target = null; ev.push({ e: "grpDown", id: g.id }); }

  s.tick++;
  const allOut = snap.army.every((u) => (s.left[u.unit] ?? 0) <= 0);
  if (s.houseHp <= 0) s.ended = "ruin";
  else if (s.tick >= s.maxTicks) s.ended = "time";
  else if (allOut && s.atk.every((g) => g.hp <= 0)) s.ended = "wiped";
  if (s.ended) ev.push({ e: "end", reason: s.ended });
  return ev;
}

export type BattleOutcome = {
  damage: number; hpAfter: number; ticks: number; reason: EndReason;
  lost: Record<string, number>; deployed: Record<string, number>; defsDown: number; trapsHit: number; guardsDown: number; wallsDown: number;
  /** lính gác của người bị đánh đã chết, theo loại (server trừ quân thật) */
  guardsLost: Record<string, number>;
};
export function outcome(s: Sim): BattleOutcome {
  const hp0 = s.snap.house.hp;
  const damage = Math.max(0, Math.min(hp0, Math.round(hp0 - Math.max(0, s.houseHp))));
  const lost: Record<string, number> = {}, deployed: Record<string, number> = {};
  for (const g of s.atk) { deployed[g.unit] = (deployed[g.unit] ?? 0) + g.n0; lost[g.unit] = (lost[g.unit] ?? 0) + (g.n0 - aliveOf(g)); }
  const guardsLost: Record<string, number> = {};
  for (const g of s.guards) { const d = g.n0 - aliveOf(g); if (d > 0) guardsLost[g.unit] = (guardsLost[g.unit] ?? 0) + d; }
  return {
    damage, hpAfter: hp0 - damage, ticks: s.tick, reason: s.ended ?? "time", lost, deployed,
    defsDown: s.defs.filter((d) => d.hp <= 0).length, wallsDown: s.walls.filter((w) => w <= 0).length, trapsHit: s.traps.filter((t) => !t).length, guardsDown: s.guards.filter((g) => g.hp <= 0).length,
    guardsLost,
  };
}

/**
 * Chạy cả trận từ nhật ký rải quân (server). `endTick` = tick người đánh bấm Kết thúc (không có = đánh tới khi tự hết).
 * Nhật ký không hợp lệ → { error } (server từ chối).
 */
export function runBattle(snap: Snapshot, deploys: Deploy[], endTick?: number | null): { ok: true; out: BattleOutcome; sim: Sim } | { ok: false; error: DeployError; index: number } {
  const s = createSim(snap);
  let i = 0;
  while (!s.ended) {
    while (i < deploys.length && deploys[i].t <= s.tick) {
      const err = deploys[i].t < s.tick ? "BAD_TIME" : deploy(s, deploys[i]);
      if (err) return { ok: false, error: err, index: i };
      i++;
    }
    step(s, endTick != null && s.tick >= endTick);
  }
  if (i < deploys.length) return { ok: false, error: s.ended === "retreat" ? "BAD_TIME" : "ENDED", index: i };
  return { ok: true, out: outcome(s), sim: s };
}

/**
 * Tự rải toàn bộ quân ở tick 0 quanh mép đảo (dùng cho nút "Tự rải quân" và giao diện 2D không có WebGL).
 * Xác định: cùng ảnh chụp → cùng nhật ký. Kỵ binh thả trước (đỡ đòn), máy bắn đá sau cùng.
 */
export function autoDeploys(snap: Snapshot, from?: Sim): Deploy[] {
  const s = from ?? createSim(snap);
  const out: Deploy[] = [];
  const e = snap.half - 1.5, pts: [number, number][] = [];
  const N = 6;
  for (let i = 0; i < N; i++) { const k = -e + ((i + 0.5) * 2 * e) / N; pts.push([k, e], [e, -k], [-k, -e], [-e, k]); }
  const order = ["knight", "sword", "archer", "catapult"];
  const units = [...snap.army].sort((a, b) => (order.indexOf(a.unit) + 99) % 99 - (order.indexOf(b.unit) + 99) % 99 || (a.unit < b.unit ? -1 : 1));
  let p = 0;
  for (const u of units) {
    let guard = 0;
    while ((s.left[u.unit] ?? 0) > 0 && guard++ < 200) {
      const [x, z] = pts[p++ % pts.length];
      const d: Deploy = { t: s.tick, unit: u.unit, n: Math.min(snap.cfg.groupSize, s.left[u.unit]), x: q(x), z: q(z) };
      const err = deploy(s, d);
      if (!err) out.push(d);
      else if (err !== "TOO_CLOSE" && err !== "OUT_OF_BOUNDS") break;
    }
  }
  return out;
}
