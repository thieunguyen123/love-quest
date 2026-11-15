"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { refreshCoins } from "@/components/coins";
import { speak, defaultRate } from "@/lib/tts";
import { play } from "@/lib/sfx";
import { Card, btnGhost, btnPrimary, inputCls } from "@/components/ui";

type Q = { finished: false; index: number; total: number; type: string; seconds: number; remaining_ms: number; score: number; combo: number; question: any };
type Fb = { correct: boolean; correct_answer: any; points: number; speed: number; combo_bonus: number; pairs: number; combo: number; score: number; finished: boolean };

export default function PlayClient({ attemptId, order, practice, revealMs }: { attemptId: string; order: number; practice: boolean; revealMs: number }) {
  const router = useRouter();
  const sb = useRef(createClient()).current;
  const [q, setQ] = useState<Q | null>(null);
  const [fb, setFb] = useState<Fb | null>(null);
  const [chosen, setChosen] = useState<any>(null);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const deadline = useRef(0);
  const answered = useRef(false);
  const listens = useRef(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);

  const finish = useCallback(async () => {
    await sb.rpc("submit_attempt", { p_attempt: attemptId });
    void refreshCoins();   // nộp bài có thể đóng màn → thưởng / trừ xu thắng-thua
    router.replace(`/levels/${order}/result?attempt=${attemptId}`);
  }, [sb, attemptId, order, router]);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("next_question", { p_attempt: attemptId });
    if (error) return setErr("Không tải được câu hỏi. Thử tải lại trang.");
    if (data.finished) return void finish();
    answered.current = false; listens.current = 0;
    setFb(null); setChosen(data.type === "MATCH" ? [] : null); setQ(data as Q);
    setScore(data.score); setCombo(data.combo);
    deadline.current = performance.now() + data.remaining_ms;
    const qs = data.question;
    if (data.type === "MC_EN_VN") speak(qs.speak, defaultRate());
    if (data.type === "LISTEN") { speak(qs.speak, defaultRate()); listens.current = 1; }
  }, [sb, attemptId, finish]);

  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async (answer: any) => {
    if (!q || answered.current) return;
    answered.current = true;
    const { data, error } = await sb.rpc("answer_question", { p_attempt: attemptId, p_index: q.index, p_answer: answer });
    if (error) { answered.current = false; return setErr("Không gửi được đáp án: " + error.message); }
    const f = data as Fb;
    setFb(f); setScore(f.score); setCombo(f.combo);
    play(f.correct ? "correct" : "wrong");
    if (f.correct && q.question.speak) speak(q.question.speak, defaultRate());
    setTimeout(() => { if (f.finished) void finish(); else void load(); }, revealMs);
  }, [q, sb, attemptId, revealMs, finish, load]);

  // đồng hồ câu hỏi (thời điểm phát do server giữ; client chỉ hiển thị)
  useEffect(() => {
    if (!q || fb) return;
    const t = setInterval(() => {
      const r = deadline.current - performance.now();
      setLeft(Math.max(0, r));
      if (r <= 0 && !answered.current) void submit(q.type === "MATCH" ? [] : "");
    }, 100);
    return () => clearInterval(t);
  }, [q, fb, submit]);

  // phím 1–4 chọn đáp án
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || fb || !q.question.options || (e.target instanceof HTMLElement && e.target.tagName === "INPUT")) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < q.question.options.length) { setChosen(q.question.options[i]); void submit(q.question.options[i]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, fb, submit]);

  if (err) return <Card className="max-w-md mx-auto text-center space-y-3"><p role="alert" className="text-red-600 font-semibold">{err}</p><button className={btnPrimary} onClick={() => location.reload()}>Tải lại</button></Card>;
  if (!q) return <p className="text-center py-20 font-bold text-love-700">Đang tải…</p>;

  const total = q.seconds * 1000;
  const pct = fb ? 0 : Math.max(0, Math.min(100, (left / total) * 100));
  const qs = q.question;

  const optionBtn = (o: string, i: number) => {
    const isRight = fb && (Array.isArray(fb.correct_answer) ? false : String(fb.correct_answer).toLowerCase() === o.toLowerCase());
    const isWrong = fb && chosen === o && !fb.correct;
    return (
      <button key={o} disabled={!!fb} onClick={() => { setChosen(o); void submit(o); }}
        className={`rounded-xl border-2 px-4 py-3 text-left font-bold transition ${isRight ? "border-green-500 bg-green-100" : isWrong ? "border-red-500 bg-red-100 shake" : "border-love-200 bg-white hover:bg-love-50"}`}>
        <span className="text-love-700/50 mr-2">{i + 1}</span>{o}
      </button>
    );
  };

  return (
    <div className="max-w-xl mx-auto space-y-3">
      <div className="flex items-center justify-between text-sm font-bold">
        <span>{practice ? "🎯 Luyện tập" : "⚔️ Thi đấu"} · Câu {q.index + 1}/{q.total}</span>
        <span>{combo >= 2 ? `🔥 x${combo} ` : ""}⭐ {score}</span>
      </div>
      <div className="h-3 rounded-full bg-love-100 overflow-hidden" aria-label="Thời gian còn lại">
        <div className={`h-full transition-[width] duration-100 ${pct < 25 ? "bg-red-500" : "bg-love-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <Card className="space-y-4 !p-6">
        {q.type === "MC_EN_VN" && (<><div className="text-center"><div className="text-4xl font-extrabold text-love-700">{qs.prompt}</div><button className={`${btnGhost} mt-2`} onClick={() => speak(qs.speak, defaultRate())}>🔊 Nghe</button></div><div className="grid gap-2">{qs.options.map(optionBtn)}</div></>)}
        {q.type === "MC_VN_EN" && (<><div className="text-center text-3xl font-extrabold text-love-700">{qs.prompt}</div><div className="grid gap-2">{qs.options.map(optionBtn)}</div></>)}
        {q.type === "LISTEN" && (<><div className="text-center space-y-2"><button className={`${btnPrimary} text-2xl px-8 py-4`} onClick={() => { if (listens.current < 3) { listens.current++; speak(qs.speak, defaultRate()); } }} disabled={listens.current >= 3 && false}>🔊 Nghe</button><div className="text-xs text-love-700/60">Nghe và chọn từ đúng (tối đa 2 lần nghe lại)</div></div><div className="grid gap-2">{qs.options.map(optionBtn)}</div></>)}
        {q.type === "FILL" && (<><div className="text-center space-y-1"><div className="text-xl font-bold">{qs.sentence}</div><div className="text-love-700/70">({qs.prompt})</div></div><div className="grid gap-2">{qs.options.map(optionBtn)}</div></>)}
        {q.type === "SPELL" && <Spell key={q.index} qs={qs} fb={fb} onSubmit={(s) => void submit(s)} />}
        {q.type === "MATCH" && <Match key={q.index} qs={qs} fb={fb} chosen={chosen} setChosen={setChosen} onSubmit={(m) => void submit(m)} />}
      </Card>
      {fb && (
        <div role="status" className={`rounded-xl p-3 text-center font-bold ${fb.correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {fb.correct ? `✅ Đúng! +${fb.points}${fb.speed ? ` (⚡${fb.speed}` : ""}${fb.combo_bonus ? ` 🔥${fb.combo_bonus}` : ""}${fb.speed ? ")" : ""}` : q.type === "MATCH" ? `❌ Nối đúng ${fb.pairs}/4 cặp (+${fb.points})` : `❌ Đáp án: ${fb.correct_answer}`}
        </div>
      )}
    </div>
  );
}

function Spell({ qs, fb, onSubmit }: { qs: any; fb: Fb | null; onSubmit: (s: string) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState("");
  const word = typed || picked.map((i) => qs.letters[i]).join("");
  return (
    <div className="space-y-3 text-center">
      <div className="text-2xl font-extrabold text-love-700">{qs.prompt}</div>
      <div className="min-h-12 rounded-xl border-2 border-dashed border-love-300 p-2 text-2xl font-extrabold tracking-widest">{word || "…"}</div>
      <div className="flex flex-wrap justify-center gap-2">
        {qs.letters.map((ch: string, i: number) => (
          <button key={i} disabled={!!fb || picked.includes(i)} onClick={() => { setTyped(""); setPicked((p) => [...p, i]); }}
            className="h-11 w-11 rounded-lg bg-love-100 border border-love-300 font-extrabold text-lg disabled:opacity-30">{ch}</button>
        ))}
      </div>
      <input value={typed} onChange={(e) => { setTyped(e.target.value); setPicked([]); }} placeholder="…hoặc gõ trực tiếp" disabled={!!fb}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(word); }} className={inputCls} aria-label="Từ tiếng Anh" />
      <div className="flex gap-2 justify-center">
        <button className={btnGhost} disabled={!!fb} onClick={() => { setPicked([]); setTyped(""); }}>Xóa</button>
        <button className={btnPrimary} disabled={!!fb || !word} onClick={() => onSubmit(word)}>Trả lời</button>
      </div>
    </div>
  );
}

function Match({ qs, fb, chosen, setChosen, onSubmit }: { qs: any; fb: Fb | null; chosen: number[]; setChosen: (m: any) => void; onSubmit: (m: number[]) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const map: (number | undefined)[] = [0, 1, 2, 3].map((i) => chosen[i]);
  const usedVi = new Set(map.filter((x) => x !== undefined));
  function pickVi(j: number) {
    if (fb || sel === null || usedVi.has(j)) return;
    const next = [...map]; next[sel] = j; setChosen(next); setSel(null);
    if (next.every((x) => x !== undefined)) onSubmit(next as number[]);
  }
  return (
    <div className="space-y-2">
      <div className="text-center text-sm font-bold text-love-700/70">Chọn từ tiếng Anh rồi chọn nghĩa tương ứng</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">{qs.pairs_en.map((w: string, i: number) => (
          <button key={w} disabled={!!fb} onClick={() => { if (map[i] !== undefined) { const n = [...map]; n[i] = undefined; setChosen(n); } setSel(i); }}
            className={`w-full rounded-xl border-2 px-3 py-2 font-bold ${sel === i ? "border-love-600 bg-love-100" : map[i] !== undefined ? "border-green-400 bg-green-50" : "border-love-200 bg-white"}`}>{w}{map[i] !== undefined && <span className="text-xs block text-love-700/60">→ {qs.pairs_vi[map[i]!]}</span>}</button>
        ))}</div>
        <div className="space-y-2">{qs.pairs_vi.map((w: string, j: number) => (
          <button key={w} disabled={!!fb || usedVi.has(j)} onClick={() => pickVi(j)}
            className="w-full rounded-xl border-2 border-love-200 bg-white px-3 py-2 font-bold disabled:opacity-40">{w}</button>
        ))}</div>
      </div>
    </div>
  );
}
