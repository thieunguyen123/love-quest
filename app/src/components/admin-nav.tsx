"use client";
// Menu Admin (ADM-01): cột trái trên máy tính, dải nút cuộn ngang trên điện thoại; tự đánh dấu mục đang mở.
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_LINKS } from "./admin-links";


export function AdminNav() {
  const path = usePathname();
  const isActive = (h: string) => (h === "/admin" ? path === "/admin" : path.startsWith(h));
  return (
    <nav aria-label="Menu admin" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <div className="flex gap-2 md:flex-col md:gap-1">
        {ADMIN_LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined} data-testid={`admin-nav-${l.href.split("/")[2] ?? "home"}`}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition md:rounded-xl md:whitespace-normal md:px-3 md:py-2.5
              ${isActive(l.href) ? "border-love-500 bg-love-500 text-white shadow" : "border-love-200 bg-white text-love-700 hover:bg-love-50"} ${l.href === "/admin/season" && !isActive(l.href) ? "!text-red-600" : ""}`}>
            <span className="text-lg leading-none">{l.icon}</span>
            <span className="md:flex md:flex-col"><span>{l.label}</span><span className={`hidden text-[11px] font-semibold md:block ${isActive(l.href) ? "text-white/80" : "text-love-700/50"}`}>{l.hint}</span></span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
