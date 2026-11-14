/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { loadConfig } from "@/lib/config";
import { loadBase, tokenCount } from "@/lib/base";
import { Card } from "@/components/ui";
import { RpcButton } from "@/components/rpc-button";
import { TrainBox } from "@/components/train-box";
import { WallBuy } from "./wall-buy";
import { fmtDur, queuedSlots } from "@/lib/training";

const TABS = [["pets", "🐾 Thú cưng"], ["house", "🏠 Nhà"], ["units", "🏭 Nhà máy quân"], ["defense", "🗼 Phòng thủ"], ["decor", "🌸 Trang trí"], ["styles", "🎨 Kiểu nhà"], ["shield", "🛡️ Khiên"]] as const;

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "pets" } = await searchParams;
  const { supabase, me } = await requirePlayer();
  const [b, cfg, { data: closed }, { data: daily }] = await Promise.all([
    loadBase(supabase, me.id), loadConfig(supabase),
    supabase.from("levels").select("order_no").eq("status", "CLOSED"),
    supabase.from("daily_counters").select("shields_bought").eq("user_id", me.id).eq("day", new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())).maybeSingle(),
  ]);
  const closedSet = new Set((closed ?? []).map((l) => l.order_no));
  const coins = b.profile!.coins;
  const lockReason = (i: any) => (i.unlock_level && !closedSet.has(i.unlock_level) ? `🔒 Mở khi màn ${i.unlock_level} đóng` : null);
  const cap = Number(cfg.ARMY_CAP_BASE) + Number(cfg.ARMY_CAP_PER_HOUSE_LEVEL) * (b.house?.level ?? 0);
  const list = (cat: string) => b.items.filter((i: any) => i.category === cat);
  const owned = (code: string) => b.pets.some((p: any) => p.pet_code === code) || b.weapons.some((w: any) => w.weapon_code === code);
  const tok = (t: string) => tokenCount(b.inv, t);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-love-700">🛒 Cửa hàng</h1>
        <span className="rounded-full bg-amber-100 text-amber-800 font-extrabold px-3 py-1">🪙 {coins.toLocaleString("vi-VN")}</span>
        <span className="text-sm font-semibold">🐾 {tok("PET_UPGRADE")} · 🪖 {tok("ARMY_UPGRADE")} · 🛡️ {b.shields.filter((x: any) => x.source === "PAID" && !x.activated_at).length}</span>
      </div>
      <div className="flex flex-wrap gap-2">{TABS.map(([k, t]) => <Link key={k} href={`/shop?tab=${k}`} className={`rounded-full px-4 py-1.5 font-bold text-sm border ${tab === k ? "bg-love-500 text-white border-love-500" : "bg-white border-love-200 text-love-700"}`}>{t}</Link>)}</div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tab === "pets" && list("PET").map((i: any) => {
          const reason = lockReason(i) ?? (owned(i.code) ? "Bạn đã sở hữu" : coins < i.price ? `Thiếu ${i.price - coins} xu` : null);
          return <Card key={i.code} className="space-y-2"><div className="text-4xl">{i.emoji}</div><div className="font-extrabold">{i.name_vi}</div><div className="text-sm">{i.stats.desc}<br />✨ Tiến hoá ở cấp 3, hào quang cấp 4, vương miện cấp 5</div><div className="font-bold text-amber-700">🪙 {i.price}</div><RpcButton fn="buy_pet" args={{ p_code: i.code }} label="Mua" disabledReason={reason} /></Card>;
        })}
        {tab === "house" && list("HOUSE").map((i: any) => {
          const lv = i.stats.level, cur = b.house?.level ?? 0;
          const reason = lv <= cur ? (lv === cur ? "Cấp hiện tại" : "Đã có") : lv > cur + 1 ? "Nâng cấp tuần tự từng cấp" : (b.house && b.house.hp < b.house.max_hp) ? "Hãy sửa nhà đầy HP trước" : coins < i.price ? `Thiếu ${i.price - coins} xu` : null;
          return <Card key={i.code} className={`space-y-2 ${lv === cur ? "ring-2 ring-love-400" : ""}`}><div className="text-4xl">{i.emoji}</div><div className="font-extrabold">Cấp {lv}: {i.name_vi}</div><div className="text-sm">HP {i.stats.max_hp} · DEF {i.stats.def} · chứa {Number(cfg.ARMY_CAP_BASE) + Number(cfg.ARMY_CAP_PER_HOUSE_LEVEL) * lv} quân</div><div className="font-bold text-amber-700">🪙 {i.price}</div>{lv === cur + 1 && <RpcButton fn="upgrade_house" label="Nâng cấp" disabledReason={reason} />}{lv !== cur + 1 && <p className="text-xs font-semibold text-amber-700">{reason}</p>}</Card>;
        })}
        {tab === "units" && list("FACTORY").map((f: any) => {
          const u = b.byCode.get(f.stats.unit), own = b.factories.includes(f.code);
          const free = cap - b.used - queuedSlots(b.training, (c) => Number(b.byCode.get(c)?.slots ?? 1));
          const reason = own ? null : lockReason(f) ?? (coins < f.price ? `Thiếu ${f.price - coins} xu` : null);
          return (
            <Card key={f.code} className={`space-y-2 ${own ? "ring-2 ring-love-300" : ""}`} data-code={f.code}>
              <div className="flex items-center gap-2"><div className="text-4xl">{f.emoji}</div><div className="text-3xl">→ {u?.emoji}</div></div>
              <div className="font-extrabold">{f.name_vi} <span className="text-xs font-bold text-love-700/60">luyện {u?.name_vi}</span></div>
              <div className="text-sm">ATK {u?.stats.atk}/giây · HP {u?.stats.hp} · tầm {u?.stats.range} m<br />🎯 {u?.stats.target === "defense" ? "Ưu tiên tháp / pháo" : u?.stats.target === "house" ? "Chỉ bắn nhà chính" : "Đánh thứ gần nhất"}</div>
              {own ? <TrainBox info={{ unit: u.code, name: u.name_vi, emoji: u.emoji, price: Number(u.stats.train_price), sec: Number(u.stats.train_sec), slots: u.slots }} queue={b.training} coins={coins} freeSlots={free} />
                : <><div className="font-bold text-amber-700">🏭 {f.price.toLocaleString("vi-VN")} xu · luyện {u?.stats.train_price} xu & {fmtDur(Number(u?.stats.train_sec))} / lính</div><RpcButton fn="buy_factory" args={{ p_code: f.code }} label="Xây nhà máy" disabledReason={reason} /></>}
            </Card>
          );
        })}
        {tab === "styles" && list("STYLE").map((i: any) => {
          const own = b.styles.includes(i.code), using = `style_${b.house?.style ?? "classic"}` === i.code;
          const reason = using ? "Đang dùng" : own ? null : lockReason(i) ?? (coins < i.price ? `Thiếu ${i.price - coins} xu` : null);
          return <Card key={i.code} className={`space-y-2 ${using ? "ring-2 ring-love-400" : ""}`}><div className="text-4xl">{i.emoji}</div><div className="font-extrabold">{i.name_vi}</div><div className="text-sm">{i.stats.desc}<br />Chỉ đổi ngoại hình, không đổi HP/DEF.</div><div className="font-bold text-amber-700">{own ? "✓ Đã có" : `🪙 ${i.price}`}</div><RpcButton fn={own ? "set_style" : "buy_style"} args={{ p_code: i.code }} label={own ? "Dùng kiểu này" : "Mua & dùng"} disabledReason={reason} /></Card>;
        })}
        {tab === "defense" && list("WALL").map((i: any) => {
          const lv = b.house?.level ?? 0, have = b.defenses.filter((d: any) => d.kind === "WALL").length, max = Number(i.stats.max_by_house?.[lv] ?? 20);
          return <Card key={i.code} className="space-y-2"><div className="text-4xl">{i.emoji}</div><div className="font-extrabold">{i.name_vi}</div><div className="text-sm">{i.stats.desc} · HP {i.stats.hp}/đoạn · đang có {have}/{max}</div><div className="font-bold text-amber-700">🪙 {i.price} / đoạn</div><WallBuy price={i.price} coins={coins} room={max - have} /><Link href="/base" className="block text-xs font-bold text-love-600 underline">🔨 Xây tường trong căn cứ 3D →</Link></Card>;
        })}
        {tab === "defense" && [...list("DEFENSE"), ...list("TRAP")].map((i: any) => {
          const lv = b.house?.level ?? 0, n = b.defenses.filter((d: any) => d.code === i.code).length, max = Number(i.stats.max_by_house?.[lv] ?? 1);
          const reason = lockReason(i) ?? (n >= max ? "Đã đủ số lượng cho cấp nhà này" : coins < i.price ? `Thiếu ${i.price - coins} xu` : null);
          return <Card key={i.code} className="space-y-2"><div className="text-4xl">{i.emoji}</div><div className="font-extrabold">{i.name_vi}</div>
            <div className="text-sm">{i.stats.desc}<br />{i.category === "TRAP" ? `Nổ ${i.stats.dmg} · lan ${i.stats.splash} m` : `HP ${i.stats.hp} · ${i.stats.dmg}/phát mỗi ${i.stats.hit_sec}s · tầm ${i.stats.range} m`} · {i.stats.size}×{i.stats.size} ô · đang có {n}/{max}</div>
            <div className="font-bold text-amber-700">🪙 {i.price}</div><RpcButton fn="buy_defense" args={{ p_code: i.code }} label="Mua" disabledReason={reason} /><Link href="/base" className="block text-xs font-bold text-love-600 underline">🔨 Đặt vào căn cứ 3D →</Link></Card>;
        })}
        {tab === "decor" && list("DECOR").map((i: any) => {
          const n = b.decor.filter((d: any) => d.code === i.code).length;
          const reason = lockReason(i) ?? (n >= Number(i.stats.max ?? 20) ? "Đã đủ số lượng tối đa" : coins < i.price ? `Thiếu ${i.price - coins} xu` : null);
          return <Card key={i.code} className="space-y-2"><div className="text-4xl">{i.emoji}</div><div className="font-extrabold">{i.name_vi}</div><div className="text-sm">{i.stats.desc} · {i.stats.size}×{i.stats.size} ô · đang có {n}</div><div className="font-bold text-amber-700">🪙 {i.price}</div><RpcButton fn="buy_decor" args={{ p_code: i.code }} label="Mua" disabledReason={reason} /><Link href="/base" className="block text-xs font-bold text-love-600 underline">🔨 Đặt vào căn cứ 3D →</Link></Card>;
        })}
        {tab === "shield" && (
          <Card className="space-y-2"><div className="text-4xl">🛡️</div><div className="font-extrabold">Khiên</div>
            <div className="text-sm">Hiệu lực {String(cfg.SHIELD_DURATION_HOURS)} giờ khi bật. Mỗi ngày có {String(cfg.FREE_SHIELDS_PER_DAY)} khiên miễn phí (không cộng dồn). Mua thêm tối đa {String(cfg.SHIELD_MAX_BUY_PER_DAY)} khiên/ngày.</div>
            <div className="font-bold text-amber-700">🪙 {String(cfg.SHIELD_PRICE)}</div>
            <RpcButton fn="buy_shield" label="Mua khiên" disabledReason={(daily?.shields_bought ?? 0) >= Number(cfg.SHIELD_MAX_BUY_PER_DAY) ? "Hôm nay bạn đã mua khiên rồi" : coins < Number(cfg.SHIELD_PRICE) ? `Thiếu ${Number(cfg.SHIELD_PRICE) - coins} xu` : null} />
          </Card>
        )}
      </div>
    </div>
  );
}
