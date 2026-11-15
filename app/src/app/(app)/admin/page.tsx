// ADM-01: Tổng quan admin — tình hình 2 người chơi, màn đang mở, việc cần làm, thao tác gần đây
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Card } from "@/components/ui";
import { ADMIN_LINKS } from "@/components/admin-links";

const STATUS: Record<string, string> = { LOCKED: "🔒 Khoá", OPEN: "🟢 Đang mở", COUNTDOWN: "⏳ Đếm ngược", CLOSED: "👑 Đã đóng" };

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const [{ data: players }, { data: houses }, { data: levels }, { data: words }, { data: logs }, { count: grammar }] = await Promise.all([
    supabase.from("profiles").select("id,display_name,role,coins,army_level,favorite_color,onboarded_at").is("deleted_at", null),
    supabase.from("user_house").select("user_id,level,hp,max_hp"),
    supabase.from("levels").select("id,order_no,topic_vi,status,word_count,deadline_at").order("order_no"),
    supabase.from("words").select("level_id"),
    supabase.from("admin_logs").select("id,action,entity,entity_id,created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("grammar_lessons").select("id", { count: "exact", head: true }),
  ]);
  const house = new Map((houses ?? []).map((h) => [h.user_id, h]));
  const n = new Map<string, number>();
  (words ?? []).forEach((w) => n.set(w.level_id, (n.get(w.level_id) ?? 0) + 1));
  const current = levels?.find((l) => l.status === "OPEN" || l.status === "COUNTDOWN");
  const missing = (levels ?? []).filter((l) => (n.get(l.id) ?? 0) < Math.min(4, l.word_count) || (n.get(l.id) ?? 0) < l.word_count);
  const closed = (levels ?? []).filter((l) => l.status === "CLOSED").length;

  return (
    <>
      <h1 className="text-2xl font-extrabold text-love-700">📊 Tổng quan</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {(players ?? []).map((p) => {
          const h = house.get(p.id);
          return (
            <Card key={p.id} className="space-y-1" >
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: p.favorite_color ?? "#ec4899" }} />
                <b className="flex-1">{p.display_name || "(chưa đặt tên)"}</b>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.role === "ADMIN" ? "bg-violet-100 text-violet-700" : "bg-love-50 text-love-700"}`}>{p.role === "ADMIN" ? "Admin" : "Người chơi"}</span>
              </div>
              <div className="text-sm">🪙 <b>{(p.coins ?? 0).toLocaleString("vi-VN")}</b> xu · 🪖 cấp quân {p.army_level}</div>
              <div className="text-sm">{h ? <>🏠 Nhà cấp {h.level} · HP {h.hp}/{h.max_hp}{h.hp === 0 ? " 💥 đổ nát" : ""}</> : p.onboarded_at ? "🏕️ chưa dựng nhà" : "⏳ chưa hoàn tất hồ sơ"}</div>
            </Card>
          );
        })}
        {(players ?? []).length < 2 && <Card className="text-sm text-love-700/70">Mới có {(players ?? []).length}/2 người chơi — người thứ hai đăng ký ở /signup sẽ tự ghép đôi.</Card>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="space-y-1"><div className="text-xs font-bold text-love-700/60">Màn đang chơi</div><div className="font-extrabold">{current ? `Màn ${current.order_no}: ${current.topic_vi}` : "Không có"}</div><div className="text-xs">{current ? STATUS[current.status] : ""}{current?.deadline_at ? ` · hết hạn ${new Date(current.deadline_at).toLocaleString("vi-VN")}` : ""}</div></Card>
        <Card className="space-y-1"><div className="text-xs font-bold text-love-700/60">Tiến độ</div><div className="font-extrabold">{closed}/{levels?.length ?? 0} màn đã đóng</div><div className="text-xs">{(words ?? []).length} từ vựng · {grammar ?? 0} bài ngữ pháp</div></Card>
        <Card className={`space-y-1 ${missing.length ? "border-amber-300" : ""}`}><div className="text-xs font-bold text-love-700/60">Việc cần làm</div>
          {missing.length ? <><div className="font-extrabold text-amber-700">{missing.length} màn thiếu từ vựng</div><div className="text-xs">{missing.slice(0, 6).map((l) => <Link key={l.id} href={`/admin/levels/${l.order_no}`} className="mr-2 font-bold underline">Màn {l.order_no} ({n.get(l.id) ?? 0}/{l.word_count})</Link>)}</div></> : <div className="font-extrabold text-green-700">Đủ từ cho mọi màn ✅</div>}
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ADMIN_LINKS.filter((l) => l.href !== "/admin").map((l) => (
          <Link key={l.href} href={l.href}><Card className={`flex items-center gap-3 transition hover:shadow-md ${l.href === "/admin/season" ? "border-red-200" : ""}`}><span className="text-3xl">{l.icon}</span><div><div className="font-extrabold">{l.label}</div><div className="text-sm text-love-700/70">{l.hint}</div></div></Card></Link>
        ))}
      </div>

      <Card className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-extrabold text-love-700">Thao tác gần đây</h2><Link href="/admin/logs" className="text-sm font-bold text-love-600 underline">Xem tất cả</Link></div>
        {(logs ?? []).length === 0 ? <p className="text-sm">Chưa có thao tác nào.</p> : (
          <ul className="divide-y divide-love-100 text-sm">{logs!.map((l) => <li key={l.id} className="py-1.5"><b>{l.action}</b> {l.entity} {l.entity_id} <span className="text-love-700/60">· {new Date(l.created_at).toLocaleString("vi-VN")}</span></li>)}</ul>
        )}
      </Card>
    </>
  );
}
