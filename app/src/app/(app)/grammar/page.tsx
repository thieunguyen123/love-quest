// GRM-01: danh sách bài ngữ pháp TOEIC 0–600, chia 3 chặng; tiến độ của mình + người ấy
import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Card } from "@/components/ui";

const BANDS: Record<number, { name: string; range: string }> = {
  1: { name: "Nền tảng", range: "TOEIC 0–300" },
  2: { name: "Trung cấp", range: "TOEIC 300–450" },
  3: { name: "Hướng tới 600", range: "TOEIC 450–600" },
};

export default async function GrammarPage() {
  const { supabase, me, partner } = await requirePlayer();
  const [{ data: lessons }, { data: prog }, { data: cfg }] = await Promise.all([
    supabase.from("grammar_lessons").select("id,code,order_no,band,emoji,title_vi,title_en,summary_vi").order("order_no"),
    supabase.from("grammar_progress").select("user_id,lesson_id,best_correct,best_total,passed_at"),
    supabase.from("game_config").select("key,value").in("key", ["GRAMMAR_PASS_COINS", "GRAMMAR_PASS_PCT"]),
  ]);
  const c = Object.fromEntries((cfg ?? []).map((x) => [x.key, Number(x.value)]));
  const mine = new Map((prog ?? []).filter((p) => p.user_id === me.id).map((p) => [p.lesson_id, p]));
  const theirs = new Map((prog ?? []).filter((p) => p.user_id === partner?.id).map((p) => [p.lesson_id, p]));
  const passed = [...mine.values()].filter((p) => p.passed_at).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-love-700">📘 Ngữ pháp TOEIC</h1>
        <p className="text-sm text-love-700/70">Từ mất gốc tới 600 điểm · đạt bài (đúng ≥ {Math.round((c.GRAMMAR_PASS_PCT ?? 0.7) * 100)}%) lần đầu +{c.GRAMMAR_PASS_COINS ?? 80} xu · đã đạt {passed}/{lessons?.length ?? 0} bài</p>
      </div>
      {!lessons?.length && <Card>Chưa có bài ngữ pháp — Admin chạy <code>scripts/seed-grammar.ts</code>.</Card>}
      {[1, 2, 3].map((b) => {
        const list = (lessons ?? []).filter((l) => l.band === b);
        if (!list.length) return null;
        return (
          <section key={b} className="space-y-2">
            <h2 className="font-extrabold text-love-700">Chặng {b}: {BANDS[b].name} <span className="text-sm font-bold text-love-700/60">· {BANDS[b].range}</span></h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((l) => {
                const p = mine.get(l.id), q = theirs.get(l.id);
                return (
                  <Link key={l.id} href={`/grammar/${l.code}`} data-testid={`grammar-${l.code}`}>
                    <Card className={`h-full space-y-1 transition hover:shadow-md ${p?.passed_at ? "border-green-300" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{l.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-love-700/60">Bài {l.order_no}</div>
                          <div className="font-extrabold leading-tight">{l.title_vi}</div>
                        </div>
                        {p?.passed_at && <span className="text-lg" title="Đã đạt">✅</span>}
                      </div>
                      <div className="text-xs text-love-700/70">{l.summary_vi}</div>
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                        <span>{p ? `Cao nhất ${p.best_correct}/${p.best_total}` : "Chưa làm"}</span>
                        {partner && q && <span>{partner.display_name || "Người ấy"}: {q.best_correct}/{q.best_total}{q.passed_at ? " ✅" : ""}</span>}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
