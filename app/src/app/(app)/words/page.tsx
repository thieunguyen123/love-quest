import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Card } from "@/components/ui";
import { SpeakButton } from "./speak";

const TABS = [["all", "Tất cả"], ["NEW", "Mới"], ["LEARNING", "Đang học"], ["MASTERED", "Đã thuộc"], ["hard", "Hay sai"]] as const;
const LABEL: Record<string, string> = { NEW: "Mới", LEARNING: "Đang học", MASTERED: "Đã thuộc" };

export default async function WordsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s = "all" } = await searchParams;
  const { supabase, me } = await requirePlayer();
  const [{ data: words }, { data: prog }, { data: levels }] = await Promise.all([
    supabase.from("words").select("id,level_id,word,ipa,meanings_vi").order("word"),
    supabase.from("word_progress").select("*").eq("user_id", me.id),
    supabase.from("levels").select("id,order_no"),
  ]);
  const pm = new Map((prog ?? []).map((p) => [p.word_id, p]));
  const lv = new Map((levels ?? []).map((l) => [l.id, l.order_no]));
  const rows = (words ?? []).map((w) => ({ ...w, status: (pm.get(w.id)?.status ?? "NEW") as string, ok: pm.get(w.id)?.correct_count ?? 0, bad: pm.get(w.id)?.wrong_count ?? 0 }))
    .filter((r) => (s === "all" ? true : s === "hard" ? r.bad >= 2 && r.bad > r.ok : r.status === s));
  const count = (st: string) => (words ?? []).filter((w) => (pm.get(w.id)?.status ?? "NEW") === st).length;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-extrabold text-love-700">📒 Sổ từ vựng</h1>
      <div className="flex gap-3 text-sm font-semibold"><span>Mới {count("NEW")}</span><span>Đang học {count("LEARNING")}</span><span>Đã thuộc {count("MASTERED")}</span></div>
      <div className="flex flex-wrap gap-2">{TABS.map(([k, t]) => <Link key={k} href={`/words?s=${k}`} className={`rounded-full px-4 py-1.5 font-bold text-sm border ${s === k ? "bg-love-500 text-white border-love-500" : "bg-white border-love-200 text-love-700"}`}>{t}</Link>)}</div>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-love-50 text-left"><tr><th className="px-3 py-2">Từ</th><th className="px-3 py-2">Nghĩa</th><th className="px-3 py-2">Màn</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Đúng / Sai</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-love-100">
                <td className="px-3 py-2 font-bold">{r.word} <SpeakButton text={r.word} /><div className="text-xs font-normal text-love-600">{r.ipa}</div></td>
                <td className="px-3 py-2">{r.meanings_vi.join(", ")}</td><td className="px-3 py-2">{lv.get(r.level_id)}</td>
                <td className="px-3 py-2">{LABEL[r.status]}</td><td className="px-3 py-2">{r.ok} / <span className={r.bad > r.ok ? "text-red-600 font-bold" : ""}>{r.bad}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center">Không có từ nào.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
