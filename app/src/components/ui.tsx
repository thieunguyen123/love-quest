import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white/90 rounded-2xl border border-love-100 shadow-sm shadow-love-100 p-5 ${className}`}>{children}</div>;
}

const btn = "inline-flex items-center justify-center gap-2 rounded-xl font-bold px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed";
export const btnPrimary = `${btn} bg-love-500 hover:bg-love-600 text-white`;
export const btnGhost = `${btn} bg-love-50 hover:bg-love-100 text-love-700 border border-love-200`;

export function ButtonLink({ href, children, ghost }: { href: string; children: ReactNode; ghost?: boolean }) {
  return <Link href={href} className={ghost ? btnGhost : btnPrimary}>{children}</Link>;
}

export function Avatar({ url, name, color, size = 40 }: { url?: string | null; name: string; color: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt={name} width={size} height={size} className="rounded-full object-cover border-2" style={{ width: size, height: size, borderColor: color }} />;
  return (
    <span className="rounded-full grid place-items-center font-extrabold text-white border-2 border-white shadow"
      style={{ width: size, height: size, background: color, fontSize: size * 0.45 }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export const inputCls = "w-full rounded-xl border border-love-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-love-400";
