"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { BaseSceneProps } from "./base-scene";

const BaseScene = dynamic(() => import("./base-scene"), { ssr: false, loading: () => <p className="py-24 text-center font-bold text-love-700">Đang dựng căn cứ 3D…</p> });

/** Khung căn cứ 3D; không có WebGL thì hiện `fallback` (giao diện thẻ 2D) — W3D-04 */
export function BaseView({ fallback, className = "h-[72vh] min-h-[420px]", fillMobile = false, ...p }: BaseSceneProps & { fallback?: React.ReactNode; className?: string; fillMobile?: boolean }) {
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => { try { const c = document.createElement("canvas"); setGl(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setGl(false); } }, []);
  // fillMobile: trên điện thoại khung 3D cao vừa khít phần còn lại của màn hình (đo thật, không đoán chiều cao thanh trên)
  // → trang đúng bằng 1 màn hình: không phải cuộn, không thừa khoảng trắng phía dưới
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    if (!fillMobile || !gl) return;
    const fit = () => {
      const el = box.current;
      if (!el || !window.matchMedia("(max-width: 767px)").matches) { setH(null); return; }
      const r = el.getBoundingClientRect(), top = r.top + window.scrollY;
      // phần trang nằm dưới khung = lề dưới của khung + lề dưới của <main> (layout có min-h-screen nên không dùng scrollHeight được)
      const main = el.closest("main");
      const after = main ? Math.max(0, main.getBoundingClientRect().bottom - r.bottom) : 16;
      setH(Math.max(320, Math.floor(window.innerHeight - top - after)));
    };
    fit();
    const t = setTimeout(fit, 300);   // sau khi font / thanh trên ổn định
    window.addEventListener("resize", fit); window.visualViewport?.addEventListener("resize", fit);
    return () => { clearTimeout(t); window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
  }, [fillMobile, gl]);
  if (gl === false) return <>{fallback}</>;
  return <div ref={box} data-testid="base-view" style={h ? { height: h } : undefined} className={`relative overflow-hidden rounded-3xl border-4 border-white shadow-xl ${className}`}>{gl ? <BaseScene {...p} /> : null}</div>;
}
