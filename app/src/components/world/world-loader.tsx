"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { WorldProps } from "./world3d";

const World3D = dynamic(() => import("./world3d"), { ssr: false, loading: () => <p className="py-20 text-center font-bold text-love-700">Đang dựng thế giới…</p> });

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// W3D-04: không có WebGL → tự chuyển giao diện đơn giản; nút chuyển 2D/3D ghi nhớ lựa chọn
export function WorldLoader(props: WorldProps) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { setOk(hasWebGL()); try { localStorage.setItem("view", "3d"); } catch { /* ignore */ } }, []);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-love-700">🌍 Làng Tình Yêu</h1>
        <Link href="/?view=2d" onClick={() => { try { localStorage.setItem("view", "2d"); } catch { /* ignore */ } }} className="rounded-xl border border-love-200 bg-love-50 px-3 py-1.5 text-sm font-bold text-love-700">Giao diện đơn giản (2D)</Link>
      </div>
      {ok === false ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center space-y-2">
          <p className="font-bold">Thiết bị của bạn không hỗ trợ WebGL nên không dựng được thế giới 3D.</p>
          <Link href="/" className="font-extrabold underline text-love-700">Dùng giao diện đơn giản →</Link>
        </div>
      ) : ok === true ? <World3D {...props} /> : <p className="py-20 text-center">Đang kiểm tra thiết bị…</p>}
    </div>
  );
}
