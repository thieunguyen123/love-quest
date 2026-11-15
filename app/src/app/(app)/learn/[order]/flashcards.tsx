"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { refreshCoins } from "@/components/coins";
import { speak, defaultRate } from "@/lib/tts";
import { Card, btnGhost, btnPrimary } from "@/components/ui";
import { StartButton } from "@/components/start-button";

type Word = { id: string; word: string; ipa: string | null; part_of_speech: string | null; meanings_vi: string[]; example_en: string | null; example_vi: string | null };

export default function Flashcards({ level, words, known, bonusClaimed }: {
  level: { id: string; order_no: number; topic_vi: string; topic_en: string };
  words: Word[]; known: string[]; bonusClaimed: boolean;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set(known)); // đã đánh dấu (thuộc / chưa thuộc)
  const [knownSet, setKnownSet] = useState<Set<string>>(new Set(known));
  const [rate, setRate] = useState(1);
  const [bonus, setBonus] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const w = words[i];
  const allSeen = words.length > 0 && words.every((x) => seen.has(x.id));

  useEffect(() => { setRate(defaultRate()); }, []);

  const go = useCallback((d: number) => { setFlipped(false); setI((x) => Math.min(words.length - 1, Math.max(0, x + d))); }, [words.length]);

  const mark = useCallback(async (ok: boolean) => {
    if (!w) return;
    const { error } = await createClient().rpc("mark_word", { p_word: w.id, p_known: ok });
    if (error) return setErr("Không lưu được tiến độ");
    setSeen((s) => new Set(s).add(w.id));
    setKnownSet((s) => { const n = new Set(s); if (ok) n.add(w.id); else n.delete(w.id); return n; });
    if (i < words.length - 1) go(1);
  }, [w, i, words.length, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "1") mark(false);
      else if (e.key === "2") mark(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, mark]);

  // vuốt trên điện thoại
  const [touchX, setTouchX] = useState<number | null>(null);

  async function finish() {
    const { data, error } = await createClient().rpc("finish_flashcards", { p_level: level.id });
    if (error) return setErr("Chưa hoàn tất được, hãy đánh dấu hết các thẻ");
    setBonus(data as number);
    void refreshCoins();
    router.refresh();
  }

  if (!words.length) {
    return <Card className="text-center space-y-3"><p>Chủ đề này chưa có từ vựng.</p><Link href="/learn" className={btnGhost}>← Quay lại</Link></Card>;
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/learn" className="text-sm font-bold text-love-600">← Thư viện</Link>
        <div className="text-sm font-bold">Màn {level.order_no}: {level.topic_vi}</div>
        <div className="text-sm font-bold">{i + 1}/{words.length}</div>
      </div>
      <div className="h-2 rounded-full bg-love-100 overflow-hidden"><div className="h-full bg-love-500 transition-all" style={{ width: `${(seen.size / words.length) * 100}%` }} /></div>

      <div role="button" tabIndex={0} aria-label="Lật thẻ" onClick={() => setFlipped((f) => !f)}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => { if (touchX !== null) { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); } setTouchX(null); }}
        className="cursor-pointer select-none">
        <Card key={`${w.id}-${flipped}`} className="flip-in min-h-64 flex flex-col items-center justify-center text-center gap-3 !p-8">
          {!flipped ? (
            <>
              <div className="text-4xl font-extrabold text-love-700">{w.word}</div>
              {w.ipa && <div className="text-love-600">{w.ipa}</div>}
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button className={btnGhost} onClick={() => speak(w.word, rate)} aria-label="Nghe phát âm">🔊 Nghe</button>
                <button className={btnGhost} onClick={() => { const r = rate === 1 ? 0.7 : 1; setRate(r); speak(w.word, r); }}>{rate === 1 ? "1x" : "0.7x"}</button>
              </div>
              <div className="text-xs text-love-700/60">Nhấn Space hoặc chạm để lật</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-extrabold">{w.meanings_vi.join(", ")}</div>
              {w.part_of_speech && <div className="text-sm italic text-love-600">({w.part_of_speech})</div>}
              {w.example_en && (
                <div className="space-y-1 pt-2">
                  <div className="font-semibold">{w.example_en}</div>
                  <div className="text-sm text-love-700/70">{w.example_vi}</div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => mark(false)} className={btnGhost}>😅 Chưa thuộc <kbd className="text-xs opacity-60">1</kbd></button>
        <button onClick={() => mark(true)} className={btnPrimary}>✅ Đã thuộc <kbd className="text-xs opacity-60">2</kbd></button>
      </div>
      <div className="flex justify-between">
        <button onClick={() => go(-1)} disabled={i === 0} className={btnGhost}>← Trước</button>
        <button onClick={() => go(1)} disabled={i === words.length - 1} className={btnGhost}>Sau →</button>
      </div>

      {err && <p role="alert" className="text-sm text-red-600 font-semibold text-center">{err}</p>}
      {allSeen && bonus === null && (
        <Card className="text-center space-y-2">
          <p className="font-bold">Bạn đã xem hết {words.length} thẻ! Đã thuộc {knownSet.size}/{words.length}.</p>
          <button onClick={finish} className={btnPrimary}>{bonusClaimed ? "Hoàn tất" : "Hoàn tất & nhận thưởng 🪙"}</button>
        </Card>
      )}
      {bonus !== null && (
        <Card className="text-center space-y-1">
          <p className="text-lg font-extrabold text-love-700">{bonus > 0 ? `🎉 +${bonus} xu thưởng học trước!` : "✅ Đã hoàn tất chủ đề"}</p>
          <Link href="/learn" className={btnGhost}>Về thư viện</Link>
          <StartButton levelId={level.id} order={level.order_no} mode="PRACTICE" label="🎯 Ôn tập nhanh" ghost />
        </Card>
      )}
    </div>
  );
}
