import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Avatar, Card } from "@/components/ui";

export default async function RivalryPage() {
  const { supabase, me, partner } = await requirePlayer();
  const [{ data: levels }, { data: attempts }, { data: rec }] = await Promise.all([
    supabase.from("levels").select("id,order_no,topic_vi,status,winner_id,is_draw").neq("status", "LOCKED").order("order_no"),
    supabase.rpc("rivalry_scores"),
    supabase.from("typing_sessions").select("user_id,words_hit"),
  ]);
  const scoreOf = (levelId: string, uid?: string) => (attempts as { level_id: string; user_id: string; score: number }[] | null)?.find((a) => a.level_id === levelId && a.user_id === uid)?.score;
  const closed = levels?.filter((l) => l.status === "CLOSED") ?? [];
  const mw = closed.filter((l) => l.winner_id === me.id).length, pw = closed.filter((l) => l.winner_id === partner?.id).length, dr = closed.filter((l) => l.is_draw).length;
  const best = (uid?: string) => Math.max(0, ...(rec ?? []).filter((r) => r.user_id === uid).map((r) => r.words_hit));
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold text-love-700">⚔️ Bảng đối đầu</h1>
      <Card className="flex items-center justify-around text-center">
        <div><Avatar url={me.avatar_url} name={me.display_name} color={me.favorite_color} size={56} /><div className="font-extrabold">{me.display_name}</div></div>
        <div><div className="text-4xl font-extrabold text-love-700">{mw} – {pw}</div><div className="text-sm font-semibold">{dr > 0 ? `${dr} hòa` : `${closed.length} màn đã đóng`}</div></div>
        {partner && <div><Avatar url={partner.avatar_url} name={partner.display_name} color={partner.favorite_color} size={56} /><div className="font-extrabold">{partner.display_name}</div></div>}
      </Card>
      <Card className="text-sm font-semibold flex justify-around"><span>🌧️ Kỷ lục mưa chữ: {me.display_name} {best(me.id)}</span><span>{partner?.display_name} {best(partner?.id)}</span></Card>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-love-50 text-left"><tr><th className="px-3 py-2">Màn</th><th className="px-3 py-2">Chủ đề</th><th className="px-3 py-2">{me.display_name}</th><th className="px-3 py-2">{partner?.display_name}</th><th className="px-3 py-2">Kết quả</th></tr></thead>
          <tbody>{levels?.map((l) => (
            <tr key={l.id} className="border-t border-love-100">
              <td className="px-3 py-2 font-bold"><Link className="underline" href={`/levels/${l.order_no}`}>{l.order_no}</Link></td><td className="px-3 py-2">{l.topic_vi}</td>
              <td className="px-3 py-2">{scoreOf(l.id, me.id) ?? "–"}</td><td className="px-3 py-2">{l.status === "CLOSED" ? scoreOf(l.id, partner?.id) ?? "–" : "?"}</td>
              <td className="px-3 py-2">{l.status !== "CLOSED" ? "Đang chơi" : l.is_draw ? "🤝 Hòa" : l.winner_id === me.id ? `👑 ${me.display_name}` : `👑 ${partner?.display_name}`}</td>
            </tr>))}</tbody>
        </table>
      </Card>
    </div>
  );
}
