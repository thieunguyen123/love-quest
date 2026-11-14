"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  useEffect(() => {   // Esc để đóng
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open]);
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
        {open && createPortal(
          <>
            {/* render vào <body> (portal): thanh trên có backdrop-blur nên "fixed" bên trong nó bị neo theo thanh, không theo màn hình */}
            {/* lớp nền: chạm ra ngoài là đóng */}
            <div className="fixed inset-0 z-30 bg-black/20 sm:bg-transparent" onClick={() => setOpen(false)} aria-hidden data-testid="notif-backdrop" />
            <div role="dialog" aria-label="Thông báo" data-testid="notif-panel"
              className="fixed inset-x-2 top-16 z-40 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border border-love-100 bg-white shadow-xl sm:left-auto sm:right-4 sm:w-96 sm:max-h-[28rem]">
              <div className="flex items-center gap-2 border-b border-love-100 px-3 py-2 text-sm font-bold">
                <span className="flex-1">🔔 Thông báo</span>
                {unread > 0 && <button onClick={markAll} className="text-love-600 underline">Đánh dấu đã đọc</button>}
                <button onClick={() => setOpen(false)} aria-label="Đóng" className="grid h-8 w-8 place-items-center rounded-full bg-love-50 text-base font-black text-love-700">✕</button>
              </div>
              <div className="overflow-y-auto overscroll-contain">
                {items.length === 0 && <p className="p-4 text-center text-sm">Chưa có thông báo</p>}
                {items.map((n) => (
                  <Link key={n.id} href={href(n)} onClick={() => setOpen(false)} className={`block border-b border-love-50 px-3 py-2.5 text-sm hover:bg-love-50 ${n.read_at ? "" : "bg-love-50/50 font-bold"}`}>
                    <div className="break-words">{n.title}</div><div className="break-words font-normal text-love-700/70">{n.body}</div>
                    <div className="mt-0.5 text-[11px] font-normal text-love-700/50">{new Date(n.created_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</div>
                  </Link>
                ))}
              </div>
            </div>
          </>, document.body)}
      </div>
      {toast && (
        <Link href={href(toast)} role="status" onClick={() => setToast(null)} className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-sm bg-white border border-love-200 rounded-2xl shadow-xl p-4 text-sm sm:inset-x-auto sm:right-4">
          <div className="font-extrabold text-love-700">{toast.title}</div><div>{toast.body}</div>
        </Link>
      )}
    </>
  );
}

/** Menu avatar: chạm ra ngoài / Esc / chọn mục là đóng (trước đây dùng <details> nên không tự đóng) */
export function UserMenu({ avatar, links, signOut }: { avatar: React.ReactNode; links: { href: string; label: string }[]; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Menu tài khoản" aria-expanded={open}>{avatar}</button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed right-3 top-14 z-40 w-48 rounded-xl border border-love-100 bg-white p-2 text-sm font-semibold shadow-lg">
            {links.map((l) => <Link key={l.href} className="block rounded-lg px-3 py-2 hover:bg-love-50" href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>)}
            <form action={signOut}><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-love-50">Đăng xuất</button></form>
          </div>
        </>, document.body)}
    </div>
  );
}
