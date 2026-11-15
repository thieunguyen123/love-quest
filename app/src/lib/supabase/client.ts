import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

type Browser = SupabaseClient;
let rtAuth: Promise<void> | null = null;

/**
 * Realtime (postgres_changes) chạy dưới quyền người đăng nhập → RLS mới cho nhận sự kiện của bảng profiles/notifications.
 * Trên trình duyệt phiên nằm trong cookie và KHÔNG tự gắn vào kết nối Realtime → phải setAuth bằng access token,
 * và gắn lại mỗi lần token được làm mới. Các kênh nên `await realtimeReady(sb)` rồi mới subscribe.
 */
export function realtimeReady(sb: Browser): Promise<void> {
  rtAuth ??= (async () => {
    const { data } = await sb.auth.getSession();
    if (data.session) await sb.realtime.setAuth(data.session.access_token);
    sb.auth.onAuthStateChange((_e: AuthChangeEvent, s: Session | null) => { if (s?.access_token) void sb.realtime.setAuth(s.access_token); });
  })().catch(() => { rtAuth = null; });
  return rtAuth;
}

export function createClient() {
  const sb = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  if (typeof window !== "undefined") void realtimeReady(sb as unknown as Browser);
  return sb;
}
