"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Nhớ lựa chọn 2D/3D: nếu lần trước chọn 3D thì vào thẳng /world (trừ khi mở Hub với ?view=2d)
export function HubViewRedirect() {
  const router = useRouter(); const sp = useSearchParams();
  useEffect(() => { try { if (localStorage.getItem("view") === "3d" && sp.get("view") !== "2d") router.replace("/world"); } catch { /* ignore */ } }, [router, sp]);
  return null;
}
