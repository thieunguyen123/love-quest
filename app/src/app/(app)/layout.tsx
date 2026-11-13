import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Avatar } from "@/components/ui";
import { NotificationBell } from "@/components/live";
import { MusicController } from "@/components/pwa";
import { signOut } from "../login/actions";

const NAV: [string, string][] = [["/levels", "Màn chơi"], ["/learn", "Học"], ["/words", "Sổ từ"], ["/learn/typing", "Mưa chữ"], ["/base", "Căn cứ"], ["/shop", "Cửa hàng"], ["/rivalry", "Đối đầu"], ["/battles", "Nhật ký"], ["/world", "🌍 3D"]];

// Chế độ nhúng: trang mở trong overlay của thế giới 3D (iframe) → ẩn menu; link về Hub/3D hoặc Esc thì đóng overlay
const EMBED_SCRIPT = `(function(){if(window.self===window.top)return;var d=document.documentElement;d.setAttribute("data-embed","1");
function close(){window.parent.postMessage({lq:"close"},location.origin)}
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a||a.target==="_top")return;var u=new URL(a.href,location.href);if(u.origin===location.origin&&(u.pathname==="/"||u.pathname==="/world")){e.preventDefault();e.stopPropagation();close()}},true);
document.addEventListener("keydown",function(e){if(e.key==="Escape")close()});})();`;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requirePlayer();
  return (
    <div className="min-h-screen">
      <script dangerouslySetInnerHTML={{ __html: EMBED_SCRIPT }} />
      <header className="app-header sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-love-100">
        <div className="mx-auto max-w-5xl flex items-center gap-3 px-4 h-14">
          <Link href="/?view=2d" className="font-extrabold text-love-700 text-lg">💕 Love Quest</Link>
          <nav className="hidden md:flex gap-4 ml-4 text-sm font-bold text-love-700/80">
            {NAV.map(([h, t]) => <Link key={h} href={h} className="hover:text-love-600">{t}</Link>)}
            {me.role === "ADMIN" && <Link href="/admin/levels" className="hover:text-love-600">Admin</Link>}
          </nav>
          <MusicController />
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell userId={me.id} />
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
        <nav className="md:hidden flex gap-4 overflow-x-auto px-4 pb-2 text-sm font-bold text-love-700/80 whitespace-nowrap">
          {NAV.map(([h, t]) => <Link key={h} href={h}>{t}</Link>)}
          {me.role === "ADMIN" && <Link href="/admin/levels">Admin</Link>}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
