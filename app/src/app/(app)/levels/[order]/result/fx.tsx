"use client";
import { useEffect } from "react";
import { play } from "@/lib/sfx";

// Âm thanh + pháo hoa nhẹ khi thắng
export function ResultFx({ kind }: { kind: "win" | "lose" | "wait" | "practice" }) {
  useEffect(() => { if (kind === "win") play("win"); else if (kind === "lose") play("lose"); }, [kind]);
  if (kind !== "win") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-40">
      {Array.from({ length: 24 }).map((_, i) => (
        <span key={i} className="absolute text-2xl" style={{ left: `${(i * 37) % 100}%`, top: "-5%", animation: `fall ${2 + (i % 5) * 0.4}s ${(i % 6) * 0.2}s ease-in forwards` }}>{["🎉", "💖", "⭐", "🎊"][i % 4]}</span>
      ))}
      <style>{`@keyframes fall { to { transform: translateY(110vh) rotate(360deg); opacity: .2 } }`}</style>
    </div>
  );
}
