// Tải dữ liệu căn cứ của 1 người chơi (dùng cho /base, /base/partner, /shop, /world, /battle)
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kind, Placed } from "@/lib/game/layout";

export async function loadBase(sb: SupabaseClient, uid: string) {
  const [{ data: profile }, { data: house }, { data: pets }, { data: army }, { data: weapons }, { data: items }, { data: inv }, { data: shields }, { data: decor }, { data: layout }] = await Promise.all([
    sb.from("profiles").select("id,display_name,coins,army_level,favorite_color,avatar_url").eq("id", uid).single(),
    sb.from("user_house").select("*").eq("user_id", uid).maybeSingle(),
    sb.from("user_pets").select("*").eq("user_id", uid).order("acquired_at"),
    sb.from("user_army").select("*").eq("user_id", uid).order("unit_code"),   // thứ tự cố định → autoPlace giống nhau trên 2 máy
    sb.from("user_weapons").select("*").eq("user_id", uid).order("acquired_at"),
    sb.from("shop_items").select("*").order("sort"),
    sb.from("inventory").select("*").eq("user_id", uid),
    sb.from("shields").select("*").eq("user_id", uid),
    sb.from("user_decor").select("id,code,created_at").eq("user_id", uid).order("created_at"),
    sb.from("base_layout").select("kind,ref,x,z,rot").eq("user_id", uid),
  ]);
  const byCode = new Map<string, any>((items ?? []).map((i: any) => [i.code, i]));
  const houseDef = byCode.get(`house_${house?.level ?? 0}`);
  const capacity = 10 + 10 * (house?.level ?? 0); // hiển thị; server tính chính xác bằng game_config
  const used = (army ?? []).reduce((a: number, r: any) => a + r.quantity * (byCode.get(r.unit_code)?.slots ?? 1), 0);
  return { profile, house, pets: pets ?? [], army: army ?? [], weapons: weapons ?? [], items: items ?? [], byCode, inv: inv ?? [], shields: shields ?? [], decor: decor ?? [], layout: (layout ?? []) as Placed[], houseDef, capacity, used };
}
export type Base = Awaited<ReturnType<typeof loadBase>>;
export const tokenCount = (inv: { item_type: string; quantity: number }[], t: string) => inv.find((i) => i.item_type === t)?.quantity ?? 0;
export const activeShield = (b: Base, now = Date.now()) => b.shields.some((s: any) => s.activated_at && !s.broken_at && s.expires_at && Date.parse(s.expires_at) > now);

// ---------- dữ liệu cho cảnh 3D căn cứ (BASE-07) ----------
export type SceneItem = { kind: Kind; ref: string; code: string; size: number; name: string; emoji: string; qty?: number; level?: number; nickname?: string; model?: string };
export type BaseData = {
  owner: { id: string; name: string; color: string };
  house: { level: number; hp: number; max_hp: number; exists: boolean };
  shield: boolean; grid: number; houseSizes: number[];
  items: SceneItem[]; layout: Placed[];
};

export function baseSceneData(b: Base, grid: number): BaseData {
  const size = (code: string, dflt: number) => Number(b.byCode.get(code)?.stats?.size ?? dflt);
  const items: SceneItem[] = [
    ...b.army.filter((a: any) => a.quantity > 0).map((a: any) => ({ kind: "UNIT" as const, ref: a.unit_code, code: a.unit_code, size: size(a.unit_code, 2), name: b.byCode.get(a.unit_code)?.name_vi ?? a.unit_code, emoji: b.byCode.get(a.unit_code)?.emoji ?? "🪖", qty: a.quantity })),
    ...b.pets.map((p: any) => ({ kind: "PET" as const, ref: p.id, code: p.pet_code, size: size(p.pet_code, 1), name: b.byCode.get(p.pet_code)?.name_vi ?? p.pet_code, emoji: b.byCode.get(p.pet_code)?.emoji ?? "🐾", level: p.level, nickname: p.nickname })),
    ...b.weapons.map((w: any) => ({ kind: "WEAPON" as const, ref: w.weapon_code, code: w.weapon_code, size: size(w.weapon_code, 1), name: b.byCode.get(w.weapon_code)?.name_vi ?? w.weapon_code, emoji: b.byCode.get(w.weapon_code)?.emoji ?? "⚔️" })),
    ...b.decor.map((d: any) => ({ kind: "DECOR" as const, ref: d.id, code: d.code, size: size(d.code, 1), name: b.byCode.get(d.code)?.name_vi ?? d.code, emoji: b.byCode.get(d.code)?.emoji ?? "🌸", model: b.byCode.get(d.code)?.stats?.model ?? "bush" })),
  ];
  const houseSizes = [0, 1, 2, 3, 4, 5].map((l) => size(`house_${l}`, 2 + l));
  return {
    owner: { id: b.profile?.id ?? "", name: b.profile?.display_name || "Người ấy", color: b.profile?.favorite_color ?? "#ec4899" },
    house: { level: b.house?.level ?? 0, hp: b.house?.hp ?? 0, max_hp: b.house?.max_hp ?? 1, exists: !!b.house },
    shield: activeShield(b), grid, houseSizes, items, layout: b.layout,
  };
}
