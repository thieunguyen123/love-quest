import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { loadConfig } from "@/lib/config";
import { Avatar, Card } from "@/components/ui";
import { Countdown } from "@/components/countdown";
import { IslandsView } from "@/components/levels3d/islands-view";

const ST: Record<string, { label: string; ring: string }> = {
  LOCKED: { label: "🔒", ring: "bg-gray-100 text-gray-400 border-gray-200" },
  OPEN: { label: "▶", ring: "bg-green-100 text-green-700 border-green-400 animate-pulse" },
  COUNTDOWN: { label: "⏳", ring: "bg-amber-100 text-amber-700 border-amber-400" },
  CLOSED: { label: "👑", ring: "bg-love-100 text-love-700 border-love-400" },
};

export default async function LevelsPage() {
  const { supabase, me, partner } = await requirePlayer();
  await supabase.rpc("cron_tick"); // đóng màn hết hạn (dự phòng khi pg_cron không chạy)
  const [{ data: levels }, cfg] = await Promise.all([supabase.from("levels").select("*").order("order_no"), loadConfig(supabase)]);
  // xu thắng màn n = ROUND((WIN_BASE + WIN_STEP × (n − 1)) × hệ số) — sheet 3
  const winCoins = (n: number, mult: number) => Math.round((Number(cfg.WIN_BASE_COINS ?? 200) + Number(cfg.WIN_STEP_COINS ?? 100) * (n - 1)) * mult);
  const current = levels?.find((l) => l.status === "OPEN" || l.status === "COUNTDOWN");
  const people = new Map<string, { n: string; a: string | null; c: string }>([[me.id, { n: me.display_name, a: me.avatar_url, c: me.favorite_color }]]);
  if (partner) people.set(partner.id, { n: partner.display_name, a: partner.avatar_url, c: partner.favorite_color });
  const wins = (id: string) => levels?.filter((l) => l.winner_id === id).length ?? 0;

  return (
    <div className="space-y-5">
      <Card className="flex items-center justify-around text-center">
        <div><Avatar url={me.avatar_url} name={me.display_name} color={me.favorite_color} size={48} /><div className="font-extrabold mt-1">{me.display_name}</div></div>
        <div className="text-3xl font-extrabold text-love-700">{wins(me.id)} – {partner ? wins(partner.id) : 0}</div>
        {partner && <div><Avatar url={partner.avatar_url} name={partner.display_name} color={partner.favorite_color} size={48} /><div className="font-extrabold mt-1">{partner.display_name}</div></div>}
      </Card>
      <h1 className="text-2xl font-extrabold text-love-700">🏆 Bản đồ màn chơi</h1>
      <IslandsView levels={(levels ?? []).map((l) => { const w = l.winner_id ? people.get(l.winner_id) : null; return { order_no: l.order_no, topic_vi: l.topic_vi, topic_en: l.topic_en, cefr: l.cefr, status: l.status, deadline_at: l.deadline_at, reward_multiplier: Number(l.reward_multiplier), win_coins: winCoins(l.order_no, Number(l.reward_multiplier)), question_count: l.question_count, is_draw: l.is_draw, winner: w ? { name: w.n, color: w.c } : null }; })} />
      <h2 className="text-lg font-extrabold text-love-700">📋 Danh sách màn</h2>
      <div className="relative max-w-md mx-auto">
        <div className="absolute left-1/2 top-4 bottom-4 w-1 -translate-x-1/2 bg-love-200 rounded" aria-hidden />
        <ol className="relative space-y-6">
          {levels?.map((l, i) => {
            const st = ST[l.status]; const w = l.winner_id ? people.get(l.winner_id) : null;
            const body = (
              <div className={`flex items-center gap-3 ${i % 2 ? "flex-row-reverse text-right" : ""}`}>
                <div className={`h-14 w-14 shrink-0 rounded-full border-4 grid place-items-center text-xl font-extrabold ${st.ring}`}>{l.status === "LOCKED" || l.status === "CLOSED" ? st.label : l.order_no}</div>
                <div className={`bg-white/90 border border-love-100 rounded-2xl px-3 py-2 min-w-0 flex-1 ${l.status === "LOCKED" ? "opacity-60" : ""}`}>
                  <div className="text-xs font-bold text-love-700/70">Màn {l.order_no} · {l.cefr}{l.reward_multiplier > 1 ? ` · BOSS ×${l.reward_multiplier}` : ""}</div>
                  <div className="font-extrabold truncate">{l.topic_vi}</div>
                  {l.status === "COUNTDOWN" && l.deadline_at && <div className="text-xs font-bold text-amber-700">⏳ còn <Countdown deadline={l.deadline_at} /></div>}
                  {l.status === "CLOSED" && <div className="text-xs font-bold text-love-600 flex items-center gap-1">{l.is_draw ? "🤝 Hòa" : w ? <>👑 <Avatar url={w.a} name={w.n} color={w.c} size={18} /> {w.n}</> : null}</div>}
                </div>
              </div>
            );
            return <li key={l.id} id={l.id === current?.id ? "current" : undefined}>{l.status === "LOCKED" ? body : <Link href={`/levels/${l.order_no}`}>{body}</Link>}</li>;
          })}
        </ol>
      </div>
    </div>
  );
}
