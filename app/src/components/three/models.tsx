"use client";
// Mô hình 3D dùng chung (W3D-05). Mô hình KayKit CC0 ở public/models (dựng bằng scripts/build-models.mts).
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Clone, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export const modelUrl = (name: string) => `/models/${name}.glb`;
export const preloadModels = (names: string[]) => { if (typeof window !== "undefined") names.forEach((n) => useGLTF.preload(modelUrl(n))); };

/** Màu yêu thích (hex) → 1 trong 4 bộ màu của KayKit (hồng/tím → đỏ) */
export function colorVariant(hex: string): "blue" | "red" | "green" | "yellow" {
  const c = new THREE.Color(hex); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
  const h = hsl.h * 360;
  if (hsl.s < 0.15) return "blue";
  if (h < 20 || h >= 280) return "red";
  if (h < 75) return "yellow";
  if (h < 170) return "green";
  return "blue";
}

// ---------- Bảng màu "cute": tươi, sáng, ấm (áp lên vật liệu có tên của Quaternius) ----------
// Áp 1 lần cho mỗi mô hình đã tải (sửa thẳng vật liệu trong cache) → không tốn thêm lần vẽ.
export const CUTE: Record<string, string> = {
  Stone: "#cfc6b6", Stone_Light: "#f1ead9", Walls: "#fff4e2", Wood: "#bf7a40", Wood_Light: "#eab06a", Main: "#f05a5a",
  Green: "#6ccf4c", Gold: "#ffc93c", Metal_Light: "#c3ccd8", White: "#ffffff", Snow: "#ffffff", Dirt: "#b08a5a",
  Eye_White: "#ffffff", Eye_Black: "#1b1b22", Ears: "#ff9ec0",
  Cat_Main: "#ffab4f", Cat_Secondary: "#e27a2a", Dog_Main: "#f9bd63", Dog_Secondary: "#fff7ea",
  Pigeon_Main: "#b9845a", Pigeon_Secondary: "#ffcf4a",          // tô thành cú mèo nâu, mỏ vàng
  Dragon_Main: "#ff8fb8", Dragon_Secondary: "#a77bf3", Dragon_Horn: "#fff1c2",   // rồng con hồng – tím
};
const painted = new WeakSet<object>();
/** `palette` riêng cho 1 mô hình (ưu tiên hơn CUTE) — vd ngựa cũng có vật liệu tên "Main" */
export function cutify(scene: THREE.Object3D, palette?: Record<string, string>) {
  if (painted.has(scene)) return; painted.add(scene);
  scene.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      const c = palette?.[mat.name] ?? CUTE[mat.name];
      if (c && mat.color) { mat.color.set(c); mat.roughness = 0.78; mat.metalness = 0; }
    }
  });
}
// vật liệu "Main" (mái nhà, cờ tháp) theo màu người chơi — dùng chung theo màu
const teamMats = new Map<string, THREE.Material>();
function teamMat(base: THREE.MeshStandardMaterial, color: string) {
  const key = `${base.uuid}:${color}`;
  let m = teamMats.get(key);
  if (!m) { const n = base.clone(); n.color.set(color); teamMats.set(key, n); m = n; }
  return m;
}

type ModelProps = { name: string; size?: number; height?: number; position?: [number, number, number]; rotation?: [number, number, number]; shadows?: boolean; tint?: string };
/** Mô hình tĩnh, tự căn: đặt đáy chạm đất, tâm XZ ở gốc, co theo `size` (cạnh ngang lớn nhất, mét) hoặc `height` */
export function Model({ name, size, height, position, rotation, shadows = true, tint, team }: ModelProps & { team?: string }) {
  const { scene } = useGLTF(modelUrl(name));
  cutify(scene);
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y;
    const s = size ? size / Math.max(w, d) : height ? height / h : 1;
    return { s, off: [-(box.min.x + w / 2) * s, -box.min.y * s, -(box.min.z + d / 2) * s] as [number, number, number] };
  }, [scene, size, height]);
  const obj = useMemo(() => {
    if (team && !tint) {
      const c = scene.clone(true);
      c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).name === "Main") m.material = teamMat(m.material as THREE.MeshStandardMaterial, team); });
      return c;
    }
    if (!tint) return scene;
    const c = scene.clone(true);
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.set(tint); } });
    return c;
  }, [scene, tint, team]);
  return (
    <group position={position} rotation={rotation}>
      <Clone object={obj} scale={fit.s} position={fit.off} castShadow={shadows} receiveShadow={shadows} />
    </group>
  );
}

// ---------- Hiệu ứng ----------
export function Smoke({ count = 4, y = 3, spread = 1, color = "#4b5563" }: { count?: number; y?: number; spread?: number; color?: string }) {
  const refs = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((m, i) => {
      if (!m) return;
      const t = (clock.elapsedTime * 0.45 + i / count) % 1;
      m.position.set(Math.sin(i * 2.3) * spread * (0.4 + t), y + t * 5, Math.cos(i * 2.3) * spread * (0.4 + t));
      m.scale.setScalar(0.5 + t * 1.6);
      (m.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - t);
    });
  });
  return <>{Array.from({ length: count }).map((_, i) => (
    <mesh key={i} ref={(m) => { if (m) refs.current[i] = m; }}><icosahedronGeometry args={[0.7, 0]} /><meshStandardMaterial color={color} transparent depthWrite={false} flatShading /></mesh>
  ))}</>;
}
export function Fire({ y = 1, n = 5, spread = 1 }: { y?: number; n?: number; spread?: number }) {
  const refs = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => refs.current.forEach((m, i) => {
    if (!m) return;
    const t = (clock.elapsedTime * 1.6 + i / n) % 1;
    m.position.set(Math.sin(i * 2.7) * spread, y + t * 1.6, Math.cos(i * 1.9) * spread);
    m.scale.setScalar(0.55 * (1 - t) + 0.1);
  }));
  return <>{Array.from({ length: n }).map((_, i) => (
    <mesh key={i} ref={(m) => { if (m) refs.current[i] = m; }}><octahedronGeometry args={[0.6, 0]} /><meshBasicMaterial color={i % 2 ? "#f97316" : "#facc15"} transparent opacity={0.85} /></mesh>
  ))}</>;
}

// ---------- Nhà theo cấp (BASE-01/02, W3D-03) — Quaternius Fantasy RTS (CC0) ----------
export const HOUSE_NAMES = ["Lều tranh", "Nhà gỗ", "Nhà gạch", "Biệt thự", "Lâu đài", "Cung điện Tình Yêu"];
/** Kiểu nhà (BASE-14) × cấp 0→5. classic: chòi gỗ → nhà mái ngói → kho lớn → nhà có tháp đá → pháo đài → cung điện */
export const HOUSE_STYLES = ["classic", "town", "temple", "fortress"] as const;
export const houseModels = (level: number, style = "classic") => {
  const lv = Math.max(0, Math.min(5, level));
  return style === "classic" || !HOUSE_STYLES.includes(style as never) ? `house_l${lv}` : `house_${style}_l${lv}`;
};
preloadModels([0, 1, 2, 3, 4, 5].map((l) => houseModels(l)));
// tỉ lệ chiếm nền theo từng mô hình (mô hình cao/hẹp thì để to hơn một chút)
const HOUSE_FIT: Record<string, number[]> = {
  classic: [0.78, 0.86, 0.95, 0.9, 0.92, 0.98], town: [0.85, 0.88, 0.9, 0.85, 0.92, 0.95],
  temple: [0.7, 0.66, 0.66, 0.72, 0.76, 0.82], fortress: [0.9, 0.9, 0.85, 0.9, 0.92, 0.95],
};

/** "Bật" lên khi xuất hiện / đổi `k`: phóng to vượt rồi về 1 (lò xo tắt dần) — cảm giác xây dựng sống động */
export function Pop({ k, children, delay = 0, strength = 1 }: { k: string | number; children: React.ReactNode; delay?: number; strength?: number }) {
  const g = useRef<THREE.Group>(null);
  const t = useRef(-delay), last = useRef<string | number | null>(null);
  useFrame((_, dt) => {
    if (last.current !== k) { last.current = k; t.current = -delay; }
    if (!g.current) return;
    t.current += dt;
    const x = Math.max(0, t.current);
    if (x > 1.2) { if (g.current.scale.x !== 1) g.current.scale.setScalar(1); return; }
    const sY = x === 0 ? 0.01 : 1 + strength * Math.exp(-6 * x) * Math.sin(14 * x - Math.PI / 2) * 0.35 + (x < 0.12 ? -(1 - x / 0.12) * 0.6 : 0);
    const sXZ = 1 - (sY - 1) * 0.5;
    g.current.scale.set(sXZ, Math.max(0.01, sY), sXZ);
  });
  return <group ref={g}>{children}</group>;
}

/** Bụi tung lên quanh chân công trình khi vừa đặt / lên cấp */
export function Dust({ k, r = 2 }: { k: string | number; r?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const t = useRef(0), last = useRef<string | number | null>(null);
  useFrame((_, dt) => {
    if (last.current !== k) { last.current = k; t.current = 0; }
    t.current += dt;
    const x = t.current / 0.9;
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.visible = x < 1;
      if (x >= 1) return;
      const a = (i / refs.current.length) * Math.PI * 2;
      m.position.set(Math.cos(a) * r * (0.8 + x * 0.6), 0.3 + x * 0.8, Math.sin(a) * r * (0.8 + x * 0.6));
      m.scale.setScalar(0.4 + x * 0.9);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - x);
    });
  });
  return <>{Array.from({ length: 8 }).map((_, i) => <mesh key={i} ref={(m) => { refs.current[i] = m; }} visible={false}><icosahedronGeometry args={[0.5, 0]} /><meshBasicMaterial color="#e7dcc3" transparent depthWrite={false} /></mesh>)}</>;
}

/** Lá cờ phấp phới theo màu người chơi (thanh + vải đung đưa) */
export function WavingFlag({ color, h = 2.4, position }: { color: string; h?: number; position?: [number, number, number] }) {
  const cloth = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(h * 0.42, h * 0.26, 8, 2).translate(h * 0.21, 0, 0), [h]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position as THREE.BufferAttribute, t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.setZ(i, Math.sin(x * 4 - t * 6) * x * 0.18); }
    pos.needsUpdate = true;
    if (cloth.current) cloth.current.rotation.y = Math.sin(t * 0.7) * 0.25;
  });
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} castShadow><cylinderGeometry args={[0.04, 0.05, h, 6]} /><meshStandardMaterial color="#6b4423" /></mesh>
      <mesh position={[0, h + 0.05, 0]}><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color="#facc15" metalness={0.6} roughness={0.3} /></mesh>
      <mesh ref={cloth} geometry={geo} position={[0.03, h - h * 0.16, 0]}><meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} /></mesh>
    </group>
  );
}

/** màu mái theo màu yêu thích: giữ sắc, nâng độ tươi + sáng để luôn "cute" */
export function roofColor(hex: string) {
  const c = new THREE.Color(hex), h = { h: 0, s: 0, l: 0 }; c.getHSL(h);
  return "#" + c.setHSL(h.h, Math.max(0.55, h.s), Math.min(0.62, Math.max(0.5, h.l))).getHexString();
}

/** Nhà trên nền đất: `size` = cạnh ô đất (mét). Đổ nát → mô hình đổ nát + lửa; <50% HP → khói; khiên → mái vòm phát sáng */
export function HouseModel({ level, color, hpPct, shield, size, shake = 0, shakeRef, style = "classic" }: { level: number; color: string; hpPct: number; shield: boolean; size: number; shake?: number; shakeRef?: React.RefObject<number>; style?: string }) {
  const ruined = hpPct <= 0;
  const g = useRef<THREE.Group>(null);
  const dome = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (g.current) { const k = Math.max(0, shakeRef?.current ?? shake); g.current.position.x = Math.sin(clock.elapsedTime * 60) * 0.15 * k; g.current.rotation.z = Math.sin(clock.elapsedTime * 47) * 0.02 * k; }
    if (dome.current) (dome.current.material as THREE.MeshStandardMaterial).opacity = 0.22 + Math.sin(clock.elapsedTime * 2) * 0.06;
  });
  const lv = Math.max(0, Math.min(5, level));
  return (
    <group>
      {/* nền đá lát dưới nhà */}
      <mesh position={[0, 0.07, 0]} receiveShadow><boxGeometry args={[size, 0.14, size]} /><meshStandardMaterial color={ruined ? "#78716c" : "#cbbf9f"} /></mesh>
      <mesh position={[0, 0.15, 0]} receiveShadow><boxGeometry args={[size * 0.92, 0.04, size * 0.92]} /><meshStandardMaterial color={ruined ? "#57534e" : "#e2d8bc"} /></mesh>
      <group ref={g}>
        {ruined ? <Model name="destroyed" size={size * 0.82} /> : (
          <Pop k={`${style}${lv}`}>
            <Model name={houseModels(lv, style)} size={size * (HOUSE_FIT[style] ?? HOUSE_FIT.classic)[lv]} position={[0, 0.17, 0]} team={roofColor(color)} />
            {lv >= 5 && <Heart position={[0, size * 0.72, 0]} scale={size * 0.07} />}
          </Pop>
        )}
        {!ruined && <WavingFlag color={color} h={Math.max(1.6, size * 0.45)} position={[-size * 0.44, 0.15, size * 0.44]} />}
      </group>
      {!ruined && <Dust k={`${style}${lv}`} r={size * 0.5} />}
      {ruined && <><Fire y={0.4} n={6} spread={size * 0.18} /><Smoke count={6} y={size * 0.25} spread={size * 0.15} color="#374151" /></>}
      {!ruined && hpPct < 0.5 && <Smoke count={hpPct < 0.25 ? 6 : 3} y={size * 0.55} spread={size * 0.1} />}
      {shield && (
        <mesh ref={dome}>
          <sphereGeometry args={[size * 0.85, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#60a5fa" emissive="#3b82f6" emissiveIntensity={0.6} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** Trái tim 3D (đùn từ hình 2D) */
export function Heart({ position, scale = 1, color = "#ec4899", spin = true }: { position?: [number, number, number]; scale?: number; color?: string; spin?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -1.1); s.bezierCurveTo(-1.6, 0, -1.2, 1.3, 0, 0.55); s.bezierCurveTo(1.2, 1.3, 1.6, 0, 0, -1.1);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 });
    g.center(); return g;
  }, []);
  useFrame(({ clock }) => { if (ref.current && spin) ref.current.rotation.y = clock.elapsedTime * 1.2; });
  return <mesh ref={ref} geometry={geo} position={position} scale={scale} castShadow><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.4} /></mesh>;
}
