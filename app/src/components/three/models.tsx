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

type ModelProps = { name: string; size?: number; height?: number; position?: [number, number, number]; rotation?: [number, number, number]; shadows?: boolean; tint?: string };
/** Mô hình tĩnh, tự căn: đặt đáy chạm đất, tâm XZ ở gốc, co theo `size` (cạnh ngang lớn nhất, mét) hoặc `height` */
export function Model({ name, size, height, position, rotation, shadows = true, tint }: ModelProps) {
  const { scene } = useGLTF(modelUrl(name));
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y;
    const s = size ? size / Math.max(w, d) : height ? height / h : 1;
    return { s, off: [-(box.min.x + w / 2) * s, -box.min.y * s, -(box.min.z + d / 2) * s] as [number, number, number] };
  }, [scene, size, height]);
  const obj = useMemo(() => {
    if (!tint) return scene;
    const c = scene.clone(true);
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.set(tint); } });
    return c;
  }, [scene, tint]);
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

// ---------- Nhà theo cấp (BASE-01/02, W3D-03) ----------
export const HOUSE_NAMES = ["Lều tranh", "Nhà gỗ", "Nhà gạch", "Biệt thự", "Lâu đài", "Cung điện Tình Yêu"];
export function houseModels(level: number, color: string) {
  const c = colorVariant(color);
  return ["tent", `home_A_${c}`, `home_B_${c}`, `tavern_${c}`, `castle_${c}`, `castle_${c}`][Math.max(0, Math.min(5, level))];
}

/** Nhà trên nền đất: `size` = cạnh ô đất (mét). Đổ nát → mô hình đổ nát + lửa; <50% HP → khói; khiên → mái vòm phát sáng */
export function HouseModel({ level, color, hpPct, shield, size, shake = 0, shakeRef }: { level: number; color: string; hpPct: number; shield: boolean; size: number; shake?: number; shakeRef?: React.RefObject<number> }) {
  const ruined = hpPct <= 0;
  const g = useRef<THREE.Group>(null);
  const dome = useRef<THREE.Mesh>(null);
  const c = colorVariant(color);
  useFrame(({ clock }) => {
    if (g.current) { const k = Math.max(0, shakeRef?.current ?? shake); g.current.position.x = Math.sin(clock.elapsedTime * 60) * 0.15 * k; g.current.rotation.z = Math.sin(clock.elapsedTime * 47) * 0.02 * k; }
    if (dome.current) (dome.current.material as THREE.MeshStandardMaterial).opacity = 0.22 + Math.sin(clock.elapsedTime * 2) * 0.06;
  });
  const main = houseModels(level, color);
  const fp = size * 0.82;
  return (
    <group>
      {/* nền đá/đất dưới nhà */}
      <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[size, 0.12, size]} /><meshStandardMaterial color={ruined ? "#78716c" : "#d6c7a1"} /></mesh>
      <group ref={g}>
        {ruined ? <Model name="destroyed" size={fp} /> : (
          <>
            <Model name={main} size={level === 0 ? fp * 0.75 : level >= 4 ? fp * 0.78 : fp} />
            {level >= 3 && <Model name={`tower_A_${c}`} height={size * 0.75} position={[size * 0.4, 0, size * 0.4]} />}
            {level >= 5 && (
              <>
                <Model name={`tower_A_${c}`} height={size * 0.75} position={[-size * 0.4, 0, size * 0.4]} />
                <Model name={`tower_A_${c}`} height={size * 0.85} position={[-size * 0.4, 0, -size * 0.4]} />
                <Model name={`tower_A_${c}`} height={size * 0.85} position={[size * 0.4, 0, -size * 0.4]} />
                <Heart position={[0, size * 1.05, 0]} scale={size * 0.09} />
              </>
            )}
            {level >= 1 && <Model name={`flag_${c}`} height={size * 0.35} position={[-size * 0.42, 0, size * 0.42]} />}
          </>
        )}
      </group>
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
