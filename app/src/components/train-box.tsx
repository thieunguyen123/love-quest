"use client";
// Luyện quân ở nhà máy (BASE-04): chọn số lượng → trả xu → chờ; hết giờ lính tự vào quân (đứng cạnh nhà máy trong căn cứ 3D)
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RPC_MSG } from "@/components/rpc-button";
import { play } from "@/lib/sfx";
import { refreshCoins, useCoins } from "@/components/coins";
import { fmtClock, fmtDur } from "@/lib/training";

export type TrainInfo = { unit: string; name: string; emoji: string; price: number; sec: number; slots: number };
export type QueueRow = { id: string; unit_code: string; qty: number; started_at: string; done_at: string };

export function TrainBox({ info, queue, coins: coins0, freeSlots, compact = false }: { info: TrainInfo; queue: QueueRow[]; coins: number; freeSlots: number; compact?: boolean }) {
  const coins = useCoins(coins0);
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const collecting = useRef(false);
  const mine = queue.filter((q) => q.unit_code === info.unit);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(iv); }, []);
  // có đơn vừa xong → thu lính vào quân rồi tải lại (lính hiện ra cạnh nhà máy)
  useEffect(() => {
    if (collecting.current || !mine.some((q) => Date.parse(q.done_at) <= now)) return;
    collecting.current = true;
    void createClient().rpc("collect_training").then(() => { play("coin"); setMsg({ ok: true, t: `${info.emoji} Lính đã luyện xong — đang đứng cạnh nhà máy!` }); router.refresh(); setTimeout(() => { collecting.current = false; }, 1500); });
  }, [now, mine, info, router]);
  async function train(qty: number) {
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("train_units", { p_unit: info.unit, p_qty: qty });
    setBusy(false);
    if (error) { play("wrong"); return setMsg({ ok: false, t: RPC_MSG[error.message] ?? "Không luyện được" }); }
    play("click"); setMsg({ ok: true, t: `Đã đặt luyện ${qty} ${info.name} ⏳` }); void refreshCoins(); router.refresh();
  }
  return (
    <div className="space-y-2" data-testid={`train-${info.unit}`}>
      <div className="text-xs font-semibold text-slate-600">🪙 {info.price.toLocaleString("vi-VN")} / lính · ⏱ {fmtDur(info.sec)} / lính · chiếm {info.slots} chỗ · còn trống {Math.max(0, freeSlots)} chỗ</div>
      <div className="flex flex-wrap gap-2">
        {[1, 5, 10].map((n) => {
          const reason = n * info.slots > freeSlots ? "Hết chỗ" : n * info.price > coins ? "Thiếu xu" : null;
          return (
            <button key={n} disabled={busy || !!reason} onClick={() => train(n)} data-qty={n} title={reason ?? ""}
              className="rounded-xl bg-pink-500 px-3 py-1.5 text-xs font-extrabold text-white shadow disabled:bg-slate-300">
              ⚒️ ×{n} · 🪙 {(n * info.price).toLocaleString("vi-VN")}{compact ? "" : ` · ${fmtDur(n * info.sec)}`}
            </button>
          );
        })}
      </div>
      {mine.length > 0 && (
        <ul className="space-y-1">
          {mine.map((q) => {
            const total = (Date.parse(q.done_at) - Date.parse(q.started_at)) / 1000, left = (Date.parse(q.done_at) - now) / 1000, started = Date.parse(q.started_at) <= now;
            const pct = started ? Math.min(100, Math.max(0, (1 - left / Math.max(1, total)) * 100)) : 0;
            return (
              <li key={q.id} className="rounded-lg bg-white/80 px-2 py-1 text-xs font-bold text-slate-700">
                <div className="flex justify-between"><span>{info.emoji} ×{q.qty}</span><span data-testid="train-left">{left <= 0 ? "Xong ✓" : started ? `⏳ ${fmtClock(left)}` : `Chờ — xong sau ${fmtClock(left)}`}</span></div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-amber-400 transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p role="status" className={`text-xs font-bold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.t}</p>}
    </div>
  );
}
