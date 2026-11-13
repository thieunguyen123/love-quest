"use client";
// Bảng "🛒 Xây thêm" trong căn cứ 3D (BASE-08): mua lính / thú cưng / vũ khí / trang trí / nâng cấp nhà — mọi giao dịch qua RPC
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RPC_MSG } from "@/components/rpc-button";
import { play } from "@/lib/sfx";

export type CatalogItem = { code: string; category: "UNIT" | "PET" | "WEAPON" | "DECOR" | "HOUSE"; name: string; emoji: string; price: number; size: number; desc: string; reason: string | null };
const TABS: [CatalogItem["category"], string][] = [["UNIT", "🪖 Quân"], ["PET", "🐾 Thú cưng"], ["WEAPON", "⚔️ Vũ khí"], ["DECOR", "🌸 Trang trí"], ["HOUSE", "🏠 Nhà"]];
const RPC: Record<CatalogItem["category"], string> = { UNIT: "buy_unit", PET: "buy_pet", WEAPON: "buy_weapon", DECOR: "buy_decor", HOUSE: "upgrade_house" };

export function BuildPanel({ catalog, coins, onClose, onBought }: { catalog: CatalogItem[]; coins: number; onClose: () => void; onBought: (it: CatalogItem) => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<CatalogItem["category"]>("UNIT");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function buy(it: CatalogItem) {
    setBusy(it.code); setMsg(null);
    const args = it.category === "HOUSE" ? {} : it.category === "UNIT" ? { p_code: it.code, p_qty: qty } : { p_code: it.code };
    const { error } = await createClient().rpc(RPC[it.category], args);
    setBusy(null);
    if (error) { play("wrong"); return setMsg({ ok: false, t: RPC_MSG[error.message] ?? "Không mua được" }); }
    play("coin");
    setMsg({ ok: true, t: it.category === "HOUSE" ? `Đã nâng cấp lên ${it.name}! 🎉` : `Đã mua ${it.category === "UNIT" ? `${qty} ` : ""}${it.name} — vật mới đã được đặt vào căn cứ` });
    onBought(it); router.refresh();
  }
  const list = catalog.filter((c) => c.category === tab);
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[70%] overflow-hidden rounded-t-3xl border-t-4 border-white bg-white/95 shadow-2xl backdrop-blur sm:inset-y-3 sm:left-auto sm:right-3 sm:max-h-none sm:w-96 sm:rounded-3xl sm:border-4" data-testid="build-panel">
      <div className="flex items-center gap-2 border-b border-pink-100 px-4 py-3">
        <b className="text-pink-700">🛒 Xây thêm</b>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-800">🪙 {coins.toLocaleString("vi-VN")}</span>
        <button onClick={onClose} className="ml-auto rounded-full bg-pink-100 px-3 py-1 text-sm font-bold text-pink-700">✕</button>
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 py-2">
        {TABS.map(([k, t]) => <button key={k} onClick={() => { setTab(k); setMsg(null); }} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${tab === k ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-700"}`}>{t}</button>)}
      </div>
      {tab === "UNIT" && (
        <div className="flex items-center gap-2 px-4 pb-1 text-xs font-bold text-slate-600">Số lượng: {[1, 5, 10].map((n) => <button key={n} onClick={() => setQty(n)} className={`rounded-lg px-2 py-0.5 ${qty === n ? "bg-pink-500 text-white" : "bg-slate-100"}`}>{n}</button>)}</div>
      )}
      {msg && <p role="status" className={`mx-4 rounded-xl px-3 py-2 text-sm font-bold ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.t}</p>}
      <div className="max-h-[calc(70vh-9rem)] space-y-2 overflow-y-auto p-3 sm:max-h-[calc(100%-9rem)]">
        {list.length === 0 && <p className="p-4 text-center text-sm text-slate-500">{tab === "HOUSE" ? "Nhà đã đạt cấp tối đa 💒" : "Không có món nào."}</p>}
        {list.map((it) => {
          const price = it.category === "UNIT" ? it.price * qty : it.price;
          const reason = it.reason ?? (coins < price ? `Thiếu ${(price - coins).toLocaleString("vi-VN")} xu` : null);
          return (
            <div key={it.code} className="flex items-center gap-3 rounded-2xl bg-pink-50/70 p-2.5" data-code={it.code}>
              <div className="text-3xl">{it.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-slate-800">{it.name} <span className="text-[10px] font-bold text-slate-400">{it.size}×{it.size} ô</span></div>
                <div className="truncate text-xs text-slate-600">{it.desc}</div>
                {reason && <div className="text-xs font-bold text-amber-700">{reason}</div>}
              </div>
              <button disabled={!!reason || busy === it.code} onClick={() => buy(it)} className="rounded-xl bg-pink-500 px-3 py-2 text-xs font-extrabold text-white shadow disabled:bg-slate-300">
                {busy === it.code ? "…" : it.category === "HOUSE" ? `⬆️ ${price.toLocaleString("vi-VN")}` : `🪙 ${price.toLocaleString("vi-VN")}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
