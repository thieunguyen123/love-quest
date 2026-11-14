"use client";
// Công trình phòng thủ & bẫy (BASE-10, BASE-11): Tháp canh (KayKit), Xe pháo và bẫy tự thiết kế bằng khối cơ bản.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Model, Smoke, Pop, WavingFlag, preloadModels, roofColor } from "./models";


preloadModels(["def_tower", "def_tower_wood", "def_cannon", "trap_spike", "trap_bomb"]);

/** Đại bác (Quaternius, CC0) trên bệ đá xoay: quay theo `aim` (góc quanh Y), giật lùi khi bắn (`recoil` 1→0), khói nòng */
export function CannonCart({ size = 4, aim, recoil, color = "#ec4899" }: { size?: number; aim?: React.RefObject<number>; recoil?: React.RefObject<number>; color?: string }) {
  const turret = useRef<THREE.Group>(null), barrel = useRef<THREE.Group>(null), puff = useRef<THREE.Mesh>(null);
  const idle = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    idle.current += dt;
    if (turret.current) {
      // không có mục tiêu: đảo nòng canh gác chậm rãi
      const want = aim && aim.current !== 0 ? aim.current : Math.sin(idle.current * 0.4) * 1.2;
      const d = ((want - turret.current.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      turret.current.rotation.y += d * Math.min(1, dt * 8);
    }
    const r = recoil?.current ?? 0;
    if (barrel.current) barrel.current.position.z = -0.35 * r;
    if (puff.current) { puff.current.visible = r > 0.05; puff.current.scale.setScalar(0.3 + (1 - r) * 1.2); (puff.current.material as THREE.MeshBasicMaterial).opacity = r * 0.8; }
    if (recoil) recoil.current = Math.max(0, r - dt * 3);
  });
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow><cylinderGeometry args={[size * 0.38, size * 0.44, 0.4, 10]} /><meshStandardMaterial color="#e9e2d2" flatShading /></mesh>
      <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[size * 0.33, size * 0.36, 0.06, 10]} /><meshStandardMaterial color={roofColor(color)} /></mesh>
      <group ref={turret} position={[0, 0.44, 0]}>
        <group ref={barrel}><Model name="def_cannon" size={size * 0.62} /></group>
        <mesh ref={puff} position={[0, size * 0.22, size * 0.42]} visible={false}><icosahedronGeometry args={[0.5, 0]} /><meshBasicMaterial color="#e5e7eb" transparent depthWrite={false} /></mesh>
      </group>
    </group>
  );
}

/** Tháp canh (Quaternius Fantasy RTS): tháp gỗ khi nhà cấp thấp, tháp đá khi nhà cấp ≥ 3; cờ màu người chơi trên đỉnh */
export function WatchTower({ size = 4, color, stone = true }: { size?: number; color: string; stone?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.08, 0]} receiveShadow><cylinderGeometry args={[size * 0.42, size * 0.46, 0.16, 8]} /><meshStandardMaterial color="#e9e2d2" flatShading /></mesh>
      <Pop k={stone ? 1 : 0}><Model name={stone ? "def_tower" : "def_tower_wood"} size={size * (stone ? 0.82 : 0.72)} position={[0, 0.15, 0]} team={roofColor(color)} /></Pop>
      <WavingFlag color={color} h={1.1} position={[0, size * (stone ? 1.42 : 1.6), 0]} />
    </group>
  );
}

/** Đống đổ nát thay cho công trình bị phá */
export function Rubble({ size = 4 }: { size?: number }) {
  return (
    <group>
      {[[0, 0, 1], [0.5, 0.3, 0.7], [-0.45, -0.2, 0.8], [0.1, -0.5, 0.6], [-0.3, 0.45, 0.5]].map(([x, z, k], i) => (
        <mesh key={i} position={[x * size * 0.3, 0.25 * k, z * size * 0.3]} rotation={[i, i * 1.7, i * 0.6]} castShadow><dodecahedronGeometry args={[size * 0.14 * k, 0]} /><meshStandardMaterial color={i % 2 ? "#78716c" : "#57534e"} flatShading /></mesh>
      ))}
      <Smoke count={3} y={0.5} spread={size * 0.1} />
    </group>
  );
}

export function DefenseModel({ code, size, color, aim, recoil, stone = true }: { code: string; size: number; color: string; aim?: React.RefObject<number>; recoil?: React.RefObject<number>; stone?: boolean }) {
  return code === "def_cannon" ? <CannonCart size={size * 0.9} aim={aim} recoil={recoil} color={color} /> : <WatchTower size={size} color={color} stone={stone} />;
}

/** Bẫy: chông (Kenney, có hoạt ảnh trồi lên khi sập) hoặc bom (Quaternius) có ngòi lấp lánh. `armed=false` → đã nổ */
export function TrapModel({ code, size = 2, armed = true }: { code: string; size?: number; armed?: boolean }) {
  const fuse = useRef<THREE.Mesh>(null), bob = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (fuse.current) fuse.current.scale.setScalar(0.8 + Math.sin(clock.elapsedTime * 9) * 0.3);
    if (bob.current) bob.current.position.y = Math.sin(clock.elapsedTime * 2) * 0.03;
  });
  if (!armed) return <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[size * 0.55, 12]} /><meshBasicMaterial color="#1c1917" transparent opacity={0.55} depthWrite={false} /></mesh>;
  if (code === "trap_bomb") return (
    <group ref={bob}>
      <Model name="trap_bomb" height={size * 0.55} />
      <mesh ref={fuse} position={[size * 0.12, size * 0.56, 0]}><octahedronGeometry args={[0.08, 0]} /><meshBasicMaterial color="#fbbf24" /></mesh>
    </group>
  );
  return <Model name="trap_spike" size={size * 0.8} />;
}

/** Thanh HP nhỏ dạng sprite (2 lần vẽ). `frac` ref 0..1; ẩn khi đầy hoặc hết */
export function HpSprite({ frac, y, w = 1.8 }: { frac: React.RefObject<number>; y: number; w?: number }) {
  const g = useRef<THREE.Group>(null), fg = useRef<THREE.Sprite>(null);
  useFrame(() => {
    const f = Math.max(0, Math.min(1, frac.current ?? 1));
    if (g.current) g.current.visible = f > 0 && f < 0.999;
    if (fg.current) { fg.current.scale.x = Math.max(0.001, w * f); (fg.current.material as THREE.SpriteMaterial).color.set(f < 0.3 ? "#ef4444" : f < 0.6 ? "#f59e0b" : "#22c55e"); }
  });
  return (
    <group ref={g} position={[0, y, 0]} visible={false}>
      <sprite scale={[w + 0.12, 0.3, 1]} renderOrder={8}><spriteMaterial color="#111827" depthTest={false} transparent opacity={0.75} /></sprite>
      <sprite ref={fg} scale={[w, 0.18, 1]} renderOrder={9}><spriteMaterial color="#22c55e" depthTest={false} /></sprite>
    </group>
  );
}
