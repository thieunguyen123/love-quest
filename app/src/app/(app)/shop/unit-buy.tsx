"use client";
import { useState } from "react";
import { RpcButton } from "@/components/rpc-button";
import { inputCls } from "@/components/ui";

export function UnitBuy({ code, price, slots, coins, free, lock }: { code: string; price: number; slots: number; coins: number; free: number; lock: string | null }) {
  const [qty, setQty] = useState(1);
  const reason = lock ?? (qty * slots > free ? "Hết chỗ chứa quân – hãy nâng cấp nhà" : qty * price > coins ? `Thiếu ${qty * price - coins} xu` : null);
  return (
    <div className="flex items-start gap-2">
      <input type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className={`${inputCls} !w-20`} aria-label="Số lượng" />
      <RpcButton fn="buy_unit" args={{ p_code: code, p_qty: qty }} label={`Mua (${(qty * price).toLocaleString("vi-VN")} xu)`} disabledReason={reason} />
    </div>
  );
}
