"use client";
// GRM-03: bài kiểm tra kiểu TOEIC Part 5. Đề không kèm đáp án; mỗi câu chấm ở server ngay khi chọn (grammar_answer).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RPC_MSG } from "@/components/rpc-button";
import { refreshCoins } from "@/components/coins";
import { btnGhost, btnPrimary, Card } from "@/components/ui";
import { play } from "@/lib/sfx";

type Q = { q: string; options: string[] };
type Fb = { correct: boolean; answer: number; explain: string; choice: number };

export function GrammarQuiz({ lessonId, best }: { lessonId: string; best: { correct: number; total: number; passed: boolean } | null }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<string | null>(null);
  const [qs, setQs] = useState<Q[]>([]);
  const [i, setI] = useState(0);
  const [fb, setFb] = useState<(Fb | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: number; total: number; passed: boolean; coins: number } | null>(null);
  const sb = createClient();
  const box = useRef<HTMLDivElement>(null);
  // điện thoại: bài kiểm tra nằm dưới phần lý thuyết → cuộn tới câu hỏi khi bắt đầu / sang câu mới / xem kết quả
  useEffect(() => { if (attempt || result) box.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [attempt, i, result]);

  async function start() {
    setBusy(true); setErr(null); setResult(null);
    const { data, error } = await sb.rpc("grammar_start", { p_lesson: lessonId });
    setBusy(false);
    if (error) return setErr(RPC_MSG[error.message] ?? "Không bắt đầu được");
    setAttempt(data.attempt); setQs(data.questions); setI(0); setFb(data.questions.map(() => null));
  }
  async function choose(c: number) {
    if (!attempt || fb[i] || busy) return;
    setBusy(true);
    const { data, error } = await sb.rpc("grammar_answer", { p_attempt: attempt, p_index: i, p_choice: c });
    setBusy(false);
    if (error) return setErr(RPC_MSG[error.message] ?? "Không gửi được câu trả lời");
    play(data.correct ? "correct" : "wrong");
    setFb((f) => f.map((x, k) => (k === i ? { ...data, choice: c } : x)));
  }
  async function finish() {
    if (!attempt) return;
    setBusy(true);
    const { data, error } = await sb.rpc("grammar_finish", { p_attempt: attempt });
    setBusy(false);
    if (error) return setErr(RPC_MSG[error.message] ?? "Không nộp được bài");
    setResult(data); setAttempt(null);
    play(data.passed ? "win" : "lose");
    if (data.coins) void refreshCoins();
    router.refresh();
  }

  if (result) {
    return (
      <div ref={box} className="scroll-mt-20"><Card className="space-y-3 text-center">
        <div className="text-4xl">{result.passed ? "🎉" : "💪"}</div>
        <div className="text-xl font-extrabold text-love-700" data-testid="grammar-result">Đúng {result.correct}/{result.total}{result.passed ? " — Đạt!" : " — chưa đạt"}</div>
        {result.coins > 0 && <div className="font-extrabold text-amber-700">+{result.coins} xu thưởng lần đầu đạt 🪙</div>}
        {!result.passed && <p className="text-sm text-slate-600">Đọc lại phần giải thích ở trên rồi thử lần nữa nhé.</p>}
        <div className="space-y-1 text-left">
          {qs.map((q, k) => {
            const f = fb[k];
            return (
              <details key={k} className={`rounded-xl border p-2 text-sm ${f?.correct ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
                <summary className="cursor-pointer font-semibold">{f?.correct ? "✅" : "❌"} {q.q.replace("___", f ? `[${q.options[f.answer]}]` : "___")}</summary>
                <p className="mt-1 text-xs text-slate-600">{f ? (f.choice !== f.answer ? `Bạn chọn "${q.options[f.choice]}". ` : "") + f.explain : "Chưa trả lời."}</p>
              </details>
            );
          })}
        </div>
        <button className={btnPrimary} onClick={start} disabled={busy}>🔁 Làm lại (đề mới)</button>
      </Card></div>
    );
  }

  if (!attempt) {
    return (
      <Card className="space-y-2 text-center">
        <div className="font-extrabold text-love-700">📝 Bài kiểm tra</div>
        <p className="text-sm text-slate-600">Câu điền chỗ trống kiểu TOEIC Part 5 · chọn xong là biết đúng/sai kèm giải thích.</p>
        {best && <p className="text-xs font-bold text-slate-500">Cao nhất: {best.correct}/{best.total}{best.passed ? " ✅ đã đạt" : ""}</p>}
        <button className={btnPrimary} onClick={start} disabled={busy} data-testid="grammar-start">{best ? "Làm lại" : "Bắt đầu làm bài"}</button>
        {err && <p className="text-sm font-bold text-red-600">{err}</p>}
      </Card>
    );
  }

  const q = qs[i], f = fb[i], last = i === qs.length - 1;
  const parts = q.q.split("___");
  return (
    <div ref={box} className="scroll-mt-20"><Card className="space-y-3">
      <div className="flex items-center justify-between text-xs font-bold text-love-700/70">
        <span>Câu {i + 1}/{qs.length}</span>
        <span>✅ {fb.filter((x) => x?.correct).length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-love-100"><div className="h-full bg-love-500 transition-all" style={{ width: `${((i + (f ? 1 : 0)) / qs.length) * 100}%` }} /></div>
      <p className="text-lg font-semibold leading-snug" data-testid="grammar-q">
        {parts[0]}<span className={`mx-1 inline-block min-w-16 border-b-2 text-center font-extrabold ${f ? (f.correct ? "border-green-500 text-green-700" : "border-red-500 text-red-600") : "border-love-400"}`}>{f ? q.options[f.answer] : " "}</span>{parts.slice(1).join("___")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((o, k) => {
          const cls = !f ? "border-love-200 bg-white hover:bg-love-50" : k === f.answer ? "border-green-500 bg-green-50 text-green-800" : k === f.choice ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 bg-white opacity-60";
          return <button key={k} onClick={() => choose(k)} disabled={!!f || busy} className={`rounded-xl border-2 px-3 py-2.5 text-left font-bold transition ${cls}`} data-testid={`grammar-opt-${k}`}>{String.fromCharCode(65 + k)}. {o}</button>;
        })}
      </div>
      {f && (
        <div className={`rounded-xl p-3 text-sm ${f.correct ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`} role="status">
          <b>{f.correct ? "Chính xác! " : "Chưa đúng. "}</b>{f.explain}
        </div>
      )}
      {err && <p className="text-sm font-bold text-red-600">{err}</p>}
      {f && (last
        ? <button className={`${btnPrimary} w-full`} onClick={finish} disabled={busy} data-testid="grammar-finish">Nộp bài</button>
        : <button className={`${btnGhost} w-full`} onClick={() => setI(i + 1)} data-testid="grammar-next">Câu tiếp →</button>)}
    </Card></div>
  );
}
