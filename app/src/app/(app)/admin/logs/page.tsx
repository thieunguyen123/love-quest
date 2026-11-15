// ADM: nhật ký thao tác admin
import { requireAdmin } from "@/lib/session";
import { Card } from "@/components/ui";

const ACTION_VI: Record<string, string> = { LEVEL_UPDATE: "Sửa màn", WORD_CREATE: "Thêm từ", WORD_UPDATE: "Sửa từ", WORD_DELETE: "Xoá từ", WORDS_IMPORT: "Nhập từ CSV", CONFIG_SET: "Đổi cấu hình", SEASON_RESET: "Reset mùa" };

export default async function AdminLogsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: logs }, { data: people }] = await Promise.all([
    supabase.from("admin_logs").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id,display_name"),
  ]);
  const who = new Map((people ?? []).map((a) => [a.id, a.display_name]));
  return (
    <>
      <h1 className="text-2xl font-extrabold text-love-700">📜 Nhật ký admin</h1>
      <Card className="!p-0">
        {(logs ?? []).length === 0 ? <p className="p-4 text-sm">Chưa có thao tác nào.</p> : (
          <ul className="divide-y divide-love-100 text-sm">{logs!.map((l) => (
            <li key={l.id} className="px-4 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2"><b>{ACTION_VI[l.action] ?? l.action}</b><span>{l.entity} {l.entity_id}</span><span className="ml-auto text-xs text-love-700/60">{who.get(l.admin_id) ?? "?"} · {new Date(l.created_at).toLocaleString("vi-VN")}</span></div>
              {l.diff && <div className="break-all font-mono text-xs text-love-700/70">{JSON.stringify(l.diff).slice(0, 240)}</div>}
            </li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}
