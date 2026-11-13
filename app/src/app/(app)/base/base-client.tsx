"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RpcButton } from "@/components/rpc-button";
import { inputCls } from "@/components/ui";

// Hai chế độ: thanh sửa nhà (hp...) hoặc ô đổi tên thú cưng (petId...)
export function BaseClient(p: { hp?: number; maxHp?: number; costPerHp?: number; coins?: number; petId?: string; nickname?: string }) {
  const router = useRouter();
  const [name, setName] = useState(p.nickname ?? "");
  const missing = (p.maxHp ?? 0) - (p.hp ?? 0);
  const [fix, setFix] = useState(missing);

  if (p.petId) {
    return <input value={name} maxLength={20} aria-label="Tên thú cưng" className={`${inputCls} !py-1 font-bold`} onChange={(e) => setName(e.target.value)}
      onBlur={async () => { if (name.trim() && name !== p.nickname) { await createClient().rpc("rename_pet", { p_id: p.petId, p_name: name }); router.refresh(); } }} />;
  }
  if (missing <= 0) return <p className="text-sm font-semibold text-green-700">Nhà đầy HP ✅</p>;
  const cost = fix * (p.costPerHp ?? 2);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input type="range" min={1} max={missing} value={Math.min(fix, missing)} onChange={(e) => setFix(Number(e.target.value))} aria-label="HP cần sửa" className="flex-1 min-w-32" />
      <RpcButton fn="repair_house" args={{ p_hp: Math.min(fix, missing) }} label={`🔧 Sửa ${Math.min(fix, missing)} HP (${cost.toLocaleString("vi-VN")} xu)`} disabledReason={cost > (p.coins ?? 0) ? `Thiếu ${cost - (p.coins ?? 0)} xu` : null} />
    </div>
  );
}
