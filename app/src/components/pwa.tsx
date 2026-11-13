"use client";
import { useEffect } from "react";
import { musicEnabled, startMusic } from "@/lib/sfx";

export function PwaRegister() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => { /* bỏ qua: http không phải localhost */ }); }, []);
  return null;
}

// Nhạc nền (nếu bật trong Cài đặt): chỉ phát sau tương tác đầu tiên (trình duyệt chặn autoplay)
export function MusicController() {
  useEffect(() => {
    const go = () => { if (musicEnabled()) startMusic(); };
    window.addEventListener("pointerdown", go, { once: true }); window.addEventListener("keydown", go, { once: true });
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  }, []);
  return null;
}
