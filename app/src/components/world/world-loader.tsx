"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import type { WorldProps } from "./world3d";

const World3D = dynamic(() => import("./world3d"), { ssr: false, loading: () => <p className="py-20 text-center font-bold text-love-700">Đang dựng thế giới…</p> });

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// W3D-04: không có WebGL → tự chuyển giao diện đơn giản; nút chuyển 2D/3D ghi nhớ lựa chọn.
// Thế giới chiếm toàn bộ màn hình bên dưới thanh menu.
export function WorldLoader(props: WorldProps) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [top, setTop] = useState(56);
  useEffect(() => {
    if (window.self !== window.top) { window.parent.postMessage({ lq: "close" }, location.origin); return; }   // không lồng thế giới trong overlay
    const gl = hasWebGL(); setOk(gl);
    try { localStorage.setItem("view", gl ? "3d" : "2d"); } catch { /* ignore */ }
  }, []);
  useLayoutEffect(() => {
    const h = document.querySelector(".app-header");
    const upd = () => setTop(h ? Math.round(h.getBoundingClientRect().bottom) : 0);
    upd(); window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 bg-sky-200" style={{ top }}>
      <h1 className="sr-only">Làng Tình Yêu</h1>
      {ok === false ? (
        <div className="m-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center space-y-2">
          <p className="font-bold">Thiết bị của bạn không hỗ trợ WebGL nên không dựng được thế giới 3D.</p>
          <Link href="/?view=2d" className="font-extrabold underline text-love-700">Dùng giao diện đơn giản →</Link>
        </div>
      ) : ok === true ? <World3D {...props} /> : <p className="py-20 text-center">Đang kiểm tra thiết bị…</p>}
    </div>
  );
}
