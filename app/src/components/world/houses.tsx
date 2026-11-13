"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group, Mesh } from "three";

export type HouseInfo = { name: string; level: number; hpPct: number; shield: boolean; color: string; pets: string[] };

function Smoke({ count }: { count: number }) {
  const refs = useRef<Mesh[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((m, i) => {
      if (!m) return;
      const t = (clock.elapsedTime * 0.6 + i / count) % 1;
      m.position.set(Math.sin(i * 2) * 0.6, 4 + t * 5, Math.cos(i * 2) * 0.6);
      m.scale.setScalar(0.4 + t * 1.1);
      (m.material as unknown as { opacity: number }).opacity = 0.55 * (1 - t);
    });
  });
  return <>{Array.from({ length: count }).map((_, i) => (
    <mesh key={i} ref={(m) => { if (m) refs.current[i] = m; }}><sphereGeometry args={[1, 8, 8]} /><meshBasicMaterial color="#555" transparent opacity={0.5} depthWrite={false} /></mesh>
  ))}</>;
}

function Pet({ emoji, i, r }: { emoji: string; i: number; r: number }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    const a = clock.elapsedTime * 0.5 + i * 2.1;
    g.current?.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r);
  });
  return <group ref={g}><mesh castShadow><sphereGeometry args={[0.35, 12, 12]} /><meshStandardMaterial color="#fbbf24" /></mesh><Html position={[0, 0.9, 0]} center distanceFactor={14} style={{ pointerEvents: "none", fontSize: 22 }}>{emoji}</Html></group>;
}

// Ngôi nhà phản ánh cấp (kích thước), hư hại (khói, nứt), đổ nát (nghiêng, xám), khiên (mái vòm), thú cưng đi quanh nhà
export function House({ x, z, info }: { x: number; z: number; info: HouseInfo }) {
  const lv = info.level, w = 3.6 + lv * 0.7, h = 2.4 + lv * 0.55;
  const ruined = info.hpPct <= 0;
  const body = ruined ? "#6b7280" : ["#d6b88a", "#c08a5a", "#e8d8c3", "#f5e6d3", "#cbd5e1", "#fbcfe8"][Math.min(lv, 5)];
  const shield = useRef<Mesh>(null);
  useFrame(({ clock }) => { if (shield.current) (shield.current.material as unknown as { opacity: number }).opacity = 0.18 + Math.sin(clock.elapsedTime * 2) * 0.05; });
  return (
    <group position={[x, 0, z]} rotation={[0, x < 0 ? 0.4 : -0.4, 0]}>
      <group rotation={ruined ? [0.12, 0, 0.18] : [0, 0, 0]}>
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, w]} /><meshStandardMaterial color={body} /></mesh>
        <mesh position={[0, h + 0.9 + lv * 0.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[w * 0.78, 1.8 + lv * 0.2, 4]} /><meshStandardMaterial color={ruined ? "#374151" : info.color} /></mesh>
        <mesh position={[0, 0.9, w / 2 + 0.01]}><boxGeometry args={[0.9, 1.8, 0.05]} /><meshStandardMaterial color="#7c4a2d" /></mesh>
        {lv >= 3 && [-1, 1].map((s) => <mesh key={s} position={[s * (w / 2), (h + 1.5) / 2, s * (w / 2)]} castShadow><cylinderGeometry args={[0.7, 0.8, h + 1.5, 10]} /><meshStandardMaterial color={body} /></mesh>)}
        {lv >= 5 && <Html position={[0, h + 3.6, 0]} center distanceFactor={14} style={{ pointerEvents: "none", fontSize: 30 }}>💖</Html>}
      </group>
      {info.hpPct < 0.5 && <Smoke count={ruined ? 6 : 3} />}
      {info.shield && <mesh ref={shield} position={[0, 0, 0]}><sphereGeometry args={[w * 1.35, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshBasicMaterial color="#60a5fa" transparent opacity={0.2} depthWrite={false} /></mesh>}
      {!ruined && info.pets.map((p, i) => <Pet key={i} emoji={p} i={i} r={w * 0.85 + 1.2} />)}
      <Html position={[0, h + 3.2, 0]} center distanceFactor={22} style={{ pointerEvents: "none" }}>
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-extrabold text-pink-700 shadow whitespace-nowrap">🏠 {info.name} · Cấp {lv}{info.shield ? " 🛡️" : ""}{ruined ? " 💥" : ""}</div>
      </Html>
    </group>
  );
}
