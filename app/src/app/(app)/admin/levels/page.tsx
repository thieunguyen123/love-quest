import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Card } from "@/components/ui";

export default async function AdminLevels() {
  const { supabase } = await requireAdmin();
  const [{ data: levels }, { data: words }] = await Promise.all([
    supabase.from("levels").select("*").order("order_no"),
    supabase.from("words").select("level_id"),
  ]);
  const count = new Map<string, number>();
  words?.forEach((w) => count.set(w.level_id, (count.get(w.level_id) ?? 0) + 1));
  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold text-love-700">🗺️ Màn & từ vựng</h1>
        <p className="text-sm text-love-700/70">Bấm <b>Sửa</b> để đổi chủ đề, số câu, thời gian, thêm từ hoặc nhập từ CSV. Ô đỏ/vàng = màn còn thiếu từ.</p>
      </div>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-love-50 text-left"><tr>{["Màn", "Chủ đề", "CEFR", "Từ (có/cần)", "Câu", "Giây", "Thưởng", "Trạng thái", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {levels?.map((l) => {
              const n = count.get(l.id) ?? 0;
              return (
                <tr key={l.id} className="border-t border-love-100">
                  <td className="px-3 py-2 font-bold">{l.order_no}</td>
                  <td className="px-3 py-2">{l.topic_vi}<div className="text-xs text-love-700/60">{l.topic_en}</div></td>
                  <td className="px-3 py-2">{l.cefr}</td>
                  <td className={`px-3 py-2 font-bold ${n >= l.word_count ? "text-green-700" : "text-amber-700"}`}>{n}/{l.word_count}</td>
                  <td className="px-3 py-2">{l.question_count}</td>
                  <td className="px-3 py-2">{l.seconds_per_question}</td>
                  <td className="px-3 py-2">×{l.reward_multiplier}</td>
                  <td className="px-3 py-2">{l.status}</td>
                  <td className="px-3 py-2"><Link className="font-bold text-love-600 underline" href={`/admin/levels/${l.order_no}`}>Sửa</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
