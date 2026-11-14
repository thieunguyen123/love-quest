"use client";
// Giao diện 2D dự phòng (không có WebGL): tấn công bằng cách TỰ RẢI QUÂN quanh đảo — vẫn là cùng mô phỏng, server kiểm chứng (BTL-08)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { play } from "@/lib/sfx";
import { Card, btnPrimary } from "@/components/ui";
import { RPC_MSG } from "@/components/rpc-button";
import { autoDeploys, type Snapshot } from "@/lib/game/sim";

export function AttackPanel({ dps, armorPct, reason, left, total, myShield }: { dps: number; armorPct: number; reason: string | null; left: number; total: number; myShield: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    const warn = myShield ? "Bạn đang bật khiên. Đi tấn công sẽ làm VỠ khiên của bạn. Vẫn tấn công?" : "Tấn công nhà người ấy? Quân sẽ tự rải quanh đảo.";
    if (!window.confirm(warn)) return;
    setBusy(true); setErr(null);
    const fail = (code?: string) => { setBusy(false); play("wrong"); setErr(RPC_MSG[code ?? ""] ?? "Không tấn công được"); };
    const r1 = await fetch("/api/attack/start", { method: "POST" }).catch(() => null);
    const j1 = r1 ? await r1.json().catch(() => null) : null;
    if (!r1?.ok || !j1?.snapshot) return fail(j1?.error);
    const deploys = autoDeploys(j1.snapshot as Snapshot);
    const r2 = await fetch("/api/attack/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: j1.id, deploys, endTick: null }) }).catch(() => null);
    if (!r2?.ok) return fail((await r2?.json().catch(() => null))?.error);
    router.push(`/battle/${j1.id}`);
  }
  return (
    <Card className="space-y-3">
      <h2 className="font-extrabold text-love-700">⚔️ Tấn công</h2>
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-red-50 p-3"><div className="text-2xl font-extrabold text-red-600">{dps}</div><div className="text-xs font-semibold">Sức đánh / giây của bạn</div></div>
        <div className="rounded-xl bg-blue-50 p-3"><div className="text-2xl font-extrabold text-blue-600">{armorPct}%</div><div className="text-xs font-semibold">Giáp nhà người ấy</div></div>
      </div>
      <p className="text-sm">Máy này không hiển thị được 3D nên quân sẽ <b>tự rải quanh đảo</b>. Bạn còn <b>{left}/{total}</b> lượt hôm nay.</p>
      {myShield && !reason && <p className="text-sm font-semibold text-amber-700">⚠️ Tấn công sẽ làm vỡ khiên của bạn.</p>}
      {reason && <p className="text-sm font-bold text-amber-700">{reason}</p>}
      {err && <p role="alert" className="text-sm font-bold text-red-600">{err}</p>}
      <button disabled={!!reason || busy} onClick={go} className={btnPrimary}>{busy ? "Đang tấn công…" : "⚔️ Tấn công (tự rải quân)"}</button>
    </Card>
  );
}
