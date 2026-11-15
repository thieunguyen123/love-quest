// Danh sách mục menu Admin (dùng chung cho menu client và trang tổng quan server — không để trong file "use client")
export const ADMIN_LINKS: { href: string; icon: string; label: string; hint: string }[] = [
  { href: "/admin", icon: "📊", label: "Tổng quan", hint: "Người chơi, màn đang mở, việc cần làm" },
  { href: "/admin/levels", icon: "🗺️", label: "Màn & từ vựng", hint: "Sửa màn, thêm/nhập từ CSV" },
  { href: "/admin/config", icon: "⚙️", label: "Cấu hình game", hint: "Giá, thưởng, tốc độ, luật" },
  { href: "/admin/logs", icon: "📜", label: "Nhật ký", hint: "Ai đã đổi gì, lúc nào" },
  { href: "/admin/season", icon: "⚠️", label: "Reset mùa", hint: "Xoá tiến trình, chơi lại từ đầu" },
];
