/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { loadConfig } from "@/lib/config";
import { loadBase, tokenCount, baseSceneData } from "@/lib/base";
import { buildCatalog } from "@/lib/catalog";
import { BaseView } from "@/components/base3d/base-view";
import { Card } from "@/components/ui";
import { RpcButton } from "@/components/rpc-button";
import { BaseClient } from "./base-client";
import { ShieldPanel } from "./shield-panel";
import { queuedSlots } from "@/lib/training";

export default async function BasePage() {
  const { supabase, me } = await requirePlayer();
  await Promise.all([supabase.rpc("ensure_daily"), supabase.rpc("collect_training")]);   // lính luyện xong → vào quân
  const [b, cfg, { data: closed }] = await Promise.all([loadBase(supabase, me.id), loadConfig(supabase), supabase.from("levels").select("order_no").eq("status", "CLOSED")]);
  const grid = Number(cfg.BASE_GRID_SIZE ?? 20);
  const catalog = buildCatalog(b, cfg, new Set((closed ?? []).map((l) => l.order_no)));
  const h = b.house!;
  const hpPct = Math.round((h.hp / h.max_hp) * 100);
  const repairCost = Number(cfg.REPAIR_COST_PER_HP);
  const cap = Number(cfg.ARMY_CAP_BASE) + Number(cfg.ARMY_CAP_PER_HOUSE_LEVEL) * h.level;
  const nextHouse = b.byCode.get(`house_${h.level + 1}`);
  const tok = (t: string) => tokenCount(b.inv, t);
  // luyện quân ở nhà máy (BASE-04)
  const units = (b.items as any[]).filter((i) => i.category === "UNIT");
  const trainProps = {
    info: Object.fromEntries(units.map((u) => [u.code, { unit: u.code, name: u.name_vi, emoji: u.emoji, price: Number(u.stats.train_price), sec: Number(u.stats.train_sec), slots: u.slots }])),
    freeSlots: cap - b.used - queuedSlots(b.training, (c) => Number(b.byCode.get(c)?.slots ?? 1)),
  };
  const armyCost = Number(cfg.ARMY_UPGRADE_COST_STEP) * (me.army_level + 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-love-700">🏠 Căn cứ của {me.display_name}</h1>
        <div className="flex gap-4"><Link href="/world?at=home" className="font-bold text-love-600 underline">🌍 Ra làng</Link><Link href="/base/partner" className="font-bold text-love-600 underline">⚔️ Thăm nhà người ấy →</Link></div>
      </div>

      <BaseView mode="own" data={baseSceneData(b, grid)} catalog={catalog} coins={b.profile!.coins} train={trainProps} />

      <Card className={`space-y-3 ${h.hp === 0 ? "border-red-300" : ""}`}>
        <div className="flex items-center gap-4">
          <div className="text-6xl" style={{ filter: h.hp === 0 ? "grayscale(1)" : undefined }}>{b.houseDef?.emoji}{h.hp < h.max_hp * 0.5 ? "💨" : ""}</div>
          <div className="flex-1">
            <div className="font-extrabold text-lg">Cấp {h.level}: {b.houseDef?.name_vi}{h.hp === 0 && " — ĐỔ NÁT 💥"}</div>
            <div className="text-sm">DEF {b.houseDef?.stats.def} · chứa {cap} chỗ quân</div>
            <div className="mt-2 h-4 rounded-full bg-love-100 overflow-hidden"><div className={`h-full ${hpPct < 30 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${hpPct}%` }} /></div>
            <div className="text-sm font-bold">HP {h.hp}/{h.max_hp}</div>
          </div>
        </div>
        <BaseClient hp={h.hp} maxHp={h.max_hp} costPerHp={repairCost} coins={b.profile!.coins} />
        {nextHouse && <RpcButton fn="upgrade_house" ghost label={`⬆️ Nâng cấp lên ${nextHouse.name_vi} (${nextHouse.price.toLocaleString("vi-VN")} xu)`} disabledReason={h.hp < h.max_hp ? "Hãy sửa nhà đầy HP trước" : b.profile!.coins < nextHouse.price ? `Thiếu ${nextHouse.price - b.profile!.coins} xu` : null} />}
      </Card>

      <ShieldPanel shields={b.shields} freeCfg={Number(cfg.FREE_SHIELDS_PER_DAY)} hours={Number(cfg.SHIELD_DURATION_HOURS)} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-extrabold text-love-700">🐾 Thú cưng</h2>
          {b.pets.length === 0 && <p className="text-sm">Chưa có thú cưng. <Link className="underline font-bold" href="/shop?tab=pets">Mua ở cửa hàng</Link></p>}
          {b.pets.map((p: any) => {
            const def = b.byCode.get(p.pet_code);
            const cost = Number(cfg.PET_UPGRADE_COST_STEP) * p.level;
            const reason = p.level >= Number(cfg.PET_MAX_LEVEL) ? "Đã tối đa" : tok("PET_UPGRADE") < 1 ? "Cần 1 Nâng cấp thú cưng" : b.profile!.coins < cost ? `Thiếu ${cost - b.profile!.coins} xu` : null;
            return (
              <div key={p.id} className={`rounded-xl bg-love-50 p-3 flex items-center gap-3 ${h.hp === 0 ? "opacity-60" : ""}`}>
                <div className="text-4xl">{def?.emoji}</div>
                <div className="flex-1 min-w-0"><BaseClient petId={p.id} nickname={p.nickname} /><div className="text-xs">{def?.name_vi} · cấp {p.level}/{String(cfg.PET_MAX_LEVEL)} {["", "🐣 Sơ sinh", "🌱 Lớn", "✨ Tiến hoá", "🌟 Hào quang", "👑 Huyền thoại"][p.level] ?? ""} — {def?.stats.desc}{h.hp === 0 ? " (buồn: mất buff)" : ""}</div></div>
                <RpcButton small fn="upgrade_pet" args={{ p_id: p.id }} label={`⬆️ ${cost} xu`} disabledReason={reason} ghost />
              </div>
            );
          })}
        </Card>
        <Card className="space-y-2">
          <h2 className="font-extrabold text-love-700">🪖 Quân đội ({b.used}/{cap} chỗ)</h2>
          <div className="text-sm font-semibold">Cấp quân: {me.army_level}/{String(cfg.ARMY_MAX_LEVEL)} (+{Math.round(Number(cfg.ARMY_UPGRADE_ATK_PCT) * me.army_level * 100)}% ATK)</div>
          {b.army.filter((a: any) => a.quantity > 0).map((a: any) => <div key={a.unit_code} className="flex justify-between text-sm"><span>{b.byCode.get(a.unit_code)?.emoji} {b.byCode.get(a.unit_code)?.name_vi}</span><b>×{a.quantity}</b></div>)}
          {b.army.every((a: any) => a.quantity === 0) && <p className="text-sm">Chưa có lính. <Link className="underline font-bold" href="/shop?tab=units">Xây nhà máy & luyện quân</Link></p>}
          <RpcButton small ghost fn="upgrade_army" label={`⬆️ Nâng cấp quân (${armyCost} xu)`} disabledReason={me.army_level >= Number(cfg.ARMY_MAX_LEVEL) ? "Đã tối đa" : tok("ARMY_UPGRADE") < 1 ? "Cần 1 Nâng cấp quân đội" : b.profile!.coins < armyCost ? `Thiếu ${armyCost - b.profile!.coins} xu` : null} />
          <h3 className="font-bold pt-2">🗼 Phòng thủ</h3>
          {b.defenses.length === 0 ? <p className="text-sm">Chưa có tháp canh, xe pháo hay bẫy. <Link className="underline font-bold" href="/shop?tab=defense">Xây phòng thủ</Link></p>
            : <div className="text-sm">{[...new Set(b.defenses.map((d: any) => d.code as string))].map((c) => `${b.byCode.get(c)?.emoji} ${b.byCode.get(c)?.name_vi} ×${b.defenses.filter((d: any) => d.code === c).length}`).join(" · ")}</div>}
          {b.weapons.length > 0 && <><h3 className="font-bold pt-2">⚔️ Vũ khí (đã ngừng bán, vẫn có tác dụng)</h3>{b.weapons.map((w: any) => <div key={w.weapon_code} className="text-sm">{b.byCode.get(w.weapon_code)?.emoji} {b.byCode.get(w.weapon_code)?.name_vi} (+{Math.round(b.byCode.get(w.weapon_code)?.stats.atk_pct * 100)}% ATK)</div>)}</>}
        </Card>
      </div>
      <Card className="text-sm font-semibold">🎒 Vật phẩm: 🐾 Nâng cấp thú cưng ×{tok("PET_UPGRADE")} · 🪖 Nâng cấp quân đội ×{tok("ARMY_UPGRADE")} · 🛡️ Khiên mua ×{b.shields.filter((x: any) => x.source === "PAID" && !x.activated_at).length}</Card>
    </div>
  );
}
