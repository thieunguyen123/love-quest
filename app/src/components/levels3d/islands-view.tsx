"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { IslandLevel } from "./islands";

const Islands = dynamic(() => import("./islands"), { ssr: false, loading: () => <p className="py-24 text-center font-bold text-love-700">Đang dựng quần đảo 3D…</p> });

/** Khung bản đồ quần đảo; không có WebGL thì không hiện gì (trang vẫn có danh sách 2D bên dưới) — W3D-04 */
export function IslandsView({ levels }: { levels: IslandLevel[] }) {
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => { try { const c = document.createElement("canvas"); setGl(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setGl(false); } }, []);
  if (gl === false) return null;
  return <div className="h-[68vh] min-h-[420px] overflow-hidden rounded-3xl border-4 border-white shadow-xl">{gl ? <Islands levels={levels} /> : null}</div>;
}
