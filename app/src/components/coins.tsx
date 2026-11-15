"use client";
// Số xu dùng chung, cập nhật NGAY (không chờ tải lại trang): Realtime trên bảng profiles + đọc lại sau mỗi giao dịch.
// Xu vẫn chỉ đổi qua RPC ở server (nguyên tắc 1) — đây chỉ là hiển thị.
import { useEffect, useSyncExternalStore } from "react";
import { createClient, realtimeReady } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

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
    let ch: ReturnType<typeof sb.channel> | null = null, gone = false;
    // đợi gắn phiên đăng nhập vào Realtime rồi mới nghe (không thì RLS chặn, không nhận được sự kiện)
    void realtimeReady(sb).then(() => {
      if (gone) return;
      ch = sb.channel(`coins-${userId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (p) => {
          const n = (p.new as { coins?: number }).coins;
          if (typeof n === "number") setCoins(n);
        })
        .subscribe((st) => { if (st === "SUBSCRIBED") void refreshCoins(); });
    });
    // lưới an toàn: quay lại tab / mở lại app, và định kỳ khi đang xem → đọc lại số xu
    const onVis = () => { if (!document.hidden) void refreshCoins(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const iv = setInterval(() => { if (!document.hidden) void refreshCoins(); }, 20000);
    return () => { gone = true; if (ch) void sb.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); clearInterval(iv); };
  }, [userId]);
  // chuyển trang (layout không render lại) → đọc lại xu (vd. vừa nộp bài thi đấu, nhận thưởng màn)
  const path = usePathname();
  useEffect(() => { void refreshCoins(); }, [path]);
  const coins = useCoins(initial);
  return <span title="Số xu" data-testid="coins" className="rounded-full bg-amber-100 text-amber-800 font-extrabold text-sm px-3 py-1 tabular-nums">🪙 {coins.toLocaleString("vi-VN")}</span>;
}
