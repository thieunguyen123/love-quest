import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setVapidDetails, sendNotification } from "web-push";

// Được gọi bởi trigger DB (pg_net) khi có thông báo mới. Bảo vệ bằng header x-push-secret = PUSH_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET, pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !pub || !priv) return NextResponse.json({ error: "push not configured" }, { status: 501 });
  if (req.headers.get("x-push-secret") !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.user_id || !b?.title) return NextResponse.json({ error: "invalid" }, { status: 400 });
  setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@lovequest.local", pub, priv);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", b.user_id);
  const url = b.type === "ATTACKED" ? "/battles" : b.data?.level ? `/levels/${b.data.level}` : "/";
  let sent = 0;
  for (const s of subs ?? []) {
    try { await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: b.title, body: b.body ?? "", url })); sent++; }
    catch (e: unknown) { if ((e as { statusCode?: number }).statusCode === 410 || (e as { statusCode?: number }).statusCode === 404) await sb.from("push_subscriptions").delete().eq("id", s.id); }
  }
  return NextResponse.json({ sent });
}
