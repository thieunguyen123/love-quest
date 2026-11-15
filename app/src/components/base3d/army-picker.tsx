"use client";
// BTL-01: bước chọn quân trước khi tấn công — hiện mọi loại lính đang có; chạm vào hình lính rồi bấm + / − để chọn số lượng.
// Quân chọn mang đi sẽ rời căn cứ; lính ngã là mất, lính sống trở về.
import { useState } from "react";

export type ArmyStack = { unit: string; qty: number; emoji: string; name: string };

export function ArmyPicker({ army, busy, onConfirm, onCancel }: {
  army: ArmyStack[]; busy?: boolean; onConfirm: (pick: Record<string, number>) => void; onCancel: () => void;
}) {
  const [pick, setPick] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<string | null>(army[0]?.unit ?? null);
  const total = Object.values(pick).reduce((a, b) => a + b, 0);
  const cur = army.find((a) => a.unit === sel);
  const n = sel ? pick[sel] ?? 0 : 0;
  const set = (unit: string, v: number) => {
    const max = army.find((a) => a.unit === unit)?.qty ?? 0;
    setPick((p) => ({ ...p, [unit]: Math.max(0, Math.min(max, v)) }));
  };
  const step = (d: number) => { if (sel) set(sel, n + d); };

  return (
    <div className="space-y-3" data-testid="army-picker">
      <div>
        <div className="font-extrabold text-pink-700">⚔️ Chọn quân xuất trận</div>
        <p className="text-[11px] font-semibold text-slate-500">Chạm vào lính rồi bấm + / −. Quân mang đi sẽ rời căn cứ · lính ngã là mất, lính sống trở về.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {army.map((a) => {
          const k = pick[a.unit] ?? 0;
          return (
            <button key={a.unit} onClick={() => setSel(a.unit)} data-testid={`pick-${a.unit}`} aria-pressed={sel === a.unit}
              className={`relative flex flex-col items-center rounded-2xl border-2 p-2 transition ${sel === a.unit ? "border-pink-500 bg-pink-50 shadow" : "border-slate-200 bg-white"}`}>
              <span className="text-4xl leading-none">{a.emoji}</span>
              <span className="mt-1 line-clamp-1 text-[11px] font-bold text-slate-700">{a.name}</span>
              <span className="text-[11px] font-extrabold text-slate-500">có {a.qty}</span>
              {k > 0 && <span className="absolute -right-1 -top-1 min-w-6 rounded-full bg-pink-500 px-1.5 text-xs font-black text-white shadow" data-testid={`picked-${a.unit}`}>{k}</span>}
            </button>
          );
        })}
      </div>
      {cur && (
        <div className="flex items-center gap-2 rounded-2xl bg-pink-50 p-2">
          <span className="text-2xl">{cur.emoji}</span>
          <div className="min-w-0 flex-1 text-sm font-bold text-pink-800">{cur.name}<div className="text-[11px] font-semibold text-slate-500">chọn {n}/{cur.qty}</div></div>
          <button onClick={() => set(cur.unit, 0)} className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-600 shadow">0</button>
          <button onClick={() => step(-1)} disabled={n <= 0} className="grid h-10 w-10 place-items-center rounded-full bg-white text-xl font-black text-pink-700 shadow disabled:opacity-40" aria-label="Bớt" data-testid="pick-minus">−</button>
          <span className="w-8 text-center text-lg font-black text-pink-700" data-testid="pick-count">{n}</span>
          <button onClick={() => step(1)} disabled={n >= cur.qty} className="grid h-10 w-10 place-items-center rounded-full bg-pink-500 text-xl font-black text-white shadow disabled:opacity-40" aria-label="Thêm" data-testid="pick-plus">+</button>
          <button onClick={() => set(cur.unit, cur.qty)} className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-600 shadow" data-testid="pick-all">Hết</button>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600">Huỷ</button>
        <button onClick={() => onConfirm(Object.fromEntries(Object.entries(pick).filter(([, v]) => v > 0)))} disabled={total < 1 || busy} data-testid="army-go"
          className="flex-1 rounded-xl bg-pink-500 px-4 py-2 text-sm font-extrabold text-white shadow disabled:bg-slate-300">
          {busy ? "Đang xuất quân…" : total < 1 ? "Chọn ít nhất 1 lính" : `⚔️ Xuất quân (${total} lính)`}
        </button>
      </div>
    </div>
  );
}
