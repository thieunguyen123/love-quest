// GRM-02: nội dung 1 bài ngữ pháp + GRM-03 bài kiểm tra
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlayer } from "@/lib/session";
import { Card } from "@/components/ui";
import { GrammarSpeak, SpeedPicker } from "./speed";
import { GrammarQuiz } from "./quiz";

type Section = { heading: string; text?: string; formulas?: string[]; examples?: { en: string; vi: string }[] };

/** **đậm** + xuống dòng */
function Rich({ text }: { text: string }) {
  return <>{text.split("\n").map((line, i) => (
    <p key={i} className="leading-relaxed">{line.split(/(\*\*[^*]+\*\*)/g).map((s, j) => s.startsWith("**") && s.endsWith("**") ? <b key={j} className="text-love-700">{s.slice(2, -2)}</b> : s)}</p>
  ))}</>;
}

export default async function GrammarLessonPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase, me } = await requirePlayer();
  const { data: l } = await supabase.from("grammar_lessons").select("*").eq("code", code).maybeSingle();
  if (!l) notFound();
  const [{ data: prog }, { data: nav }] = await Promise.all([
    supabase.from("grammar_progress").select("best_correct,best_total,passed_at,attempts").eq("user_id", me.id).eq("lesson_id", l.id).maybeSingle(),
    supabase.from("grammar_lessons").select("code,order_no,title_vi").in("order_no", [l.order_no - 1, l.order_no + 1]),
  ]);
  const prev = nav?.find((n) => n.order_no === l.order_no - 1), next = nav?.find((n) => n.order_no === l.order_no + 1);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/grammar" className="text-sm font-bold text-love-600 underline">← Tất cả bài ngữ pháp</Link>
      <div className="flex items-center gap-3">
        <span className="text-4xl">{l.emoji}</span>
        <div>
          <div className="text-xs font-bold text-love-700/60">Bài {l.order_no} · {l.title_en}</div>
          <h1 className="text-2xl font-extrabold text-love-700">{l.title_vi}</h1>
          <p className="text-sm text-love-700/70">{l.summary_vi}</p>
        </div>
      </div>
      <SpeedPicker />
      {(l.sections as Section[]).map((s, i) => (
        <Card key={i} className="space-y-2 text-sm">
          <h2 className="text-base font-extrabold text-love-700">{s.heading}</h2>
          {s.text && <Rich text={s.text} />}
          {!!s.formulas?.length && (
            <div className="space-y-1 rounded-xl bg-love-50 p-3 font-mono text-[13px] font-bold text-love-800">{s.formulas.map((f, j) => <div key={j}>{f}</div>)}</div>
          )}
          {!!s.examples?.length && (
            <ul className="space-y-1.5">
              {s.examples.map((e, j) => (
                <li key={j} className="rounded-xl border border-love-100 p-2">
                  <div className="font-semibold">{e.en}<GrammarSpeak text={e.en} /></div>
                  <div className="text-xs text-slate-500">{e.vi}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
      {!!(l.tips as string[]).length && (
        <Card className="space-y-1 border-amber-200 bg-amber-50/60 text-sm">
          <h2 className="text-base font-extrabold text-amber-800">💡 Mẹo làm bài</h2>
          <ul className="list-disc space-y-1 pl-5">{(l.tips as string[]).map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul>
        </Card>
      )}
      <GrammarQuiz lessonId={l.id} best={prog ? { correct: prog.best_correct, total: prog.best_total, passed: !!prog.passed_at } : null} />
      <div className="flex justify-between gap-2 text-sm font-bold">
        {prev ? <Link href={`/grammar/${prev.code}`} className="text-love-600 underline">← Bài {prev.order_no}</Link> : <span />}
        {next && <Link href={`/grammar/${next.code}`} className="text-love-600 underline">Bài {next.order_no}: {next.title_vi} →</Link>}
      </div>
    </div>
  );
}
