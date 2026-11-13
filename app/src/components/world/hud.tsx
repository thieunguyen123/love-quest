"use client";
import { useEffect, useRef, useState } from "react";
import { MY_HOUSE, PARTNER_HOUSE, WORLD_HALF, ZONES } from "./data";
import type { CarPose } from "./car";

// Joystick ảo cho điện thoại (W3D-01): kéo núm → x (phải +), y (tiến +) trong [-1, 1]
export function Joystick({ value }: { value: React.RefObject<{ x: number; y: number }> }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 48;
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy); if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy });
    value.current = { x: dx / R, y: -dy / R };
  };
  const end = () => { setKnob({ x: 0, y: 0 }); value.current = { x: 0, y: 0 }; };
  return (
    <div ref={base} aria-label="Cần điều khiển" className="relative h-32 w-32 rounded-full border-4 border-white/70 bg-white/30 backdrop-blur touch-none select-none"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") move(e); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-pink-500 shadow-lg border-4 border-white"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}

// Bản đồ nhỏ: khu, 2 nhà, xe mình (mũi tên) và xe người ấy; bấm vào khu để mở nhanh
export function Minimap({ pose, partner, meColor, partnerColor, onOpen }: {
  pose: React.RefObject<CarPose>; partner: React.RefObject<{ x: number; z: number; t: number } | null>;
  meColor: string; partnerColor: string; onOpen: (href: string, name: string) => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 120); return () => clearInterval(iv); }, []);
  const S = 128, k = S / (WORLD_HALF * 2);
  const P = (x: number, z: number) => ({ left: (x + WORLD_HALF) * k, top: (z + WORLD_HALF) * k });
  const me = pose.current, pt = partner.current;
  const ptOn = pt && Date.now() - pt.t < 5000;
  return (
    <div className="relative rounded-2xl border-2 border-white/80 bg-emerald-300/80 shadow-lg backdrop-blur" style={{ width: S, height: S }}>
      <div className="absolute bg-amber-100/80" style={{ left: S / 2 - 3, top: 0, width: 6, height: S }} />
      <div className="absolute bg-amber-100/80" style={{ top: P(0, 8).top - 3, left: 0, height: 6, width: S }} />
      {ZONES.map((z) => (
        <button key={z.id} title={z.name} onClick={() => onOpen(z.href, z.name)} className="absolute -translate-x-1/2 -translate-y-1/2 text-sm leading-none hover:scale-125 transition" style={P(z.x, z.z)}>{z.emoji}</button>
      ))}
      <button title="Nhà của tôi" onClick={() => onOpen("/base", "Nhà của tôi")} className="absolute -translate-x-1/2 -translate-y-1/2 text-sm leading-none hover:scale-125" style={P(MY_HOUSE.x, MY_HOUSE.z)}>🏠</button>
      <button title="Nhà người ấy" onClick={() => onOpen("/base/partner", "Nhà người ấy")} className="absolute -translate-x-1/2 -translate-y-1/2 text-sm leading-none hover:scale-125" style={P(PARTNER_HOUSE.x, PARTNER_HOUSE.z)}>🏡</button>
      {ptOn && <div className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ ...P(pt.x, pt.z), background: partnerColor }} />}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ ...P(me.x, me.z), transform: `translate(-50%,-50%) rotate(${Math.PI - me.h}rad)` }}>
        <div className="h-0 w-0 border-x-[6px] border-x-transparent border-b-[12px]" style={{ borderBottomColor: meColor, filter: "drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)" }} />
      </div>
    </div>
  );
}

// UI 2D mở dạng overlay trên nền 3D (W3D-02). Trang con chạy trong iframe ở "chế độ nhúng" (ẩn thanh menu)
export function Overlay({ href, name, onClose }: { href: string; name: string; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.lq === "close") onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("message", onMsg); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("message", onMsg); window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-20 flex items-stretch justify-center bg-black/30 p-2 sm:p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border-4 border-white bg-[var(--background,#fff7fb)] shadow-2xl animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-pink-100 bg-white/90 px-4 py-2">
          <span className="font-extrabold text-pink-700">{name}</span>
          {loading && <span className="text-xs text-pink-400">đang mở…</span>}
          <a href={href} target="_top" className="ml-auto rounded-lg px-2 py-1 text-xs font-bold text-pink-600 hover:bg-pink-50">Mở toàn trang ↗</a>
          <button onClick={onClose} className="rounded-xl bg-pink-500 px-3 py-1.5 text-sm font-extrabold text-white">✕ Về làng (Esc)</button>
        </div>
        <iframe ref={frame} src={href} title={name} className="h-full w-full flex-1 bg-transparent" onLoad={() => { setLoading(false); frame.current?.contentWindow?.focus(); }} />
      </div>
    </div>
  );
}
