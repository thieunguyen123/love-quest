"use client";
// Vũ khí trưng bày (1×1) và đồ trang trí (BASE-09) trên lưới căn cứ
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Model, Fire, Heart, colorVariant } from "./models";
import { useQuality } from "./quality";

function Pedestal({ w }: { w: number }) {
  return (
    <>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow><cylinderGeometry args={[w * 0.36, w * 0.42, 0.4, 8]} /><meshStandardMaterial color="#a8a29e" flatShading /></mesh>
      <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[w * 0.3, w * 0.33, 0.06, 8]} /><meshStandardMaterial color="#78716c" flatShading /></mesh>
    </>
  );
}
function Hammer() {
  return (
    <group>
      <mesh position={[0, 0.7, 0]} castShadow><cylinderGeometry args={[0.06, 0.07, 1.4, 8]} /><meshStandardMaterial color="#7c4a2d" /></mesh>
      <mesh position={[0, 1.42, 0]} castShadow><boxGeometry args={[0.7, 0.36, 0.36]} /><meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} flatShading /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.38, 1.42, 0]} rotation={[0, 0, (s * Math.PI) / 2]}><cylinderGeometry args={[0.2, 0.2, 0.06, 8]} /><meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.3} /></mesh>)}
    </group>
  );
}
function Cannon() {
  return (
    <group>
      <mesh position={[0, 0.55, 0.05]} rotation={[-0.45, 0, 0]} castShadow><cylinderGeometry args={[0.2, 0.3, 1.3, 14]} /><meshStandardMaterial color="#ec4899" metalness={0.5} roughness={0.35} /></mesh>
      <mesh position={[0, 0.83, 0.62]} rotation={[-0.45 + Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.06, 8, 16]} /><meshStandardMaterial color="#f9a8d4" metalness={0.6} roughness={0.3} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.3, 0.3, -0.1]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.3, 0.3, 0.1, 12]} /><meshStandardMaterial color="#7c4a2d" /></mesh>)}
      <Heart position={[0, 0.62, -0.38]} scale={0.12} spin={false} />
    </group>
  );
}
function Sparks() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (!g.current) return; g.current.rotation.y = clock.elapsedTime * 3; g.current.children.forEach((c, i) => { c.visible = Math.sin(clock.elapsedTime * 13 + i * 2) > 0.2; }); });
  return <group ref={g} position={[0, 2.3, 0]}>{[0, 1, 2, 3].map((i) => <mesh key={i} position={[Math.cos(i * 1.6) * 0.3, (i % 2) * 0.2, Math.sin(i * 1.6) * 0.3]} rotation={[i, i * 2, 0]}><boxGeometry args={[0.04, 0.4, 0.04]} /><meshBasicMaterial color="#fde047" /></mesh>)}</group>;
}

/** Vũ khí đặt trên bệ, xoay chậm và phát sáng nhẹ */
export function WeaponStand({ code, size = 2 }: { code: string; size?: number }) {
  const spin = useRef<THREE.Group>(null);
  const lights = useQuality().lights;   // đèn điểm rất đắt trên điện thoại → chỉ bật ở mức Cao
  useFrame((_, dt) => { if (spin.current) spin.current.rotation.y += dt * 0.6; });
  const inner = (() => {
    switch (code) {
      case "iron_sword": return <Model name="sword_2handed" height={1.6} position={[0, 0.45, 0]} />;
      case "fire_bow": return <><Model name="crossbow_2handed" size={1.2} position={[0, 0.6, 0]} rotation={[0.4, 0, 0]} /><Fire y={0.9} n={4} spread={0.18} /></>;
      case "war_hammer": return <group position={[0, 0.45, 0]} scale={0.9}><Hammer /></group>;
      case "love_cannon": return <group position={[0, 0.45, 0]}><Cannon /></group>;
      case "thunder_staff": return <><Model name="staff" height={1.9} position={[0, 0.45, 0]} /><Sparks /></>;
      default: return <Model name="sword_2handed" height={1.4} position={[0, 0.45, 0]} />;
    }
  })();
  return (
    <group>
      <Pedestal w={size} />
      <group ref={spin}>{inner}</group>
      {lights && <pointLight position={[0, 1.6, 0]} intensity={2} distance={3.5} color={code === "thunder_staff" ? "#fde047" : code === "love_cannon" ? "#f472b6" : "#fb923c"} />}
    </group>
  );
}

/** Đồ trang trí theo `stats.model`; flag / tower_A / well đổi theo màu người chơi */
export function Decor({ model, size, color }: { model: string; size: number; color: string }) {
  const c = colorVariant(color);
  const lights = useQuality().lights;
  const w = size * 2;   // mét
  const name = model === "flag" ? `flag_${c}` : model === "tower_A" ? `tower_A_${c}` : model === "well" ? "well_red" : model;
  switch (name.replace(/_(blue|red|green|yellow)$/, "")) {
    case "flag": return <Model name={name} height={2.4} />;
    case "fence_wood_straight": return <Model name={name} size={w} rotation={[0, Math.PI / 2, 0]} />;
    case "streetlight": return <><Model name={name} height={3.2} />{lights ? <pointLight position={[0, 3, 0.3]} intensity={3} distance={6} color="#fde68a" /> : <mesh position={[0, 3, 0.3]}><sphereGeometry args={[0.16, 8, 6]} /><meshBasicMaterial color="#fde68a" /></mesh>}</>;
    case "bench": case "barrel": case "wheelbarrow": case "target": case "resource_lumber": return <Model name={name} size={w * 0.7} />;
    case "bush": return <Model name={name} height={1.1} />;
    case "tree_single_A": case "tree_single_B": return <Model name={name} height={3.4} />;
    case "tower_A": return <Model name={name} size={w * 0.85} />;
    default: return <Model name={name} size={w * 0.9} />;
  }
}
