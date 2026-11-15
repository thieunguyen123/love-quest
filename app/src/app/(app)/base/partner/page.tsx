/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { loadConfig } from "@/lib/config";
import { loadBase, baseSceneData, petBuff } from "@/lib/base";
import { BaseView } from "@/components/base3d/base-view";
import { atkMult, houseArmor } from "@/lib/game/snapshot";
import { Avatar, Card } from "@/components/ui";
import { AttackPanel } from "./attack-panel";

const VN = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);

export default async function PartnerBasePage() {
  const { supabase, me, partner } = await requirePlayer();
  if (!partner) return <Card>Chưa ghép cặp.</Card>;
  await supabase.rpc("ensure_daily");
  const { data: ph } = await supabase.from("user_house").select("user_id").eq("user_id", partner.id).maybeSingle();
  if (!ph) return (
    <Card className="space-y-2 text-center">
      <div className="text-5xl">🏕️</div>
      <h1 className="text-xl font-extrabold text-love-700">{partner.display_name || "Người ấy"} chưa dựng nhà</h1>
      <p>Người ấy chưa đăng nhập lần đầu / chưa hoàn tất hồ sơ nên chưa có nhà để tấn công. Rủ người ấy vào game nhé! 💌</p>
      <Link href="/base" className="font-bold text-love-600">← Căn cứ của tôi</Link>
    </Card>
  );
  const [mine, theirs, cfg, { data: daily }, { data: lastHit }] = await Promise.all([
    loadBase(supabase, me.id), loadBase(supabase, partner.id), loadConfig(supabase),
    supabase.from("daily_counters").select("attacks_used").eq("user_id", me.id).eq("day", VN()).maybeSingle(),
    supabase.from("attacks").select("created_at").eq("defender_id", partner.id).order("created_at", { ascending: false }).limit(1),
  ]);
  // sức đánh mỗi giây của cả đội quân & giáp nhà người ấy — cùng công thức với mô phỏng (sheet 2 mục G)
  const mult = atkMult(mine.profile!.army_level, mine.weapons.map((w: any) => Number(mine.byCode.get(w.weapon_code)?.stats.atk_pct ?? 0)), petBuff(mine, "atk_pct_per_level"), cfg);
  const dps = mine.army.reduce((a: number, r: any) => a + r.quantity * Number(mine.byCode.get(r.unit_code)?.stats.atk ?? 0), 0) * mult;
  const def = Number(theirs.houseDef?.stats.def ?? 0) + petBuff(theirs, "def_per_level");
  const armorPct = Math.round(houseArmor(def, Number(cfg.HOUSE_ARMOR_K ?? 300)) * 100);
  const now = Date.now();
  // khiên của người ấy là BÍ MẬT (BTL-04): RLS không cho đọc, trang này cũng không hiện
  const myShield = mine.shields.some((s: any) => s.activated_at && !s.broken_at && s.expires_at && Date.parse(s.expires_at) > now);
  const protectedUntil = lastHit?.[0] ? Date.parse(lastHit[0].created_at) + Number(cfg.POST_ATTACK_PROTECT_HOURS) * 3600000 : 0;
  const perDay = Number(cfg.ATTACKS_PER_DAY ?? 0);   // 0 = không giới hạn (BTL-01)
  const left = perDay > 0 ? perDay - (daily?.attacks_used ?? 0) : Infinity;
  const t = theirs.house!;
  const reason = t.hp <= 0 ? "Nhà người ấy đã đổ nát" : protectedUntil > now ? "Người ấy vừa bị tấn công, đang được bảo hộ" : perDay > 0 && left <= 0 ? "Hôm nay bạn đã hết lượt tấn công" : mine.army.every((a: any) => a.quantity === 0) ? "Bạn chưa có lính nào" : null;

  const army = mine.army.filter((x: any) => x.quantity > 0).map((x: any) => ({ unit: x.unit_code, qty: x.quantity, emoji: mine.byCode.get(x.unit_code)?.emoji ?? "🪖", name: mine.byCode.get(x.unit_code)?.name_vi ?? x.unit_code }));
  const attackInfo = { reason, left, total: perDay, myShield, army, armorPct, defenses: theirs.defenses.filter((d: any) => d.kind === "DEFENSE").length, dps };
  return (
    <div className="space-y-3 max-md:-mb-4 md:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/base" className="text-sm font-bold text-love-600">← Căn cứ của tôi</Link>
        <Link href="/world?at=partner" className="text-sm font-bold text-love-600 underline">🌍 Ra làng</Link>
      </div>
      <BaseView mode="partner" data={baseSceneData(theirs, Number(cfg.BASE_GRID_SIZE ?? 20))} attack={attackInfo} me={{ name: me.display_name, color: me.favorite_color }} fillMobile className="h-[calc(100dvh-10rem)] md:h-[72vh] md:min-h-[420px]"
        fallback={<div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center gap-4">
          <Avatar url={partner.avatar_url} name={partner.display_name} color={partner.favorite_color} size={56} />
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-love-700">Nhà của {partner.display_name}</h1>
            <div className="text-sm">{theirs.houseDef?.emoji} Cấp {t.level}: {theirs.houseDef?.name_vi}</div>
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
      <AttackPanel dps={Math.round(dps)} armorPct={armorPct} reason={reason} left={left} total={perDay} myShield={myShield} army={army} />
        </div>} />
    </div>
  );
}
