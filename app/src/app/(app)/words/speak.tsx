"use client";
import { speak, defaultRate } from "@/lib/tts";
export function SpeakButton({ text }: { text: string }) {
  return <button aria-label={`Nghe ${text}`} onClick={() => speak(text, defaultRate())} className="ml-1">🔊</button>;
}
