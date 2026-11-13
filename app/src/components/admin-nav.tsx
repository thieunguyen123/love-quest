import Link from "next/link";
export function AdminNav({ active }: { active: "levels" | "config" }) {
  return (
    <div className="flex gap-2">{[["levels", "/admin/levels", "Màn & từ vựng"], ["config", "/admin/config", "Cấu hình & nhật ký"]].map(([k, h, t]) => (
      <Link key={k} href={h} className={`rounded-full px-4 py-1.5 font-bold text-sm border ${active === k ? "bg-love-500 text-white border-love-500" : "bg-white border-love-200 text-love-700"}`}>{t}</Link>
    ))}</div>
  );
}
