"use client";
// Thú cưng thiết kế bằng khối low-poly (KayKit không có thú). Cùng phong cách bo tròn, có hoạt ảnh riêng từng loài.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

type Mat = { color: string; rough?: number; emissive?: string };
const M = ({ color, rough = 0.7, emissive }: Mat) => <meshStandardMaterial color={color} roughness={rough} flatShading emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.4 : 0} />;
const Eye = ({ x, y, z, r = 0.07 }: { x: number; y: number; z: number; r?: number }) => (
  <group position={[x, y, z]}>
    <mesh><sphereGeometry args={[r, 10, 8]} /><meshStandardMaterial color="#111827" roughness={0.2} /></mesh>
    <mesh position={[r * 0.35, r * 0.35, r * 0.8]}><sphereGeometry args={[r * 0.3, 6, 6]} /><meshBasicMaterial color="#fff" /></mesh>
  </group>
);

// ---------- Mèo mướp: thân cam sọc nâu, tai nhọn, đuôi cong vẫy ----------
function Cat({ t }: { t: React.RefObject<number> }) {
  const tail = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null);
  useFrame(() => { const k = t.current ?? 0; if (tail.current) tail.current.rotation.z = Math.sin(k * 3) * 0.5; if (head.current) head.current.rotation.y = Math.sin(k * 0.8) * 0.3; });
  const fur = "#f59e0b", stripe = "#b45309", cream = "#fde68a";
  return (
    <group>
      <mesh position={[0, 0.38, 0]} scale={[0.36, 0.3, 0.5]} castShadow><sphereGeometry args={[1, 12, 10]} /><M color={fur} /></mesh>
      {[-0.15, 0, 0.15].map((z) => <mesh key={z} position={[0, 0.6, z]} scale={[0.37, 0.06, 0.07]}><sphereGeometry args={[1, 8, 6]} /><M color={stripe} /></mesh>)}
      <mesh position={[0, 0.3, 0.2]} scale={[0.25, 0.2, 0.3]}><sphereGeometry args={[1, 10, 8]} /><M color={cream} /></mesh>
      {[[-0.17, 0.27], [0.17, 0.27], [-0.17, -0.27], [0.17, -0.27]].map(([x, z], i) => <mesh key={i} position={[x, 0.12, z]} castShadow><cylinderGeometry args={[0.07, 0.08, 0.26, 8]} /><M color={i < 2 ? cream : fur} /></mesh>)}
      <group ref={head} position={[0, 0.72, 0.42]}>
        <mesh scale={[0.3, 0.27, 0.27]} castShadow><sphereGeometry args={[1, 12, 10]} /><M color={fur} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[s * 0.17, 0.25, 0]} rotation={[0, 0, -s * 0.3]} castShadow><coneGeometry args={[0.1, 0.2, 4]} /><M color={fur} /></mesh>)}
        {[-1, 1].map((s) => <mesh key={`i${s}`} position={[s * 0.17, 0.24, 0.03]} rotation={[0, 0, -s * 0.3]}><coneGeometry args={[0.05, 0.12, 4]} /><M color="#fda4af" /></mesh>)}
        <mesh position={[0, -0.06, 0.22]} scale={[0.14, 0.1, 0.1]}><sphereGeometry args={[1, 8, 6]} /><M color={cream} /></mesh>
        <mesh position={[0, -0.02, 0.29]}><sphereGeometry args={[0.03, 6, 6]} /><M color="#f472b6" /></mesh>
        <Eye x={-0.1} y={0.04} z={0.22} /><Eye x={0.1} y={0.04} z={0.22} />
      </group>
      <group ref={tail} position={[0, 0.45, -0.48]}>
        {[0, 1, 2, 3].map((i) => <mesh key={i} position={[0, 0.12 + i * 0.13, -0.06 * i + (i > 2 ? 0.08 : 0)]} castShadow><sphereGeometry args={[0.07 - i * 0.008, 8, 6]} /><M color={i % 2 ? stripe : fur} /></mesh>)}
      </group>
    </group>
  );
}

// ---------- Corgi: vàng cam + trắng, chân ngắn, tai to dựng, mông lắc ----------
function Corgi({ t }: { t: React.RefObject<number> }) {
  const butt = useRef<THREE.Group>(null), tongue = useRef<THREE.Mesh>(null);
  useFrame(() => { const k = t.current ?? 0; if (butt.current) butt.current.rotation.y = Math.sin(k * 6) * 0.12; if (tongue.current) tongue.current.scale.y = 1 + Math.sin(k * 8) * 0.3; });
  const tan = "#f59e0b", white = "#fffbeb";
  return (
    <group>
      <group ref={butt}>
        <mesh position={[0, 0.33, 0]} scale={[0.32, 0.26, 0.55]} castShadow><sphereGeometry args={[1, 12, 10]} /><M color={tan} /></mesh>
        <mesh position={[0, 0.25, 0.12]} scale={[0.26, 0.18, 0.4]}><sphereGeometry args={[1, 10, 8]} /><M color={white} /></mesh>
        <mesh position={[0, 0.42, -0.52]} castShadow><sphereGeometry args={[0.1, 8, 6]} /><M color={white} /></mesh>
      </group>
      {[[-0.17, 0.32], [0.17, 0.32], [-0.17, -0.32], [0.17, -0.32]].map(([x, z], i) => <mesh key={i} position={[x, 0.08, z]} castShadow><cylinderGeometry args={[0.07, 0.07, 0.16, 8]} /><M color={white} /></mesh>)}
      <group position={[0, 0.6, 0.48]}>
        <mesh scale={[0.27, 0.24, 0.26]} castShadow><sphereGeometry args={[1, 12, 10]} /><M color={tan} /></mesh>
        <mesh position={[0, -0.08, 0.2]} scale={[0.15, 0.11, 0.17]}><sphereGeometry args={[1, 10, 8]} /><M color={white} /></mesh>
        <mesh position={[0, -0.02, 0.36]}><sphereGeometry args={[0.04, 8, 6]} /><M color="#111827" /></mesh>
        <mesh ref={tongue} position={[0, -0.16, 0.3]} scale={[0.05, 0.06, 0.02]}><sphereGeometry args={[1, 6, 6]} /><M color="#f472b6" /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[s * 0.15, 0.27, -0.02]} rotation={[0, 0, -s * 0.25]} castShadow><coneGeometry args={[0.11, 0.3, 4]} /><M color={tan} /></mesh>)}
        <mesh position={[0, 0.17, 0.12]} scale={[0.05, 0.1, 0.05]}><sphereGeometry args={[1, 6, 6]} /><M color={white} /></mesh>
        <Eye x={-0.1} y={0.05} z={0.2} /><Eye x={0.1} y={0.05} z={0.2} />
      </group>
    </group>
  );
}

// ---------- Cú mèo: tròn, mắt to, cánh vỗ ----------
function Owl({ t }: { t: React.RefObject<number> }) {
  const wl = useRef<THREE.Mesh>(null), wr = useRef<THREE.Mesh>(null), body = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = t.current ?? 0, f = Math.max(0, Math.sin(k * 2)) * Math.sin(k * 18) * 0.6;
    if (wl.current) wl.current.rotation.z = 0.2 + f; if (wr.current) wr.current.rotation.z = -0.2 - f;
    if (body.current) body.current.position.y = Math.max(0, Math.sin(k * 2)) * 0.25;
  });
  const brown = "#92400e", light = "#fcd34d";
  return (
    <group ref={body}>
      <mesh position={[0, 0.45, 0]} scale={[0.33, 0.42, 0.3]} castShadow><sphereGeometry args={[1, 12, 10]} /><M color={brown} /></mesh>
      <mesh position={[0, 0.38, 0.14]} scale={[0.24, 0.3, 0.18]}><sphereGeometry args={[1, 10, 8]} /><M color={light} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.13, 0.66, 0.24]}>
          <mesh><cylinderGeometry args={[0.12, 0.12, 0.05, 14]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}><cylinderGeometry args={[0.12, 0.12, 0.02, 14]} /><meshStandardMaterial color="#fffbeb" /></mesh>
          <Eye x={0} y={0} z={0.05} r={0.06} />
        </group>
      ))}
      <mesh position={[0, 0.56, 0.3]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.04, 0.1, 4]} /><M color="#f97316" /></mesh>
      {[-1, 1].map((s) => <mesh key={`e${s}`} position={[s * 0.2, 0.86, 0]} rotation={[0, 0, -s * 0.4]}><coneGeometry args={[0.06, 0.16, 4]} /><M color={brown} /></mesh>)}
      <mesh ref={wl} position={[-0.32, 0.45, -0.02]} scale={[0.07, 0.28, 0.2]} castShadow><sphereGeometry args={[1, 8, 6]} /><M color="#78350f" /></mesh>
      <mesh ref={wr} position={[0.32, 0.45, -0.02]} scale={[0.07, 0.28, 0.2]} castShadow><sphereGeometry args={[1, 8, 6]} /><M color="#78350f" /></mesh>
      {[-0.1, 0.1].map((x) => <mesh key={x} position={[x, 0.05, 0.1]}><boxGeometry args={[0.08, 0.04, 0.12]} /><M color="#f97316" /></mesh>)}
    </group>
  );
}

// ---------- Rồng con: xanh lá, sừng, gai lưng, cánh, đuôi; thỉnh thoảng phun lửa ----------
function Dragon({ t }: { t: React.RefObject<number> }) {
  const wl = useRef<THREE.Group>(null), wr = useRef<THREE.Group>(null), tail = useRef<THREE.Group>(null), fire = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = t.current ?? 0;
    if (wl.current) wl.current.rotation.z = 0.5 + Math.sin(k * 5) * 0.4; if (wr.current) wr.current.rotation.z = -0.5 - Math.sin(k * 5) * 0.4;
    if (tail.current) tail.current.rotation.y = Math.sin(k * 2) * 0.4;
    if (fire.current) { const on = (k % 6) < 0.9; fire.current.visible = on; fire.current.scale.setScalar(on ? 0.6 + ((k % 6) / 0.9) * 0.6 : 0.01); }
  });
  const g = "#22c55e", dark = "#15803d", belly = "#fef08a";
  return (
    <group>
      <mesh position={[0, 0.42, 0]} scale={[0.34, 0.32, 0.48]} castShadow><sphereGeometry args={[1, 12, 10]} /><M color={g} /></mesh>
      <mesh position={[0, 0.34, 0.12]} scale={[0.24, 0.22, 0.34]}><sphereGeometry args={[1, 10, 8]} /><M color={belly} /></mesh>
      {[0.2, 0, -0.2].map((z, i) => <mesh key={z} position={[0, 0.74 - i * 0.02, z]}><coneGeometry args={[0.06, 0.16, 4]} /><M color={dark} /></mesh>)}
      {[[-0.18, 0.28], [0.18, 0.28], [-0.18, -0.25], [0.18, -0.25]].map(([x, z], i) => <mesh key={i} position={[x, 0.12, z]} castShadow><cylinderGeometry args={[0.08, 0.09, 0.24, 8]} /><M color={dark} /></mesh>)}
      <group position={[0, 0.78, 0.42]}>
        <mesh scale={[0.25, 0.23, 0.28]} castShadow><sphereGeometry args={[1, 12, 10]} /><M color={g} /></mesh>
        <mesh position={[0, -0.06, 0.24]} scale={[0.15, 0.1, 0.14]}><sphereGeometry args={[1, 10, 8]} /><M color={g} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[s * 0.12, 0.22, -0.06]} rotation={[-0.4, 0, -s * 0.3]}><coneGeometry args={[0.05, 0.22, 6]} /><M color={belly} /></mesh>)}
        {[-1, 1].map((s) => <mesh key={`n${s}`} position={[s * 0.05, -0.03, 0.37]}><sphereGeometry args={[0.02, 6, 6]} /><M color="#14532d" /></mesh>)}
        <Eye x={-0.11} y={0.06} z={0.18} r={0.06} /><Eye x={0.11} y={0.06} z={0.18} r={0.06} />
        <group ref={fire} position={[0, -0.06, 0.45]}>
          {[0, 1, 2].map((i) => <mesh key={i} position={[0, 0, i * 0.18]}><octahedronGeometry args={[0.1 + i * 0.04, 0]} /><meshBasicMaterial color={i === 0 ? "#fde047" : "#f97316"} transparent opacity={0.85} /></mesh>)}
        </group>
      </group>
      {[[-1, wl], [1, wr]].map(([s, r]) => (
        <group key={String(s)} ref={r as React.RefObject<THREE.Group>} position={[(s as number) * 0.28, 0.62, -0.05]}>
          <mesh position={[(s as number) * 0.25, 0.05, 0]} rotation={[0, 0, (s as number) * 0.1]} scale={[0.3, 0.03, 0.22]} castShadow><sphereGeometry args={[1, 6, 4]} /><M color="#86efac" /></mesh>
        </group>
      ))}
      <group ref={tail} position={[0, 0.35, -0.45]}>
        {[0, 1, 2, 3].map((i) => <mesh key={i} position={[0, -0.04 * i, -0.15 * i]} castShadow><sphereGeometry args={[0.1 - i * 0.018, 8, 6]} /><M color={g} /></mesh>)}
        <mesh position={[0, -0.14, -0.66]} rotation={[-Math.PI / 2, 0, 0]}><coneGeometry args={[0.07, 0.14, 4]} /><M color={dark} /></mesh>
      </group>
    </group>
  );
}

const PETS: Record<string, (p: { t: React.RefObject<number> }) => React.ReactElement> = { cat: Cat, corgi: Corgi, owl: Owl, dragon: Dragon };

/**
 * 1 thú cưng: to dần theo cấp, nhún nhảy; `wander` (mét) → đi vòng quanh điểm đặt.
 * `sad` (nhà đổ nát, BASE-03) → cúi đầu, xám màu nhẹ, đi chậm.
 */
export function Pet({ code, level = 1, name, wander = 0, sad = false, phase = 0, scale = 1.6 }: { code: string; level?: number; name?: string; wander?: number; sad?: boolean; phase?: number; scale?: number }) {
  const g = useRef<THREE.Group>(null), inner = useRef<THREE.Group>(null);
  const t = useRef(phase);
  useFrame((_, dt) => {
    t.current += dt * (sad ? 0.35 : 1);
    const k = t.current;
    if (inner.current) inner.current.position.y = sad ? 0 : Math.abs(Math.sin(k * 4)) * 0.06;
    if (g.current && wander > 0) {
      const a = k * 0.35 + phase;
      g.current.position.set(Math.cos(a) * wander, 0, Math.sin(a) * wander);
      g.current.rotation.y = -a;          // hướng theo chiều đi (tiếp tuyến vòng tròn)
    }
  });
  const Body = PETS[code] ?? Cat;
  const s = scale * (0.85 + level * 0.07);
  return (
    <group ref={g}>
      <group ref={inner} scale={s} rotation={[sad ? 0.25 : 0, 0, 0]}><Body t={t} /></group>
      {level >= 5 && <mesh position={[0, 1.15 * s, 0.4 * s]}><coneGeometry args={[0.12 * s, 0.18 * s, 5]} /><meshStandardMaterial color="#facc15" metalness={0.7} roughness={0.2} /></mesh>}
      {name && (
        <Html position={[0, 1.35 * s, 0]} center distanceFactor={16} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold text-pink-700 shadow whitespace-nowrap">{sad ? "😢 " : ""}{name} · Lv{level}</div>
        </Html>
      )}
    </group>
  );
}
