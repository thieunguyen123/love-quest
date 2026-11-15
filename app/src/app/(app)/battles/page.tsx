import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Card, ButtonLink } from "@/components/ui";

export default async function BattlesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "all" } = await searchParams;
  const { supabase, me, partner } = await requirePlayer();
  let q = supabase.from("attacks").select("*").order("created_at", { ascending: false }).limit(50);
  if (f === "out") q = q.eq("attacker_id", me.id);
  if (f === "in") q = q.eq("defender_id", me.id);
  const { data } = await q;
  const name = (id: string) => (id === me.id ? me.display_name : partner?.display_name ?? "Người ấy");
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-extrabold text-love-700">⚔️ Nhật ký chiến trận</h1>
      <div className="flex gap-2">{[["all", "Tất cả"], ["out", "Tôi đánh"], ["in", "Tôi bị đánh"]].map(([k, t]) => <Link key={k} href={`/battles?f=${k}`} className={`rounded-full px-4 py-1.5 font-bold text-sm border ${f === k ? "bg-love-500 text-white border-love-500" : "bg-white border-love-200 text-love-700"}`}>{t}</Link>)}</div>
      {(data ?? []).length === 0 && <Card>Chưa có trận nào. <Link href="/base/partner" className="underline font-bold">Thăm nhà người ấy</Link></Card>}
      {data?.map((a) => (
        <Card key={a.id} className="flex items-center gap-3">
          <div className="text-3xl">{a.attacker_id === me.id ? "⚔️" : "🛡️"}</div>
          <div className="flex-1 text-sm"><div className="font-bold">{name(a.attacker_id)} → {name(a.defender_id)}</div>
            <div>{a.status === "PENDING" ? "⏳ đang diễn ra…" : a.status === "EXPIRED" ? "🏳️ bỏ dở — quân đã về, không gây sát thương" : a.status === "BLOCKED" ? `🛡️ bị khiên chặn — mất ${Object.values((a.army ?? {}) as Record<string, number>).reduce((x, y) => x + y, 0)} lính` : <>−{a.damage} HP · {a.loot} xu · còn {a.defender_hp_after} HP{a.defender_hp_after === 0 ? " 💥" : ""}</>}</div>
            <div className="text-xs text-love-700/60">{new Date(a.created_at).toLocaleString("vi-VN")}</div></div>
          <Link href={`/battle/${a.id}`} className="text-sm font-bold underline text-love-600">Xem</Link>
          {a.defender_id === me.id && <ButtonLink href="/base/partner" ghost>Trả thù</ButtonLink>}
        </Card>
      ))}
    </div>
  );
}
