"use client";
import { useActionState, useState } from "react";
import { Card, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { deleteWord, importWords, saveLevel, saveWord } from "../../actions";

type Level = { id: string; order_no: number; topic_en: string; topic_vi: string; cefr: string; word_count: number; question_count: number; seconds_per_question: number; reward_multiplier: number; status: string };
type Word = { id: string; word: string; ipa: string | null; part_of_speech: string | null; meanings_vi: string[]; example_en: string | null; example_vi: string | null };

function Msg({ s }: { s?: { ok: boolean; message: string; errors?: string[] } }) {
  if (!s) return null;
  return (
    <div role="status" className={`text-sm font-semibold ${s.ok ? "text-green-700" : "text-red-600"}`}>
      {s.message}
      {s.errors && <ul className="list-disc pl-5 font-normal max-h-40 overflow-auto">{s.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

function WordForm({ levelId, word, disabled, onDone }: { levelId: string; word?: Word; disabled: boolean; onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (p: { ok: boolean; message: string; errors?: string[] } | undefined, f: FormData) => { const r = await saveWord(p, f); if (r.ok) onDone?.(); return r; }, undefined);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-6 items-start">
      <input type="hidden" name="level_id" value={levelId} />
      {word && <input type="hidden" name="id" value={word.id} />}
      <input name="word" defaultValue={word?.word} placeholder="word" required className={inputCls} />
      <input name="ipa" defaultValue={word?.ipa ?? ""} placeholder="/ipa/" className={inputCls} />
      <input name="part_of_speech" defaultValue={word?.part_of_speech ?? ""} placeholder="noun" className={inputCls} />
      <input name="meanings_vi" defaultValue={word?.meanings_vi.join("|")} placeholder="nghĩa 1|nghĩa 2" required className={`${inputCls} sm:col-span-2`} />
      <button disabled={disabled || pending} className={btnPrimary}>{word ? "Lưu" : "Thêm"}</button>
      <input name="example_en" defaultValue={word?.example_en ?? ""} placeholder="Ví dụ EN" className={`${inputCls} sm:col-span-3`} />
      <input name="example_vi" defaultValue={word?.example_vi ?? ""} placeholder="Ví dụ VN" className={`${inputCls} sm:col-span-3`} />
      <div className="sm:col-span-6"><Msg s={state} /></div>
    </form>
  );
}

export default function LevelEditor({ level, words, locked }: { level: Level; words: Word[]; locked: boolean }) {
  const [lvState, lvAction, lvPending] = useActionState(saveLevel, undefined);
  const [impState, impAction, impPending] = useActionState(importWords, undefined);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      <Card className="space-y-3">
        <h1 className="text-xl font-extrabold text-love-700">Màn {level.order_no} · {level.status}</h1>
        {locked && <p className="text-sm font-semibold text-amber-700">Màn đang chơi / đã đóng: không thể chỉnh sửa.</p>}
        <form action={lvAction} className="grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="id" value={level.id} />
          <label className="text-xs font-bold">Chủ đề EN<input name="topic_en" defaultValue={level.topic_en} className={inputCls} /></label>
          <label className="text-xs font-bold">Chủ đề VN<input name="topic_vi" defaultValue={level.topic_vi} className={inputCls} /></label>
          <label className="text-xs font-bold">CEFR<input name="cefr" defaultValue={level.cefr} className={inputCls} /></label>
          <label className="text-xs font-bold">Số câu<input name="question_count" type="number" defaultValue={level.question_count} className={inputCls} /></label>
          <label className="text-xs font-bold">Giây / câu<input name="seconds_per_question" type="number" defaultValue={level.seconds_per_question} className={inputCls} /></label>
          <label className="text-xs font-bold">Hệ số thưởng<input name="reward_multiplier" type="number" step="0.1" defaultValue={level.reward_multiplier} className={inputCls} /></label>
          <div className="sm:col-span-3 flex items-center gap-3"><button disabled={locked || lvPending} className={btnPrimary}>Lưu màn</button><Msg s={lvState} /></div>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-extrabold text-love-700">Từ vựng ({words.length}/{level.word_count})</h2>
        <form action={impAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="level_id" value={level.id} />
          <input type="hidden" name="order_no" value={level.order_no} />
          <input name="file" type="file" accept=".csv,text/csv" className="text-sm" />
          <button disabled={locked || impPending} className={btnGhost}>Import CSV</button>
          <span className="text-xs text-love-700/60">Header: level,word,ipa,part_of_speech,meanings_vi,example_en,example_vi</span>
          <div className="w-full"><Msg s={impState} /></div>
        </form>
        <div className="border-t border-love-100 pt-3"><WordForm levelId={level.id} disabled={locked} /></div>
        <ul className="divide-y divide-love-100">
          {words.map((w) => (
            <li key={w.id} className="py-2">
              {editing === w.id ? (
                <WordForm levelId={level.id} word={w} disabled={locked} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1"><b>{w.word}</b> <span className="text-love-600 text-sm">{w.ipa}</span> — {w.meanings_vi.join(" | ")}</div>
                  <button disabled={locked} onClick={() => setEditing(w.id)} className="text-sm font-bold text-love-600 underline disabled:opacity-40">Sửa</button>
                  <form action={deleteWord}><input type="hidden" name="id" value={w.id} /><button disabled={locked} className="text-sm font-bold text-red-600 underline disabled:opacity-40">Xóa</button></form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
