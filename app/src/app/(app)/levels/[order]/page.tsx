import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Avatar, Card, ButtonLink } from "@/components/ui";
import { Countdown } from "@/components/countdown";
import { StartButton } from "@/components/start-button";

const TYPE_VN: Record<string, string> = { MC_EN_VN: "Anh→Việt", MC_VN_EN: "Việt→Anh", LISTEN: "Nghe", SPELL: "Xếp chữ", MATCH: "Nối cặp", FILL: "Điền từ" };

export default async function LevelDetail({ params }: { params: Promise<{ order: string }> }) {
  const { order } = await params;
  const { supabase, me, partner } = await requirePlayer();
  await supabase.rpc("cron_tick");
  const { data: ov } = await supabase.rpc("level_overview", { p_order: Number(order) });
  if (!ov) notFound();
  const l = ov.level;
  const partnerName = partner?.display_name || "Người ấy";
  const canRank = (l.status === "OPEN" || l.status === "COUNTDOWN") && (!ov.me || ov.me.status === "IN_PROGRESS") && ov.words >= 4;
  const winnerName = l.winner_id === me.id ? me.display_name : l.winner_id === partner?.id ? partnerName : null;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Link href="/levels" className="text-sm font-bold text-love-600">← Bản đồ</Link>
      <Card className="space-y-3">
        <div className="text-xs font-bold text-love-700/70">Màn {l.order_no} · {l.cefr}{l.reward_multiplier > 1 ? ` · BOSS ×${l.reward_multiplier}` : ""}</div>
        <h1 className="text-2xl font-extrabold text-love-700">{l.topic_vi}</h1>
        <div className="text-love-700/70">{l.topic_en}</div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-love-50 p-2"><b>{l.question_count}</b><div>câu hỏi</div></div>
          <div className="rounded-xl bg-love-50 p-2"><b>{l.seconds_per_question}s</b><div>mỗi câu</div></div>
          <div className="rounded-xl bg-love-50 p-2"><b>{ov.words}</b><div>từ vựng</div></div>
        </div>
        <div className="text-sm">Loại câu: {l.question_types.map((t: string) => TYPE_VN[t] ?? t).join(" · ")}</div>
        <div className="text-sm rounded-xl bg-amber-50 border border-amber-200 p-3">
          <b>Phần thưởng:</b> Thắng <b>{ov.reward.win} xu</b> + 1 Nâng cấp thú cưng + 1 Quyền mua vũ khí + 1 Nâng cấp quân đội · Hòa {ov.reward.draw} xu · Thua {ov.reward.lose} xu
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-around text-center">
          <div><Avatar url={me.avatar_url} name={me.display_name} color={me.favorite_color} size={44} />
            <div className="font-bold text-sm mt-1">{me.display_name}</div>
            <div className="text-sm">{ov.me?.status === "SUBMITTED" ? <>✅ {ov.me.score} điểm</> : ov.me ? "Đang chơi…" : "Chưa chơi"}</div></div>
          <div className="text-xl">⚔️</div>
          <div>{partner && <Avatar url={partner.avatar_url} name={partner.display_name} color={partner.favorite_color} size={44} />}
            <div className="font-bold text-sm mt-1">{partnerName}</div>
            <div className="text-sm">{ov.partner ? <>✅ {ov.partner.score} điểm</> : ov.partner_finished ? "✅ Đã hoàn thành" : "Chưa chơi"}</div></div>
        </div>
        {l.status === "COUNTDOWN" && l.deadline_at && (
          <div className="text-center rounded-xl bg-amber-50 p-3">⏳ Màn đóng sau <b className="text-xl text-amber-700"><Countdown deadline={l.deadline_at} /></b></div>
        )}
        {l.status === "CLOSED" && (
          <div className="text-center font-extrabold text-love-700">{l.is_draw ? "🤝 Hòa!" : winnerName ? `👑 ${winnerName} thắng!` : ""}</div>
        )}
        {l.status === "LOCKED" && <p className="text-center text-sm">🔒 Màn này sẽ mở khi màn trước đóng.</p>}
        {ov.words < 4 && l.status !== "LOCKED" && <p className="text-center text-sm text-amber-700 font-semibold">Màn chưa có đủ từ vựng (cần ≥ 4 từ). Nhờ Admin thêm từ nhé.</p>}
        {ov.me?.status === "SUBMITTED" && l.status !== "CLOSED" && <p className="text-center text-sm font-semibold">Bạn đã xong. Đang chờ {partnerName}…</p>}
      </Card>

      <div className="flex flex-wrap gap-2">
        {canRank && <StartButton levelId={l.id} order={l.order_no} mode="RANKED" label={ov.me ? "▶ Chơi tiếp" : "⚔️ Bắt đầu thi đấu"} confirm={ov.me ? undefined : "Bạn chỉ có 1 lượt tính điểm cho màn này, không thể tạm dừng. Bắt đầu?"} />}
        {l.status !== "LOCKED" && <ButtonLink href={`/learn/${l.order_no}`} ghost>📚 Học trước</ButtonLink>}
        {l.status !== "LOCKED" && ov.words >= 4 && <StartButton levelId={l.id} order={l.order_no} mode="PRACTICE" label="🎯 Luyện tập" ghost />}
        {ov.me?.status === "SUBMITTED" && <ButtonLink href={`/levels/${l.order_no}/result?attempt=${ov.me.attempt_id}`} ghost>Xem kết quả</ButtonLink>}
      </div>
    </div>
  );
}
