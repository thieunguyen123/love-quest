import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lưu đăng ký web push của người dùng đang đăng nhập
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await supabase.from("push_subscriptions").upsert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  return error ? NextResponse.json({ error: "db" }, { status: 500 }) : NextResponse.json({ ok: true });
}
