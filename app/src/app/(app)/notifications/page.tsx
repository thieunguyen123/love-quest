import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Card } from "@/components/ui";

export default async function NotificationsPage() {
  const { supabase } = await requirePlayer();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  return (
    <div className="max-w-xl mx-auto space-y-3">
      <h1 className="text-2xl font-extrabold text-love-700">📬 Hộp thư</h1>
      {(data ?? []).length === 0 && <Card>Chưa có thông báo nào.</Card>}
      {data?.map((n) => (
        <Link key={n.id} href={n.type === "ATTACKED" ? "/battles" : n.data?.level ? `/levels/${n.data.level}` : "/"}>
          <Card className={`mb-3 ${n.read_at ? "" : "ring-2 ring-love-300"}`}><div className="font-extrabold">{n.title}</div><div className="text-sm">{n.body}</div><div className="text-xs text-love-700/60">{new Date(n.created_at).toLocaleString("vi-VN")}</div></Card>
        </Link>
      ))}
    </div>
  );
}
