/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { loadConfig } from "@/lib/config";
import { loadBase } from "@/lib/base";
import { calcAtk, calcDef, type BattleCfg } from "@/lib/game/battle";
import { Avatar, Card } from "@/components/ui";
import { AttackPanel } from "./attack-panel";

const VN = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);

export default async function PartnerBasePage() {
  const { supabase, me, partner } = await requirePlayer();
  if (!partner) return <Card>Chưa ghép cặp.</Card>;
  await supabase.rpc("ensure_daily");
  const [mine, theirs, cfg, { data: daily }, { data: lastHit }] = await Promise.all([
    loadBase(supabase, me.id), loadBase(supabase, partner.id), loadConfig(supabase),
    supabase.from("daily_counters").select("attacks_used").eq("user_id", me.id).eq("day", VN()).maybeSingle(),
    supabase.from("attacks").select("created_at").eq("defender_id", partner.id).order("created_at", { ascending: false }).limit(1),
  ]);
  const bc: BattleCfg = { armyAtkPct: Number(cfg.ARMY_UPGRADE_ATK_PCT), defenderArmyRatio: Number(cfg.DEFENDER_ARMY_RATIO), minDamageRatio: Number(cfg.MIN_DAMAGE_RATIO), lootPerDamage: Number(cfg.LOOT_COIN_PER_DAMAGE) };
  const units = (b: any) => b.army.map((a: any) => ({ atk: Number(b.byCode.get(a.unit_code)?.stats.atk ?? 0), qty: a.quantity }));
  const petBuff = (b: any, code: string, key: string) => { const p = b.pets.find((x: any) => x.pet_code === code); return p && b.house.hp > 0 ? p.level * Number(b.byCode.get(code)?.stats[key] ?? 0) : 0; };
  const atk = calcAtk(units(mine), mine.profile!.army_level, mine.weapons.map((w: any) => Number(mine.byCode.get(w.weapon_code)?.stats.atk_pct ?? 0)), petBuff(mine, "dragon", "atk_pct_per_level"), bc);
  const def = calcDef(Number(theirs.houseDef?.stats.def ?? 0), petBuff(theirs, "corgi", "def_per_level"), units(theirs), theirs.profile!.army_level, bc);
  const now = Date.now();
  const shieldActive = theirs.shields.find((s: any) => s.activated_at && !s.broken_at && s.expires_at && Date.parse(s.expires_at) > now);
  const myShield = mine.shields.some((s: any) => s.activated_at && !s.broken_at && s.expires_at && Date.parse(s.expires_at) > now);
  const protectedUntil = lastHit?.[0] ? Date.parse(lastHit[0].created_at) + Number(cfg.POST_ATTACK_PROTECT_HOURS) * 3600000 : 0;
  const left = Number(cfg.ATTACKS_PER_DAY) - (daily?.attacks_used ?? 0);
  const t = theirs.house!;
  const reason = t.hp <= 0 ? "Nhà người ấy đã đổ nát" : shieldActive ? `🛡️ Người ấy đang có khiên (hết ${new Date(shieldActive.expires_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })})` : protectedUntil > now ? "Người ấy vừa bị tấn công, đang được bảo hộ" : left <= 0 ? "Hôm nay bạn đã hết lượt tấn công" : mine.army.every((a: any) => a.quantity === 0) ? "Bạn chưa có lính nào" : null;

  return (
    <div className="space-y-4">
      <Link href="/base" className="text-sm font-bold text-love-600">← Căn cứ của tôi</Link>
      <Card className="space-y-3">
        <div className="flex items-center gap-4">
          <Avatar url={partner.avatar_url} name={partner.display_name} color={partner.favorite_color} size={56} />
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-love-700">Nhà của {partner.display_name}</h1>
            <div className="text-sm">{theirs.houseDef?.emoji} Cấp {t.level}: {theirs.houseDef?.name_vi} {shieldActive && "· 🛡️ có khiên"}</div>
            <div className="mt-2 h-4 rounded-full bg-love-100 overflow-hidden"><div className={`h-full ${t.hp / t.max_hp < 0.3 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${(t.hp / t.max_hp) * 100}%` }} /></div>
            <div className="text-sm font-bold">HP {t.hp}/{t.max_hp}</div>
          </div>
          <div className="text-6xl" style={{ filter: t.hp === 0 ? "grayscale(1)" : undefined }}>{theirs.houseDef?.emoji}{t.hp < t.max_hp * 0.5 ? "💨" : ""}</div>
        </div>
        <div className="text-sm flex flex-wrap gap-4">
          <span>🐾 {theirs.pets.map((p: any) => `${theirs.byCode.get(p.pet_code)?.emoji}${p.level}`).join(" ") || "—"}</span>
          <span>🪖 {theirs.army.filter((a: any) => a.quantity).map((a: any) => `${theirs.byCode.get(a.unit_code)?.emoji}×${a.quantity}`).join(" ") || "Chưa có quân"}</span>
        </div>
      </Card>
      <AttackPanel partnerId={partner.id} atk={Math.round(atk)} def={Math.round(def)} reason={reason} left={left} total={Number(cfg.ATTACKS_PER_DAY)} myShield={myShield} />
    </div>
  );
}
