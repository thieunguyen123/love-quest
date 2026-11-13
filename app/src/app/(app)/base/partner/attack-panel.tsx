"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { play } from "@/lib/sfx";
import { Card, btnPrimary } from "@/components/ui";
import { RPC_MSG } from "@/components/rpc-button";

export function AttackPanel({ partnerId, atk, def, reason, left, total, myShield }: { partnerId: string; atk: number; def: number; reason: string | null; left: number; total: number; myShield: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    const warn = myShield ? "Bạn đang bật khiên. Đi tấn công sẽ làm VỠ khiên của bạn. Vẫn tấn công?" : "Tấn công nhà người ấy?";
    if (!window.confirm(warn)) return;
    setBusy(true); setErr(null);
    const { data, error } = await createClient().rpc("attack", { p_defender: partnerId });
    if (error) { setBusy(false); play("wrong"); return setErr(RPC_MSG[error.message] ?? "Không tấn công được"); }
    router.push(`/battle/${data.id}`);
  }
  const ratio = Math.min(100, Math.round((atk / Math.max(1, atk + def)) * 100));
  return (
    <Card className="space-y-3">
      <h2 className="font-extrabold text-love-700">⚔️ Tấn công</h2>
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-red-50 p-3"><div className="text-2xl font-extrabold text-red-600">{atk}</div><div className="text-xs font-semibold">ATK của bạn</div></div>
        <div className="rounded-xl bg-blue-50 p-3"><div className="text-2xl font-extrabold text-blue-600">≈ {def}</div><div className="text-xs font-semibold">DEF ước tính của người ấy</div></div>
      </div>
      <div className="h-3 rounded-full bg-blue-200 overflow-hidden"><div className="h-full bg-red-400" style={{ width: `${ratio}%` }} /></div>
      <p className="text-sm">Sát thương ≈ ATK − DEF = <b>{Math.max(Math.round(atk * 0.1), atk - def)}</b> HP (±10%). Bạn còn <b>{left}/{total}</b> lượt hôm nay.</p>
      {myShield && !reason && <p className="text-sm font-semibold text-amber-700">⚠️ Tấn công sẽ làm vỡ khiên của bạn.</p>}
      {reason && <p className="text-sm font-bold text-amber-700">{reason}</p>}
      {err && <p role="alert" className="text-sm font-bold text-red-600">{err}</p>}
      <button disabled={!!reason || busy} onClick={go} className={btnPrimary}>{busy ? "Đang tấn công…" : "⚔️ Tấn công!"}</button>
    </Card>
  );
}
