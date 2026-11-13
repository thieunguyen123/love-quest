"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// S03 Phase 7: Hub mặc định là thế giới 3D. Nhớ lựa chọn 2D/3D (W3D-04): đã chọn 2D, hoặc mở Hub với ?view=2d, thì ở lại dashboard 2D
export function HubViewRedirect() {
  const router = useRouter(); const sp = useSearchParams();
  useEffect(() => {
    if (window.self !== window.top) return;
    try {
      if (sp.get("view") === "2d") { localStorage.setItem("view", "2d"); return; }
      if (localStorage.getItem("view") !== "2d") router.replace("/world");
    } catch { /* ignore */ }
  }, [router, sp]);
  return null;
}
