"use client";
import { useState } from "react";
import { RpcButton } from "@/components/rpc-button";

/** Mua tường theo lô (BASE-15) */
export function WallBuy({ price, coins, room }: { price: number; coins: number; room: number }) {
  const [qty, setQty] = useState(10);
  const reason = room <= 0 ? "Đã đủ số lượng cho cấp nhà này" : qty > room ? `Chỉ còn mua được ${room} đoạn` : qty * price > coins ? `Thiếu ${qty * price - coins} xu` : null;
  return (
    <div className="space-y-1">
      <div className="flex gap-1">{[1, 5, 10, 20].map((n) => <button key={n} onClick={() => setQty(n)} className={`rounded-lg px-2 py-0.5 text-xs font-bold ${qty === n ? "bg-love-500 text-white" : "bg-love-50"}`}>{n}</button>)}</div>
      <RpcButton fn="buy_walls" args={{ p_qty: qty }} label={`Mua ${qty} đoạn (${(qty * price).toLocaleString("vi-VN")} xu)`} disabledReason={reason} />
    </div>
  );
}
