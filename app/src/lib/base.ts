// Tải dữ liệu căn cứ của 1 người chơi (dùng cho /base, /base/partner, /shop, /world)
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadBase(sb: SupabaseClient, uid: string) {
  const [{ data: profile }, { data: house }, { data: pets }, { data: army }, { data: weapons }, { data: items }, { data: inv }, { data: shields }] = await Promise.all([
    sb.from("profiles").select("id,display_name,coins,army_level,favorite_color,avatar_url").eq("id", uid).single(),
    sb.from("user_house").select("*").eq("user_id", uid).maybeSingle(),
    sb.from("user_pets").select("*").eq("user_id", uid),
    sb.from("user_army").select("*").eq("user_id", uid),
    sb.from("user_weapons").select("*").eq("user_id", uid),
    sb.from("shop_items").select("*").order("sort"),
    sb.from("inventory").select("*").eq("user_id", uid),
    sb.from("shields").select("*").eq("user_id", uid),
  ]);
  const byCode = new Map<string, any>((items ?? []).map((i: any) => [i.code, i]));
  const houseDef = byCode.get(`house_${house?.level ?? 0}`);
  const capacity = 10 + 10 * (house?.level ?? 0); // hiển thị; server tính chính xác bằng game_config
  const used = (army ?? []).reduce((a: number, r: any) => a + r.quantity * (byCode.get(r.unit_code)?.slots ?? 1), 0);
  return { profile, house, pets: pets ?? [], army: army ?? [], weapons: weapons ?? [], items: items ?? [], byCode, inv: inv ?? [], shields: shields ?? [], houseDef, capacity, used };
}
export const tokenCount = (inv: { item_type: string; quantity: number }[], t: string) => inv.find((i) => i.item_type === t)?.quantity ?? 0;
