"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { BaseSceneProps } from "./base-scene";

const BaseScene = dynamic(() => import("./base-scene"), { ssr: false, loading: () => <p className="py-24 text-center font-bold text-love-700">Đang dựng căn cứ 3D…</p> });

/** Khung căn cứ 3D; không có WebGL thì hiện `fallback` (giao diện thẻ 2D) — W3D-04 */
export function BaseView({ fallback, className = "h-[72vh] min-h-[420px]", ...p }: BaseSceneProps & { fallback?: React.ReactNode; className?: string }) {
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => { try { const c = document.createElement("canvas"); setGl(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setGl(false); } }, []);
  if (gl === false) return <>{fallback}</>;
  return <div className={`overflow-hidden rounded-3xl border-4 border-white shadow-xl ${className}`}>{gl ? <BaseScene {...p} /> : null}</div>;
}
