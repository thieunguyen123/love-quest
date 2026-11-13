import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Card, ButtonLink } from "@/components/ui";
import { Countdown } from "@/components/countdown";
import { StartButton } from "@/components/start-button";
import { ResultFx } from "./fx";

export default async function ResultPage({ params, searchParams }: { params: Promise<{ order: string }>; searchParams: Promise<{ attempt?: string }> }) {
  const { order } = await params; const sp = await searchParams;
  const { supabase, me, partner } = await requirePlayer();
  if (!sp.attempt) redirect(`/levels/${order}`);
  const { data: a } = await supabase.from("level_attempts").select("*").eq("id", sp.attempt).eq("user_id", me.id).maybeSingle();
  if (!a) redirect(`/levels/${order}`);
  if (a.status !== "SUBMITTED") redirect(`/levels/${order}/play?attempt=${a.id}`);
  const { data: ov } = await supabase.rpc("level_overview", { p_order: Number(order) });
  const { data: review } = await supabase.rpc("attempt_review", { p_attempt: a.id });
  const l = ov.level;
  const wrongs = (review ?? []).filter((r: { is_correct: boolean }) => !r.is_correct);
  const isPractice = a.mode === "PRACTICE";
  const partnerName = partner?.display_name || "Người ấy";
  const won = l.status === "CLOSED" && l.winner_id === me.id, lost = l.status === "CLOSED" && !l.is_draw && l.winner_id !== me.id, draw = l.status === "CLOSED" && l.is_draw;
  const reward = won ? `+${ov.reward.win} xu, 1 Nâng cấp thú cưng, 1 Quyền mua vũ khí, 1 Nâng cấp quân đội` : draw ? `+${ov.reward.draw} xu, 1 Nâng cấp thú cưng` : lost ? `+${ov.reward.lose} xu` : null;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <ResultFx kind={isPractice ? "practice" : won ? "win" : lost ? "lose" : "wait"} />
      <Card className="text-center space-y-3">
        <div className="text-5xl">{isPractice ? "🎯" : won ? "🏆" : draw ? "🤝" : lost ? "💪" : "⏳"}</div>
        <h1 className="text-2xl font-extrabold text-love-700">{isPractice ? "Kết quả luyện tập" : won ? "Bạn thắng!" : draw ? "Hòa!" : lost ? "Lần sau gỡ lại nhé!" : "Bạn đã hoàn thành!"}</h1>
        {lost && <p className="text-sm">Cố lên, màn sau còn nhiều cơ hội 💕</p>}
        <div className="grid grid-cols-4 gap-2 text-center">
          {[["Điểm", a.score], ["Đúng", `${a.correct_count}/${a.question_count}`], ["Combo", `x${a.max_combo}`], ["Thời gian", `${(a.total_time_ms / 1000).toFixed(1)}s`]].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl bg-love-50 p-2"><div className="text-xl font-extrabold text-love-600">{v}</div><div className="text-xs font-semibold">{k}</div></div>
          ))}
        </div>
        {!isPractice && ov.partner && (
          <div className="rounded-xl bg-love-50 p-3 text-sm font-semibold">{me.display_name}: <b>{a.score}</b> điểm · {partnerName}: <b>{ov.partner.score}</b> điểm</div>
        )}
        {!isPractice && l.status !== "CLOSED" && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm">⏳ Đang chờ {partnerName}… {l.deadline_at && <>còn <b><Countdown deadline={l.deadline_at} /></b></>}</div>
        )}
        {!isPractice && reward && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm font-bold">🎁 Phần thưởng: {reward}</div>}
        {isPractice && <p className="text-sm text-love-700/70">Luyện tập không tính điểm thi đấu và không có thưởng.</p>}
      </Card>
      {wrongs.length > 0 && (
        <Card className="space-y-2">
          <div className="font-extrabold text-love-700">Từ cần ôn ({wrongs.length})</div>
          <ul className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">{wrongs.map((w: { word_id: string; word: string; meanings: string[] }) => <li key={w.word_id}><b>{w.word}</b> — {w.meanings[0]}</li>)}</ul>
          <ButtonLink href={`/learn/${order}?only=${wrongs.map((w: { word_id: string }) => w.word_id).join(",")}`}>📚 Ôn lại từ sai</ButtonLink>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/levels" ghost>Về bản đồ</ButtonLink>
        <ButtonLink href={`/levels/${order}`} ghost>Chi tiết màn</ButtonLink>
        {isPractice && <StartButton levelId={l.id} order={Number(order)} mode="PRACTICE" label="Luyện tập lại" ghost />}
        <Link href="/rivalry" className="self-center text-sm font-bold text-love-600 underline">Bảng đối đầu</Link>
      </div>
    </div>
  );
}
