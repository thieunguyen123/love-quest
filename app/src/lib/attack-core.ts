// Lõi server của trận đánh (BTL-08) — không phụ thuộc Next.js nên test tích hợp gọi thẳng được.
// Dựng ảnh chụp căn cứ bằng service role (đọc được cả bẫy), chạy mô phỏng, ghi kết quả qua RPC chỉ-server.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBase, petBuff, type Base } from "./base";
import { obstacleRects } from "./game/obstacles";
import { loadConfig } from "./config";
import { autoPlace, keyOf, type Item } from "./game/layout";
import { buildSnapshot, type Cfg } from "./game/snapshot";
import { runBattle, type Deploy, type Snapshot } from "./game/sim";


/** Mọi vật của 1 căn cứ dưới dạng Item (để autoPlace) kèm mã + chỉ số */
export function baseItems(b: Base) {
  const st = (code: string) => (b.byCode.get(code)?.stats ?? {}) as Record<string, unknown>;
  const size = (code: string, d: number) => Number(st(code).size ?? d);
  // CÙNG thứ tự & `near` như baseSceneData (lib/base.ts) → autoPlace ra cùng vị trí với màn hình
  const rows: (Item & { code: string; stats: Record<string, unknown>; qty?: number })[] = [
    ...b.factories.map((c: string) => ({ kind: "FACTORY" as const, ref: c, code: c, size: size(c, 3), stats: st(c) })),
    ...b.army.filter((a: any) => a.quantity > 0).map((a: any) => ({ kind: "UNIT" as const, ref: a.unit_code, code: a.unit_code, size: size(a.unit_code, 2), stats: st(a.unit_code), qty: a.quantity,
      near: b.factories.includes(`fac_${a.unit_code}`) ? `FACTORY:fac_${a.unit_code}` : undefined })),
    ...b.pets.map((p: any) => ({ kind: "PET" as const, ref: p.id, code: p.pet_code, size: size(p.pet_code, 1), stats: st(p.pet_code) })),
    ...b.weapons.map((w: any) => ({ kind: "WEAPON" as const, ref: w.weapon_code, code: w.weapon_code, size: size(w.weapon_code, 1), stats: st(w.weapon_code) })),
    ...b.decor.map((d: any) => ({ kind: "DECOR" as const, ref: d.id, code: d.code, size: size(d.code, 1), stats: st(d.code) })),
    ...b.defenses.map((d: any) => ({ kind: d.kind as "DEFENSE" | "TRAP" | "WALL", ref: d.id, code: d.code, size: size(d.code, d.kind === "DEFENSE" ? 2 : 1), stats: st(d.code) })),
  ];
  return rows;
}

/** Ảnh chụp trận: căn cứ `defender` (đủ bẫy) + quân `attacker`. Thứ tự vật giống baseSceneData để autoPlace ra cùng kết quả với màn hình. */
/** Quân người đánh chọn mang đi: {mã lính: số} — chỉ giữ số nguyên dương */
export function parseArmy(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100000 || !/^[a-z0-9_]{1,40}$/.test(k)) return null;
    if (n > 0) out[k] = n;
  }
  return out;
}

export async function battleSnapshot(sb: SupabaseClient, attacker: string, defender: string, pick?: Record<string, number>): Promise<{ snap: Snapshot; cfg: Cfg; atk: number; def: number } | { error: string }> {
  // lính đã luyện xong của cả 2 bên vào quân trước khi chụp căn cứ (BASE-04)
  await Promise.all([sb.rpc("_collect_training", { p_user: attacker }), sb.rpc("_collect_training", { p_user: defender })]);
  const [mine, theirs, cfg] = await Promise.all([loadBase(sb, attacker), loadBase(sb, defender), loadConfig(sb)]);
  if (!theirs.house) return { error: "NO_HOUSE" };
  const grid = Number(cfg.BASE_GRID_SIZE ?? 20);
  const items = baseItems(theirs);
  const byKey = new Map(items.map((i) => [keyOf(i), i]));
  const houseSize = Number(theirs.byCode.get(`house_${theirs.house.level}`)?.stats?.size ?? 2 + theirs.house.level);
  const { placed } = autoPlace(theirs.layout, items, grid, houseSize, obstacleRects(theirs.obstacles));   // giống hệt màn hình (baseSceneData + BaseScene)
  const def = Number(theirs.houseDef?.stats?.def ?? 0) + petBuff(theirs, "def_per_level");
  // chỉ số quân người đánh đã chọn (BTL-01); không chọn = cả đội (dùng cho test cũ)
  for (const [u, n] of Object.entries(pick ?? {})) if (n > (mine.army.find((a: any) => a.unit_code === u)?.quantity ?? 0)) return { error: "INVALID_ARMY" };
  const army = mine.army.map((a: any) => ({ unit: a.unit_code as string, qty: (pick ? pick[a.unit_code] ?? 0 : a.quantity) as number, stats: (mine.byCode.get(a.unit_code)?.stats ?? {}) as Record<string, unknown> })).filter((a) => a.qty > 0);
  if (!army.length) return { error: "NO_ARMY" };
  const snap = buildSnapshot(
    { houseLevel: theirs.house.level, houseHp: theirs.house.hp, houseMaxHp: theirs.house.max_hp, houseSize, def, armyLevel: theirs.profile?.army_level ?? 0,
      placed: placed.map((p) => { const it = byKey.get(keyOf(p))!; return { ...p, code: it.code, size: it.size, stats: it.stats, qty: it.qty }; }) },
    { army, armyLevel: mine.profile?.army_level ?? 0, weaponPcts: mine.weapons.map((w: any) => Number(mine.byCode.get(w.weapon_code)?.stats?.atk_pct ?? 0)), dragonPct: petBuff(mine, "atk_pct_per_level") },
    grid, cfg,
  );
  // phần chỉ để vẽ / xem lại: thú cưng, vũ khí, đồ trang trí đúng chỗ lúc bắt đầu trận
  const pet = (ref: string) => theirs.pets.find((x: any) => x.id === ref);
  snap.scene = {
    owner: { name: theirs.profile?.display_name || "Người ấy", color: theirs.profile?.favorite_color ?? "#3b82f6", style: theirs.house.style ?? "classic" },
    attacker: { name: mine.profile?.display_name || "Người đánh", color: mine.profile?.favorite_color ?? "#ec4899" },
    items: placed.filter((p) => p.kind === "PET" || p.kind === "WEAPON" || p.kind === "DECOR" || p.kind === "FACTORY").map((p) => {
      const it = byKey.get(keyOf(p))!; const def = theirs.byCode.get(it.code);
      return { kind: p.kind, ref: p.ref, code: it.code, size: it.size, name: def?.name_vi ?? it.code, emoji: def?.emoji ?? "", level: pet(p.ref)?.level, nickname: pet(p.ref)?.nickname, model: def?.stats?.model, unit: def?.stats?.unit, x: p.x, z: p.z, rot: p.rot };
    }),
  };
  const atk = snap.army.reduce((a, u) => a + u.dps * u.qty, 0);
  return { snap, cfg, atk, def };
}

type Reply = { status: number; body: Record<string, unknown> };
/** Bắt đầu trận: `sb` phải là service client */
/**
 * Xuất quân: `pick` = quân người đánh chọn mang đi (không truyền = cả đội). Quân mang đi rời căn cứ ở `_attack_begin`.
 * Người ấy có khiên (bí mật) → `blocked: true`, mất toàn bộ quân đã chọn, không có ảnh chụp trận.
 */
export async function beginBattle(sb: SupabaseClient, me: string, partner: string | null, pick?: Record<string, number>): Promise<Reply> {
  if (!partner) return { status: 400, body: { error: "INVALID_TARGET" } };
  const built = await battleSnapshot(sb, me, partner, pick);
  if ("error" in built) return { status: 400, body: { error: built.error } };
  const army = Object.fromEntries(built.snap.army.map((u) => [u.unit, u.qty]));
  const { data, error } = await sb.rpc("_attack_begin", { p_attacker: me, p_defender: partner, p_snapshot: built.snap, p_atk: built.atk, p_def: built.def, p_army: army });
  if (error) return { status: 400, body: { error: error.message } };
  if (data.blocked) return { status: 200, body: { id: data.id, blocked: true, lost: data.lost, shieldBroken: data.shield_broken } };
  return { status: 200, body: { id: data.id, snapshot: data.snapshot, shieldBroken: data.shield_broken, blocked: false } };
}

const fin = (v: unknown) => typeof v === "number" && Number.isFinite(v);
/** Kết thúc trận: client chỉ gửi NHẬT KÝ rải quân; server chạy lại mô phỏng trên ảnh chụp đã lưu rồi ghi kết quả */
export async function finishBattle(sb: SupabaseClient, me: string, body: { id?: unknown; deploys?: unknown; endTick?: unknown } | null): Promise<Reply> {
  if (!body || typeof body.id !== "string" || !Array.isArray(body.deploys) || body.deploys.length > 200) return { status: 400, body: { error: "INVALID_LOG" } };
  const deploys: Deploy[] = [];
  for (const d of body.deploys as Record<string, unknown>[]) {
    if (!d || typeof d.unit !== "string" || !fin(d.t) || !fin(d.n) || !fin(d.x) || !fin(d.z)) return { status: 400, body: { error: "INVALID_LOG" } };
    deploys.push({ t: d.t as number, unit: d.unit, n: d.n as number, x: d.x as number, z: d.z as number });
  }
  const endTick = fin(body.endTick) ? Math.max(0, Math.floor(body.endTick as number)) : null;
  const { data: a } = await sb.from("attacks").select("id,attacker_id,status,snapshot").eq("id", body.id).maybeSingle();
  if (!a || a.attacker_id !== me) return { status: 404, body: { error: "ATTACK_NOT_FOUND" } };
  if (a.status !== "PENDING" || !a.snapshot) return { status: 409, body: { error: "ATTACK_NOT_PENDING" } };
  const r = runBattle(a.snapshot as Snapshot, deploys, endTick);
  if (!r.ok) return { status: 400, body: { error: "INVALID_LOG", detail: r.error, index: r.index } };
  const { data, error } = await sb.rpc("_attack_finish", { p_id: a.id, p_attacker: me, p_damage: r.out.damage, p_deploys: { list: deploys, endTick }, p_stats: r.out });
  if (error) return { status: 400, body: { error: error.message } };
  return { status: 200, body: { ...data, out: r.out } };
}
