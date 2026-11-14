"use client";
// GRM-02: tốc độ đọc câu ví dụ ngữ pháp (0.5x / 0.75x / 1x) — lưu riêng ở localStorage "tts_rate_grammar"
import { useEffect, useState } from "react";
import { speak } from "@/lib/tts";

const KEY = "tts_rate_grammar";
const RATES = [0.5, 0.75, 1] as const;
function grammarRate(): number {
  try { const v = Number(localStorage.getItem(KEY)); return RATES.includes(v as (typeof RATES)[number]) ? v : 1; } catch { return 1; }
}

/** Bộ chọn tốc độ (đặt đầu bài học) */
export function SpeedPicker() {
  const [rate, setRate] = useState(1);
  useEffect(() => setRate(grammarRate()), []);
  const pick = (r: number) => { setRate(r); try { localStorage.setItem(KEY, String(r)); } catch { /* chế độ riêng tư */ } speak("Hello, this is the reading speed.", r); };
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-love-700" data-testid="speed-picker">
      <span>🔊 Tốc độ đọc:</span>
      <div className="flex gap-1 rounded-full bg-love-50 p-1">
        {RATES.map((r) => (
          <button key={r} onClick={() => pick(r)} aria-pressed={rate === r} data-testid={`speed-${r}`}
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${rate === r ? "bg-love-500 text-white shadow" : "text-love-700"}`}>{r}x</button>
        ))}
      </div>
    </div>
  );
}

/** Nút 🔊 cho câu ví dụ — đọc theo tốc độ đã chọn */
export function GrammarSpeak({ text }: { text: string }) {
  return <button aria-label={`Nghe: ${text}`} onClick={() => speak(text, grammarRate())} className="ml-1">🔊</button>;
}
