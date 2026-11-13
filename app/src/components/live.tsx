"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { play } from "@/lib/sfx";

type Notif = { id: number; type: string; title: string; body: string; data: { level?: number }; read_at: string | null; created_at: string };

// Chuông thông báo + toast realtime (NOT-01) + làm mới trang khi màn thay đổi
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [toast, setToast] = useState<Notif | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sb = createClient();
    sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(30).then(({ data }) => setItems((data as Notif[]) ?? []));
    const ch = sb.channel(`live-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (p) => {
        const n = p.new as Notif;
        setItems((x) => [n, ...x]); setToast(n); play("coin"); router.refresh();
        setTimeout(() => setToast((t) => (t?.id === n.id ? null : t)), 6000);
        try { if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(n.title, { body: n.body }); } catch { /* ignore */ }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "levels" }, () => router.refresh())
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [userId, router]);

  const unread = items.filter((i) => !i.read_at).length;
  async function markAll() {
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    setItems((x) => x.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
  }
  const href = (n: Notif) => n.type === "ATTACKED" ? "/battles" : n.data?.level ? `/levels/${n.data.level}` : "/";

  return (
    <>
      <div className="relative">
        <button aria-label={`Thông báo (${unread} chưa đọc)`} onClick={() => { setOpen((o) => !o); }} className="relative text-xl px-1">
          🔔{unread > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5">{unread}</span>}
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto bg-white rounded-xl border border-love-100 shadow-lg z-30">
            <div className="flex items-center justify-between px-3 py-2 border-b border-love-100 text-sm font-bold">
              <span>Thông báo</span><button onClick={markAll} className="text-love-600 underline">Đánh dấu đã đọc</button>
            </div>
            {items.length === 0 && <p className="p-4 text-sm text-center">Chưa có thông báo</p>}
            {items.map((n) => (
              <Link key={n.id} href={href(n)} onClick={() => setOpen(false)} className={`block px-3 py-2 text-sm border-b border-love-50 hover:bg-love-50 ${n.read_at ? "" : "font-bold bg-love-50/50"}`}>
                <div>{n.title}</div><div className="font-normal text-love-700/70">{n.body}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {toast && (
        <Link href={href(toast)} role="status" className="fixed bottom-4 right-4 z-50 max-w-xs bg-white border border-love-200 rounded-2xl shadow-xl p-4 text-sm">
          <div className="font-extrabold text-love-700">{toast.title}</div><div>{toast.body}</div>
        </Link>
      )}
    </>
  );
}
