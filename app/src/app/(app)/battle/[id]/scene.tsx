"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { play } from "@/lib/sfx";
import { Card, ButtonLink, btnGhost } from "@/components/ui";

// Hoạt cảnh 4 giây (BTL-03): quân chạy tới → nhà rung + khói → số sát thương. Kết quả luôn hiển thị dù animation lỗi.
export default function BattleScene(p: { iAmAttacker: boolean; attackerName: string; defenderName: string; units: string[]; houseEmoji: string; atk: number; def: number; damage: number; loot: number; hpAfter: number; maxHp: number; shieldBroken: boolean }) {
  const [phase, setPhase] = useState<"run" | "hit" | "done">("run");
  useEffect(() => {
    const a = setTimeout(() => { setPhase("hit"); play("boom"); }, 1800);
    const b = setTimeout(() => setPhase("done"), 3800);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const ruined = p.hpAfter === 0;
  return (
    <div className="max-w-xl mx-auto space-y-4">
      {phase !== "done" && (
        <Card className="relative h-56 overflow-hidden !p-0 bg-gradient-to-b from-sky-100 to-green-100">
          <div className="absolute bottom-6 left-3 flex gap-1 text-3xl">
            {p.units.map((u, i) => (
              <motion.span key={i} initial={{ x: 0 }} animate={{ x: phase === "run" ? 220 + i * 6 : 240 }} transition={{ duration: 1.6, delay: i * 0.1 }}>{u}</motion.span>
            ))}
          </div>
          <motion.div className="absolute bottom-5 right-6 text-7xl" animate={phase === "hit" ? { x: [0, -8, 8, -8, 8, 0], rotate: [0, -3, 3, -3, 3, 0] } : {}} transition={{ duration: 0.6, repeat: phase === "hit" ? 2 : 0 }}>
            {p.houseEmoji}{phase === "hit" && "💥"}
          </motion.div>
          {phase === "hit" && <motion.div className="absolute right-16 top-8 text-4xl font-extrabold text-red-600" initial={{ y: 30, opacity: 0 }} animate={{ y: -10, opacity: 1 }}>−{p.damage}</motion.div>}
          <button onClick={() => setPhase("done")} className="absolute top-2 right-2 text-xs font-bold underline text-love-700">Bỏ qua ⏭</button>
        </Card>
      )}
      {phase === "done" && (
        <Card className="space-y-3 text-center">
          <div className="text-5xl">{ruined ? "💥" : p.iAmAttacker ? "⚔️" : "🛡️"}</div>
          <h1 className="text-2xl font-extrabold text-love-700">{p.iAmAttacker ? `Bạn tấn công nhà ${p.defenderName}` : `${p.attackerName} tấn công nhà bạn`}</h1>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["ATK", p.atk], ["DEF", p.def], ["Sát thương", `−${p.damage}`], ["Chiến lợi phẩm", `${p.loot} xu`]].map(([k, v]) => <div key={String(k)} className="rounded-xl bg-love-50 p-2"><div className="font-extrabold text-love-600">{v}</div><div className="text-[11px] font-semibold">{k}</div></div>)}
          </div>
          <div className="h-3 rounded-full bg-love-100 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${(p.hpAfter / p.maxHp) * 100}%` }} /></div>
          <div className="text-sm font-bold">Nhà còn {p.hpAfter}/{p.maxHp} HP{ruined ? " — ĐỔ NÁT 💥" : ""}</div>
          {p.shieldBroken && p.iAmAttacker && <p className="text-sm font-semibold text-amber-700">🛡️ Khiên của bạn đã vỡ khi đi tấn công.</p>}
          {p.iAmAttacker ? <p className="text-sm">Bạn nhận <b>{p.loot} xu</b> chiến lợi phẩm (không trừ xu của người ấy).</p> : <p className="text-sm">Hãy dùng xu để <b>sửa nhà</b> ({p.damage * 2} xu cho {p.damage} HP).</p>}
          <div className="flex gap-2 justify-center flex-wrap"><ButtonLink href={p.iAmAttacker ? "/base/partner" : "/base"}>{p.iAmAttacker ? "Về nhà người ấy" : "🔧 Sửa nhà"}</ButtonLink><Link href="/battles" className={btnGhost}>Nhật ký</Link></div>
        </Card>
      )}
    </div>
  );
}
