import { requireAdmin } from "@/lib/session";
import { Card } from "@/components/ui";
import { AdminNav } from "@/components/admin-nav";
import ConfigEditor from "./editor";

export default async function AdminConfigPage() {
  const { supabase } = await requireAdmin();
  const [{ data: cfg }, { data: logs }, { data: admins }] = await Promise.all([
    supabase.from("game_config").select("*").order("key"),
    supabase.from("admin_logs").select("*").order("created_at", { ascending: false }).limit(40),
    supabase.from("profiles").select("id,display_name"),
  ]);
  const who = new Map((admins ?? []).map((a) => [a.id, a.display_name]));
  return (
    <div className="space-y-4">
      <AdminNav active="config" />
      <h1 className="text-2xl font-extrabold text-love-700">Admin – Cấu hình game</h1>
      <p className="text-sm">Thay đổi áp dụng cho hành động <b>mới</b>; không tính lại kết quả cũ. Giữ nguyên kiểu dữ liệu (số / chữ / true-false).</p>
      <ConfigEditor rows={(cfg ?? []).map((c) => ({ key: c.key, value: JSON.stringify(c.value), unit: c.unit ?? "", description: c.description ?? "" }))} />
      <Card className="space-y-2">
        <h2 className="font-extrabold text-love-700">Nhật ký admin</h2>
        {(logs ?? []).length === 0 && <p className="text-sm">Chưa có thao tác nào.</p>}
        <ul className="text-sm divide-y divide-love-100">{logs?.map((l) => (
          <li key={l.id} className="py-1.5"><b>{l.action}</b> {l.entity} {l.entity_id} <span className="text-love-700/60">· {who.get(l.admin_id) ?? "?"} · {new Date(l.created_at).toLocaleString("vi-VN")}</span>{l.diff && <div className="font-mono text-xs text-love-700/70 break-all">{JSON.stringify(l.diff).slice(0, 200)}</div>}</li>
        ))}</ul>
      </Card>
    </div>
  );
}
