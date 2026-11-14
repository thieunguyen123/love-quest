/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { loadBase, type BaseData, type SceneItem } from "@/lib/base";
import { TILE, type Kind, type Placed } from "@/lib/game/layout";
import type { BattleOutcome, Deploy, Snapshot } from "@/lib/game/sim";
import { BaseView } from "@/components/base3d/base-view";
import { Card } from "@/components/ui";
import BattleScene from "./scene";

// S16: xem lại trận (BTL-08). Trận có ảnh chụp → phát lại 3D bằng đúng mô phỏng; trận cũ → thẻ kết quả 2D.
export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me, partner } = await requirePlayer();
  const { data: a } = await supabase.from("attacks").select("*").eq("id", id).maybeSingle();
  if (!a) notFound();
  const iAmAttacker = a.attacker_id === me.id;
  const attackerName = iAmAttacker ? me.display_name : partner?.display_name ?? "Người ấy";
  const defenderName = iAmAttacker ? partner?.display_name ?? "Người ấy" : me.display_name;
  const head = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-extrabold text-love-700">⚔️ {attackerName} tấn công nhà {defenderName}</h1>
      <Link href="/battles" className="text-sm font-bold text-love-600 underline">📜 Nhật ký trận</Link>
    </div>
  );
  if (a.status === "PENDING") return <div className="space-y-3">{head}<Card className="text-center font-bold">⏳ Trận này đang diễn ra — chưa có kết quả.</Card></div>;
  if (a.status === "EXPIRED") return <div className="space-y-3">{head}<Card className="text-center font-bold">🏳️ Trận bị bỏ dở: không gây sát thương (lượt tấn công vẫn bị trừ).</Card></div>;

  const defenderBase = await loadBase(supabase, a.defender_id);
  const maxHp = defenderBase.house?.max_hp ?? 1;
  const army = await loadBase(supabase, a.attacker_id);
  const units = army.army.filter((x: any) => x.quantity > 0).map((x: any) => army.byCode.get(x.unit_code)?.emoji ?? "🗡️");
  const card = (
    <BattleScene iAmAttacker={iAmAttacker} attackerName={attackerName} defenderName={defenderName} units={units.slice(0, 6)}
      houseEmoji={defenderBase.houseDef?.emoji ?? "🏠"} atk={Math.round(a.atk)} def={Math.round(a.def)} damage={a.damage} loot={a.loot}
      hpAfter={a.defender_hp_after} maxHp={maxHp} shieldBroken={a.shield_broken} />
  );
  const snap = a.snapshot as Snapshot | null;
  if (!snap) return <div className="space-y-3">{head}{card}</div>;

  // dựng lại căn cứ đúng lúc bắt đầu trận từ ảnh chụp (không phụ thuộc bố cục hiện tại)
  const scene = snap.scene;
  const items: SceneItem[] = (scene?.items ?? []).map((i) => ({ kind: i.kind as Kind, ref: i.ref, code: i.code, size: i.size, name: i.name, emoji: i.emoji, level: i.level, nickname: i.nickname, model: i.model, unit: i.unit }));
  const layout: Placed[] = (scene?.items ?? []).map((i) => ({ kind: i.kind as Kind, ref: i.ref, x: i.x, z: i.z, rot: i.rot }));
  const data: BaseData = {
    owner: { id: a.defender_id, name: scene?.owner.name ?? defenderName, color: scene?.owner.color ?? "#3b82f6" },
    house: { level: snap.house.level, hp: snap.house.hp, max_hp: snap.house.maxHp, exists: true, style: scene?.owner.style ?? "classic" },
    obstacles: defenderBase.obstacles, training: [],   // vật cản hiện tại (chỉ để vẽ — trận không phụ thuộc vật cản)
    shield: false, grid: Math.round((snap.half * 2) / TILE), houseSizes: Array(6).fill((snap.house.r * 2) / TILE), items, layout,
  };
  const dl = (a.deploys ?? {}) as { list?: Deploy[]; endTick?: number | null };
  return (
    <div className="space-y-3">
      {head}
      <BaseView mode="replay" data={data} me={{ name: attackerName, color: scene?.attacker.color ?? "#ec4899" }}
        replay={{ snapshot: snap, deploys: dl.list ?? [], endTick: dl.endTick ?? null, damage: a.damage, loot: a.loot, hpAfter: a.defender_hp_after, shieldBroken: a.shield_broken, stats: (a.stats ?? null) as BattleOutcome | null }}
        fallback={card} />
    </div>
  );
}
