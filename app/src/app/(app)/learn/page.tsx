import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Card } from "@/components/ui";

const STATUS: Record<string, { label: string; cls: string }> = {
  LOCKED: { label: "🔒 Khóa", cls: "bg-gray-100 text-gray-500" },
  OPEN: { label: "Đang mở", cls: "bg-green-100 text-green-700" },
  COUNTDOWN: { label: "⏳ Đếm ngược", cls: "bg-amber-100 text-amber-700" },
  CLOSED: { label: "👑 Đã đóng", cls: "bg-love-100 text-love-700" },
};

export default async function LearnPage() {
  const { supabase, me } = await requirePlayer();
  const [{ data: levels }, { data: words }, { data: prog }] = await Promise.all([
    supabase.from("levels").select("id,order_no,topic_en,topic_vi,cefr,status").order("order_no"),
    supabase.from("words").select("id,level_id"),
    supabase.from("word_progress").select("word_id,status").eq("user_id", me.id),
  ]);
  const mastered = new Set((prog ?? []).filter((p) => p.status === "MASTERED").map((p) => p.word_id));
  const total = new Map<string, number>(), known = new Map<string, number>();
  for (const w of words ?? []) {
    total.set(w.level_id, (total.get(w.level_id) ?? 0) + 1);
    if (mastered.has(w.id)) known.set(w.level_id, (known.get(w.level_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-love-700">📚 Thư viện chủ đề</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {levels?.map((l) => {
          const st = STATUS[l.status];
          const locked = l.status === "LOCKED";
          const n = total.get(l.id) ?? 0, k = known.get(l.id) ?? 0;
          const pct = n ? Math.round((k / n) * 100) : 0;
          const body = (
            <Card className={`h-full space-y-2 ${locked ? "opacity-60" : "hover:shadow-md transition"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-love-700/70">Màn {l.order_no} · {l.cefr}</span>
                <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
              </div>
              <div className="font-extrabold">{l.topic_vi}</div>
              <div className="text-sm text-love-700/70">{l.topic_en}</div>
              {!locked && (
                <>
                  <div className="h-2 rounded-full bg-love-100 overflow-hidden"><div className="h-full bg-love-500" style={{ width: `${pct}%` }} /></div>
                  <div className="text-xs font-semibold">{n ? `${k}/${n} từ đã thuộc (${pct}%)` : "Chưa có từ vựng"}</div>
                </>
              )}
            </Card>
          );
          return locked
            ? <div key={l.id} aria-disabled="true">{body}</div>
            : <Link key={l.id} href={`/learn/${l.order_no}`}>{body}</Link>;
        })}
      </div>
    </div>
  );
}
