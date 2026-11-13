import { notFound } from "next/navigation";
import { requirePlayer } from "@/lib/session";
import Link from "next/link";
import { loadBase, baseSceneData } from "@/lib/base";
import { loadConfig } from "@/lib/config";
import { BaseView } from "@/components/base3d/base-view";
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
  const cfg = await loadConfig(supabase);
  const maxHp = defenderBase.house?.max_hp ?? 1;
  const replay = { id: a.id, damage: a.damage, loot: a.loot, hpBefore: Math.min(maxHp, a.defender_hp_after + a.damage), hpAfter: a.defender_hp_after, maxHp, ruined: a.defender_hp_after === 0, shieldBroken: a.shield_broken };
  const squads = army.army.filter((x: { quantity: number }) => x.quantity > 0).map((x: { unit_code: string; quantity: number }) => ({ unit: x.unit_code, qty: x.quantity }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-love-700">⚔️ {attackerName} tấn công nhà {defenderName}</h1>
        <Link href="/battles" className="text-sm font-bold text-love-600 underline">📜 Nhật ký trận</Link>
      </div>
      <BaseView mode="replay" data={baseSceneData(defenderBase, Number(cfg.BASE_GRID_SIZE ?? 20))} replay={replay}
        attacker={{ name: attackerName, color: army.profile?.favorite_color ?? "#ec4899", squads }}
        fallback={<BattleScene iAmAttacker={iAmAttacker} attackerName={attackerName} defenderName={defenderName} units={units.slice(0, 6)}
      houseEmoji={defenderBase.houseDef?.emoji ?? "🏠"} atk={Math.round(a.atk)} def={Math.round(a.def)} damage={a.damage} loot={a.loot}
      hpAfter={a.defender_hp_after} maxHp={defenderBase.house?.max_hp ?? 1} shieldBroken={a.shield_broken} />} />
    </div>
  );
}
