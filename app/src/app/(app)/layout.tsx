import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Avatar } from "@/components/ui";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requirePlayer();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-love-100">
        <div className="mx-auto max-w-5xl flex items-center gap-3 px-4 h-14">
          <Link href="/" className="font-extrabold text-love-700 text-lg">💕 Love Quest</Link>
          <nav className="hidden sm:flex gap-4 ml-4 text-sm font-bold text-love-700/80">
            <Link href="/learn" className="hover:text-love-600">Học</Link>
            {me.role === "ADMIN" && <Link href="/admin/levels" className="hover:text-love-600">Admin</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span title="Số xu" className="rounded-full bg-amber-100 text-amber-800 font-extrabold text-sm px-3 py-1">🪙 {me.coins.toLocaleString("vi-VN")}</span>
            <details className="relative">
              <summary className="list-none cursor-pointer"><Avatar url={me.avatar_url} name={me.display_name} color={me.favorite_color} size={36} /></summary>
              <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl border border-love-100 shadow-lg p-2 text-sm font-semibold">
                <Link className="block rounded-lg px-3 py-2 hover:bg-love-50" href={`/profile/${me.id}`}>Hồ sơ</Link>
                <Link className="block rounded-lg px-3 py-2 hover:bg-love-50" href="/settings">Cài đặt</Link>
                <form action={signOut}><button className="w-full text-left rounded-lg px-3 py-2 hover:bg-love-50">Đăng xuất</button></form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
