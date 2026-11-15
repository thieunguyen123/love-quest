import { requireAdmin } from "@/lib/session";
import ConfigEditor from "./editor";

export default async function AdminConfigPage() {
  const { supabase } = await requireAdmin();
  const { data: cfg } = await supabase.from("game_config").select("*").order("key");
  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold text-love-700">⚙️ Cấu hình game</h1>
        <p className="text-sm text-love-700/70">Chạm vào một nhóm để mở. Đổi xong bấm <b>Lưu</b> ở dòng đó. Thay đổi áp dụng cho hành động <b>mới</b>, không tính lại kết quả cũ.</p>
      </div>
      <ConfigEditor rows={(cfg ?? []).map((c) => ({ key: c.key, value: typeof c.value === "string" ? c.value : JSON.stringify(c.value), unit: c.unit ?? "", description: c.description ?? "" }))} />
    </>
  );
}
