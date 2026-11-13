"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { btnGhost, btnPrimary } from "./ui";

const MSG: Record<string, string> = {
  LEVEL_LOCKED: "Màn này chưa mở", LEVEL_CLOSED: "Màn đã đóng", ALREADY_PLAYED: "Bạn đã dùng hết lượt tính điểm của màn này",
  NOT_ENOUGH_WORDS: "Màn chưa có đủ từ vựng (cần ≥ 4 từ)", NOT_ENOUGH_DISTINCT_WORDS: "Màn chưa có đủ từ vựng khác nghĩa nhau",
};

export function StartButton({ levelId, order, mode, label, confirm: ask, ghost }: {
  levelId: string; order: number; mode: "RANKED" | "PRACTICE"; label: string; confirm?: string; ghost?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    if (ask && !window.confirm(ask)) return;
    setBusy(true); setErr(null);
    const { data, error } = await createClient().rpc("start_attempt", { p_level: levelId, p_mode: mode });
    if (error) { setBusy(false); return setErr(MSG[error.message] ?? "Không bắt đầu được"); }
    router.push(`/levels/${order}/play?attempt=${data}${mode === "PRACTICE" ? "&practice=1" : ""}`);
  }
  return (
    <div className="space-y-1">
      <button disabled={busy} onClick={go} className={ghost ? btnGhost : btnPrimary}>{busy ? "Đang tải…" : label}</button>
      {err && <p role="alert" className="text-sm text-red-600 font-semibold">{err}</p>}
    </div>
  );
}
