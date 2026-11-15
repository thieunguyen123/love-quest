// Khung chung khu Admin: kiểm tra quyền 1 lần + menu bên trái (máy tính) / dải nút trên cùng (điện thoại)
import { requireAdmin } from "@/lib/session";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-4 md:grid md:grid-cols-[220px_1fr] md:items-start md:gap-6 md:space-y-0">
      <aside className="space-y-2 md:sticky md:top-20">
        <div className="hidden text-xs font-extrabold uppercase tracking-wide text-love-700/50 md:block">🛠️ Quản trị</div>
        <AdminNav />
      </aside>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}
