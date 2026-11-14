"use client";
// SYS-05: khung Canvas dùng chung cho mọi cảnh 3D — chọn mức đồ hoạ theo máy, tự hạ độ phân giải khi FPS tụt, đo FPS.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree, type CanvasProps } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cutify } from "./models";

export type Tier = "high" | "low";
export type GfxSetting = "auto" | "high" | "low";
export type Quality = {
  tier: Tier; setting: GfxSetting; showFps: boolean;
  shadows: boolean; maxDpr: number; squadCap: number;   // squadCap: số nhân vật có xương tối đa vẽ cho 1 đội
  lights: boolean;                                       // đèn điểm trang trí (đắt trên điện thoại)
  decor: number;                                         // 0..1: tỉ lệ vật trang trí cảnh nền được vẽ
};

const KEY_GFX = "gfx", KEY_FPS = "show_fps";
const listeners = new Set<() => void>();
let cache: Quality | null = null;

function detectTier(): Tier {
  if (typeof window === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  if (coarse || small) return "low";
  if ((nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4) return "low";
  return "high";
}
function read(): Quality {
  let setting: GfxSetting = "auto", showFps = false;
  try { const s = localStorage.getItem(KEY_GFX); if (s === "high" || s === "low") setting = s; showFps = localStorage.getItem(KEY_FPS) === "1"; } catch { /* ignore */ }
  try { const p = new URLSearchParams(location.search); const g = p.get("gfx"); if (g === "high" || g === "low") setting = g; if (p.get("fps") === "1") showFps = true; } catch { /* ignore */ }
  const tier = setting === "auto" ? detectTier() : setting;
  return tier === "high"
    ? { tier, setting, showFps, shadows: true, maxDpr: 1.75, squadCap: 4, lights: true, decor: 1 }
    : { tier, setting, showFps, shadows: false, maxDpr: 1.5, squadCap: 1, lights: false, decor: 0.5 };
}
const SERVER: Quality = { tier: "high", setting: "auto", showFps: false, shadows: true, maxDpr: 1.75, squadCap: 4, lights: true, decor: 1 };
const snapshot = () => (cache ??= read());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => { cache = null; listeners.forEach((f) => f()); };

export function useQuality(): Quality { return useSyncExternalStore(subscribe, snapshot, () => SERVER); }
export function setGfx(v: GfxSetting) { try { if (v === "auto") localStorage.removeItem(KEY_GFX); else localStorage.setItem(KEY_GFX, v); } catch { /* ignore */ } emit(); }
export function setShowFps(v: boolean) { try { localStorage.setItem(KEY_FPS, v ? "1" : "0"); } catch { /* ignore */ } emit(); }

type Perf = { fps: number; calls: number; tris: number; dpr: number; tier: Tier };
/** Đo FPS + tự chỉnh độ phân giải: tụt dưới 50 FPS 2 giây liền → giảm dpr; ổn định ≥ 58 FPS → tăng lại (không vượt mức từng làm tụt) */
function PerfProbe({ q, setDpr, dpr, badge }: { q: Quality; dpr: number; setDpr: (d: number) => void; badge: React.RefObject<HTMLDivElement | null> }) {
  const gl = useThree((s) => s.gl);
  const st = useRef({ frames: 0, t: 0, low: 0, high: 0, ceil: q.maxDpr, warm: 2 });
  useFrame((_, dt) => {
    const s = st.current;
    s.frames++; s.t += dt;
    if (s.t < 1) return;
    const fps = Math.round(s.frames / s.t);
    s.frames = 0; s.t = 0;
    const perf: Perf = { fps, calls: gl.info.render.calls, tris: gl.info.render.triangles, dpr, tier: q.tier };
    (window as unknown as { __perf: Perf }).__perf = perf;
    if (badge.current) badge.current.textContent = `${fps} FPS`;   // chi tiết (lần vẽ, tam giác, dpr) vẫn ở window.__perf
    if (s.warm > 0) { s.warm--; return; }          // bỏ vài giây đầu (đang tải mô hình, biên dịch shader)
    if (document.hidden) return;
    if (fps < 50) { s.low++; s.high = 0; } else if (fps >= 58) { s.high++; s.low = 0; } else { s.low = 0; s.high = 0; }
    if (s.low >= 2 && dpr > 0.75) { s.low = 0; s.ceil = Math.max(0.75, dpr - 0.25); setDpr(s.ceil); }
    else if (s.high >= 6 && dpr + 0.25 <= s.ceil) { s.high = 0; setDpr(dpr + 0.25); }
  });
  return null;
}

/** Canvas của game: thay cho <Canvas> của r3f. `paused` = dừng hẳn vòng render (khi có overlay che) */
export function GameCanvas({ children, paused = false, shadows = true, ...rest }: Omit<CanvasProps, "dpr" | "frameloop" | "shadows"> & { paused?: boolean; shadows?: boolean }) {
  const q = useQuality();
  const native = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const [dpr, setDpr] = useState(() => Math.min(native, q.maxDpr));
  useEffect(() => { setDpr(Math.min(native, q.maxDpr)); }, [q.maxDpr, native]);
  const badge = useRef<HTMLDivElement>(null);
  return (
    <>
      <Canvas {...rest} shadows={shadows && q.shadows} dpr={dpr} frameloop={paused ? "never" : "always"}
        // Neutral tone mapping: giữ màu tươi (ACES mặc định làm nhạt màu và ngả vàng)
        gl={{ antialias: q.tier === "high", powerPreference: "high-performance", stencil: false, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.05, ...(rest.gl as object) }}>
        <PerfProbe q={q} dpr={dpr} setDpr={setDpr} badge={badge} />
        {children}
      </Canvas>
      {/* góc dưới trái, nằm DƯỚI mọi nút / bảng của cảnh (z thấp) → không bao giờ đè lên thao tác */}
      {q.showFps && <div ref={badge} data-testid="fps" className="pointer-events-none absolute bottom-2 left-2 z-[5] whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] font-bold text-lime-300">… FPS</div>}
    </>
  );
}

// ---------- nhãn chữ dạng sprite (1 lần vẽ, không tạo phần tử DOM chạy theo camera) ----------
function drawBadge(ctx: CanvasRenderingContext2D, text: string, bg: string, fg: string) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.font = `800 ${h * 0.56}px Nunito, system-ui, sans-serif`;
  const tw = Math.min(w - h * 0.3, ctx.measureText(text).width + h * 0.6);
  const x = (w - tw) / 2, r = h * 0.42;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x, h * 0.08, tw, h * 0.84, r); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, w / 2, h * 0.53, w - h * 0.5);
}
/** Nhãn chữ luôn quay về camera. `h` = chiều cao (mét); đổi `text` chỉ vẽ lại canvas */
export function Badge({ text, position, h = 0.9, bg = "rgba(255,255,255,0.92)", fg = "#1f2937", wide = 4 }: { text: string; position?: [number, number, number]; h?: number; bg?: string; fg?: string; wide?: number }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 64 * wide; c.height = 64;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [wide]);
  useEffect(() => { drawBadge((tex.image as HTMLCanvasElement).getContext("2d")!, text, bg, fg); tex.needsUpdate = true; }, [tex, text, bg, fg]);
  useEffect(() => () => tex.dispose(), [tex]);
  return <sprite position={position} scale={[h * wide, h, 1]} renderOrder={10}><spriteMaterial map={tex} depthTest={false} transparent /></sprite>;
}

// ---------- gộp nhiều bản sao của 1 mô hình thành vài lần vẽ (instancing) ----------
export type Inst = { x: number; y?: number; z: number; rot?: number; s: number; tint?: string };
/** Vẽ `items` bản sao của mô hình `name`; `s` = cạnh ngang lớn nhất (mét) như Model.size, hoặc chiều cao nếu fit="height". Mỗi mesh con của mô hình = 1 InstancedMesh */
export function InstancedModel({ name, items, shadows = true, fit = "size" }: { name: string; items: Inst[]; shadows?: boolean; fit?: "size" | "height" }) {
  const { scene } = useGLTF(`/models/${name}.glb`);
  cutify(scene);
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const w = (fit === "height" ? box.max.y - box.min.y : Math.max(box.max.x - box.min.x, box.max.z - box.min.z)) || 1;
    const fitM = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const out: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; m: THREE.Matrix4 }[] = [];
    scene.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) out.push({ geo: me.geometry, mat: me.material, m: new THREE.Matrix4().multiplyMatrices(fitM, me.matrixWorld) }); });
    return { out, w };
  }, [scene, fit]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  useEffect(() => {
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
    parts.out.forEach((p, k) => {
      const im = refs.current[k]; if (!im) return;
      items.forEach((it, i) => {
        const sc = it.s / parts.w;
        M.compose(P.set(it.x, it.y ?? 0, it.z), Q.setFromAxisAngle(Y, it.rot ?? 0), S.set(sc, sc, sc)).multiply(p.m);
        im.setMatrixAt(i, M);
        if (it.tint) im.setColorAt(i, C.set(it.tint)); else if (im.instanceColor) im.setColorAt(i, C.set("#ffffff"));
      });
      im.count = items.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    });
  }, [parts, items]);
  return <>{parts.out.map((p, k) => <instancedMesh key={`${k}-${items.length}`} ref={(r) => { refs.current[k] = r; }} args={[p.geo, p.mat as THREE.Material, Math.max(1, items.length)]} castShadow={shadows} receiveShadow={shadows} />)}</>;
}
