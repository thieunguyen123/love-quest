/* eslint-disable @typescript-eslint/no-explicit-any */
import { requirePlayer } from "@/lib/session";
import { loadBase } from "@/lib/base";
import { formatLeft } from "@/lib/time";
import { WorldLoader } from "@/components/world/world-loader";
import type { HouseInfo } from "@/components/world/houses";

export default async function WorldPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  const { at } = await searchParams;
  const { supabase, me, partner } = await requirePlayer();
  await supabase.rpc("cron_tick");
  const [mine, theirs, { data: cur }] = await Promise.all([
    loadBase(supabase, me.id), partner ? loadBase(supabase, partner.id) : Promise.resolve(null),
    supabase.from("levels").select("order_no,status,deadline_at").in("status", ["OPEN", "COUNTDOWN"]).order("order_no").limit(1),
  ]);
  const now = Date.now();
  const info = (b: any, name: string, color: string): HouseInfo => ({
    name, color, exists: !!b?.house, level: b?.house?.level ?? 0, hpPct: b?.house ? b.house.hp / b.house.max_hp : 1,
    shield: !!b?.shields.some((s: any) => s.activated_at && !s.broken_at && s.expires_at && Date.parse(s.expires_at) > now),
    pets: (b?.pets ?? []).map((p: any) => ({ code: p.pet_code, level: p.level, nickname: p.nickname })),
    squads: (b?.army ?? []).filter((a: any) => a.quantity > 0).sort((x: any, y: any) => y.quantity - x.quantity).map((a: any) => ({ unit: a.unit_code, qty: a.quantity })),
  });
  const c = cur?.[0];
  const arenaLabel = c ? (c.status === "COUNTDOWN" && c.deadline_at ? `Màn ${c.order_no} · còn ${formatLeft(Date.parse(c.deadline_at) - now)}` : `Màn ${c.order_no} đang mở`) : "Chưa có màn mở";
  return (
    <WorldLoader meId={me.id} coupleKey={[me.id, partner?.id ?? "x"].sort().join("-")} meName={me.display_name} meColor={me.favorite_color}
      partnerName={partner?.display_name ?? "Người ấy"} partnerColor={partner?.favorite_color ?? "#3b82f6"}
      myHouse={info(mine, me.display_name, me.favorite_color)} partnerHouse={info(theirs, partner?.display_name ?? "Người ấy", partner?.favorite_color ?? "#3b82f6")}
      arenaLabel={arenaLabel} arenaDeadline={c?.deadline_at ?? null} coins={me.coins} at={at} />
  );
}
