// Dựng "ảnh chụp trận" (Snapshot) từ dữ liệu căn cứ người phòng thủ + quân người đánh + game_config. THUẦN (BTL-08).
import { cellCenter, houseRect, TILE, type Placed } from "./layout";
import type { DefenseSnap, GuardSnap, SimCfg, Snapshot, TargetPref, TrapSnap, UnitStat, WallSnap } from "./sim";

export type Stats = Record<string, unknown>;
export type Cfg = Record<string, number | string | boolean>;
const n = (v: unknown, d = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? d : Number(v));

export function simCfg(c: Cfg): SimCfg {
  return {
    seconds: n(c.BATTLE_SECONDS, 90), tickMs: n(c.BATTLE_TICK_MS, 100), houseRatio: n(c.HOUSE_DAMAGE_RATIO, 0.02), aggro: n(c.GUARD_AGGRO_M, 8),
    deployMin: n(c.DEPLOY_MIN_DIST_M, 4), groupSize: n(c.DEPLOY_GROUP_SIZE, 5), maxGroups: n(c.BATTLE_MAX_GROUPS, 24), splashMax: n(c.SPLASH_MAX_HITS, 4),
  };
}
/** Giáp nhà = DEF ÷ (DEF + K) — sheet 2 mục G */
export const houseArmor = (def: number, k: number) => (def <= 0 ? 0 : def / (def + Math.max(1, k)));
/** Hệ số sức đánh của quân người đánh: cấp quân × vũ khí × rồng */
export const atkMult = (armyLevel: number, weaponPcts: number[], dragonPct: number, c: Cfg) =>
  (1 + n(c.ARMY_UPGRADE_ATK_PCT, 0.15) * armyLevel) * (1 + weaponPcts.reduce((a, b) => a + b, 0)) * (1 + dragonPct);

/** Chỉ số chiến đấu của 1 loại lính từ shop_items.stats */
export function unitStat(unit: string, st: Stats, qty: number, mult: number): UnitStat {
  return { unit, qty, hp: n(st.hp, 50), dps: n(st.atk) * mult, hitSec: n(st.hit_sec, 1), range: n(st.range, 1.5), speed: n(st.speed, 3), target: (st.target as TargetPref) ?? "any" };
}
/** Hệ số mạnh thêm của công trình phòng thủ & bẫy theo cấp nhà */
export const defenseScale = (houseLevel: number, c: Cfg) => 1 + n(c.DEFENSE_HOUSE_LEVEL_PCT, 0.2) * houseLevel;

export type DefenderInput = {
  houseLevel: number; houseHp: number; houseMaxHp: number; houseSize: number; def: number;   // def = DEF nhà + Corgi
  armyLevel: number;
  /** mọi vật đã có vị trí (sau autoPlace) kèm mã & chỉ số */
  placed: (Placed & { code: string; size: number; stats: Stats; qty?: number })[];
};
export type AttackerInput = { army: { unit: string; qty: number; stats: Stats }[]; armyLevel: number; weaponPcts: number[]; dragonPct: number };

export function buildSnapshot(def: DefenderInput, atk: AttackerInput, grid: number, c: Cfg): Snapshot {
  const scale = defenseScale(def.houseLevel, c);
  const guardMult = (1 + n(c.ARMY_UPGRADE_ATK_PCT, 0.15) * def.armyLevel) * n(c.DEFENDER_ARMY_RATIO, 0.5);
  const defenses: DefenseSnap[] = [], traps: TrapSnap[] = [], guards: GuardSnap[] = [], walls: WallSnap[] = [];
  // thứ tự cố định (kind, ref) để server & client dựng giống nhau
  const sorted = [...def.placed].sort((a, b) => (a.kind + ":" + a.ref < b.kind + ":" + b.ref ? -1 : 1));
  for (const p of sorted) {
    const ctr = cellCenter(p.x, p.z, p.size, grid);
    const st = p.stats;
    if (p.kind === "DEFENSE") defenses.push({ id: p.ref, code: p.code, x: ctr.x, z: ctr.z, r: (p.size * TILE) / 2, hp: Math.round(n(st.hp) * scale), dmg: n(st.dmg) * scale, hitSec: n(st.hit_sec, 1), range: n(st.range, 8), splash: n(st.splash) });
    else if (p.kind === "WALL") walls.push({ x: ctr.x, z: ctr.z, hp: Math.round(n(st.hp, 300) * scale) });
    else if (p.kind === "TRAP") traps.push({ id: p.ref, code: p.code, x: ctr.x, z: ctr.z, dmg: n(st.dmg) * scale, trigger: n(st.trigger, 1.5), splash: n(st.splash, 2) });
    else if (p.kind === "UNIT" && (p.qty ?? 0) > 0) guards.push({ unit: p.code, qty: p.qty!, x: ctr.x, z: ctr.z, hp: n(st.hp, 50), dps: n(st.atk) * guardMult, hitSec: n(st.hit_sec, 1), range: n(st.range, 1.5), speed: n(st.speed, 3) });
  }
  const mult = atkMult(atk.armyLevel, atk.weaponPcts, atk.dragonPct, c);
  const hr = houseRect(grid, def.houseSize), hc = cellCenter(hr.x, hr.z, hr.s, grid);
  return {
    v: 1, half: (grid * TILE) / 2, cfg: simCfg(c),
    house: { level: def.houseLevel, x: hc.x, z: hc.z, r: (def.houseSize * TILE) / 2, hp: def.houseHp, maxHp: def.houseMaxHp, armor: houseArmor(def.def, n(c.HOUSE_ARMOR_K, 300)) },
    defenses, traps, guards, walls,
    army: atk.army.filter((a) => a.qty > 0).map((a) => unitStat(a.unit, a.stats, a.qty, mult)),
  };
}
