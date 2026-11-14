"use client";
// Số xu dùng chung, cập nhật NGAY (không chờ tải lại trang): Realtime trên bảng profiles + đọc lại sau mỗi giao dịch.
// Xu vẫn chỉ đổi qua RPC ở server (nguyên tắc 1) — đây chỉ là hiển thị.
import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

let current: number | null = null;
let uid: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
export function setCoins(n: number) { if (current !== n) { current = n; emit(); } }

/** Đọc lại số xu từ database (gọi sau khi mua / nâng cấp / sửa nhà…) */
export async function refreshCoins() {
  if (!uid) return;
  const { data } = await createClient().from("profiles").select("coins").eq("id", uid).single();
  if (data) setCoins(data.coins);
}

/** Số xu hiện tại; `fallback` = giá trị server render (dùng tới khi có số mới hơn) */
export function useCoins(fallback: number) {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => current ?? fallback, () => fallback);
}

/** Huy hiệu xu ở thanh trên — giữ kênh Realtime cho cả app */
export function CoinBadge({ userId, initial }: { userId: string; initial: number }) {
  useEffect(() => { uid = userId; setCoins(initial); }, [userId, initial]);
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`coins-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (p) => {
        const n = (p.new as { coins?: number }).coins;
        if (typeof n === "number") setCoins(n);
      })
      .subscribe();
    // quay lại tab / mở lại app → đồng bộ lại
    const onVis = () => { if (!document.hidden) void refreshCoins(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { void sb.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); };
  }, [userId]);
  const coins = useCoins(initial);
  return <span title="Số xu" data-testid="coins" className="rounded-full bg-amber-100 text-amber-800 font-extrabold text-sm px-3 py-1 tabular-nums">🪙 {coins.toLocaleString("vi-VN")}</span>;
}
