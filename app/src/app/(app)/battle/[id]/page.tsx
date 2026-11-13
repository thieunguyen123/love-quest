import { notFound } from "next/navigation";
import { requirePlayer } from "@/lib/session";
import { loadBase } from "@/lib/base";
import BattleScene from "./scene";

export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me, partner } = await requirePlayer();
  const { data: a } = await supabase.from("attacks").select("*").eq("id", id).maybeSingle();
  if (!a) notFound();
  const iAmAttacker = a.attacker_id === me.id;
  const army = await loadBase(supabase, a.attacker_id);
  const defenderBase = await loadBase(supabase, a.defender_id);
  const units = army.army.filter((x: { quantity: number }) => x.quantity > 0).map((x: { unit_code: string; quantity: number }) => army.byCode.get(x.unit_code)?.emoji ?? "🗡️");
  const attackerName = iAmAttacker ? me.display_name : partner?.display_name ?? "Người ấy";
  const defenderName = iAmAttacker ? partner?.display_name ?? "Người ấy" : me.display_name;
  return (
    <BattleScene iAmAttacker={iAmAttacker} attackerName={attackerName} defenderName={defenderName} units={units.slice(0, 6)}
      houseEmoji={defenderBase.houseDef?.emoji ?? "🏠"} atk={Math.round(a.atk)} def={Math.round(a.def)} damage={a.damage} loot={a.loot}
      hpAfter={a.defender_hp_after} maxHp={defenderBase.house?.max_hp ?? 1} shieldBroken={a.shield_broken} />
  );
}
