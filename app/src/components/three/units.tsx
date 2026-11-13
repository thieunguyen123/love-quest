"use client";
// Quân đội 3D: lính (nhân vật KayKit có hoạt ảnh) + máy bắn đá tự thiết kế. Mỗi loại lính = 1 đội trên lưới căn cứ.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useAnimations, useGLTF } from "@react-three/drei";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { modelUrl } from "./models";

export type Anim = "idle" | "walk" | "run" | "attack" | "cheer" | "hit" | "dead";
type UnitDef = { model: string; keep: string[]; attack: string; ranged: boolean; range: number; projectile: "arrow" | "stone" | null };
// Phụ kiện được giữ lại trên người (còn lại ẩn đi): mỗi loại lính cầm đúng vũ khí của mình
export const UNIT_DEFS: Record<string, UnitDef> = {
  sword: { model: "knight", keep: ["1H_Sword", "Round_Shield", "Knight_Helmet", "Knight_Cape"], attack: "1H_Melee_Attack_Chop", ranged: false, range: 1.2, projectile: null },
  archer: { model: "rogue", keep: ["2H_Crossbow", "Rogue_Cape"], attack: "2H_Ranged_Shoot", ranged: true, range: 9, projectile: "arrow" },
  knight: { model: "barbarian", keep: ["2H_Axe", "Barbarian_Hat", "Barbarian_Cape"], attack: "2H_Melee_Attack_Chop", ranged: false, range: 1.6, projectile: null },
  catapult: { model: "", keep: [], attack: "", ranged: true, range: 14, projectile: "stone" },
};
const ACCESSORIES = ["1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "1H_Sword", "2H_Sword", "Knight_Helmet", "Knight_Cape",
  "Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Knife", "Throwable", "Rogue_Cape", "1H_Axe_Offhand", "Barbarian_Round_Shield", "1H_Axe", "2H_Axe", "Mug", "Barbarian_Hat", "Barbarian_Cape",
  "Spellbook", "Spellbook_open", "1H_Wand", "2H_Staff", "Mage_Hat", "Mage_Cape"];
const CLIP: Record<Exclude<Anim, "attack">, string> = { idle: "Idle", walk: "Walking_A", run: "Running_A", cheer: "Cheer", hit: "Hit_A", dead: "Death_A" };

/** 1 người lính có hoạt ảnh. `phase` lệch nhịp để cả đội không cử động y hệt nhau */
export function Soldier({ unit, anim = "idle", height = 1.7, phase = 0, tint }: { unit: string; anim?: Anim; height?: number; phase?: number; tint?: string }) {
  const def = UNIT_DEFS[unit] ?? UNIT_DEFS.sword;
  const { scene, animations } = useGLTF(modelUrl(def.model));
  const root = useRef<THREE.Group>(null);
  const obj = useMemo(() => {
    const c = skeletonClone(scene) as THREE.Group;
    c.traverse((o) => {
      if (ACCESSORIES.includes(o.name)) o.visible = def.keep.includes(o.name);
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true; m.frustumCulled = false;
        if (tint && /Cape/.test(o.name)) { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.set(tint); }
      }
    });
    return c;
  }, [scene, def, tint]);
  // nhân vật KayKit cao ~2.4 đơn vị kể cả mũ → co về `height` mét
  const s = height / 2.35;
  const { actions } = useAnimations(animations, root);
  useEffect(() => {
    const name = anim === "attack" ? def.attack : CLIP[anim];
    const a = actions[name]; if (!a) return;
    a.reset();
    if (anim === "dead") { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.time = (phase * 0.37) % Math.max(0.1, a.getClip().duration);
    a.fadeIn(0.25).play();
    return () => { a.fadeOut(0.25); };
  }, [actions, anim, def, phase]);
  return <group ref={root} scale={s}><primitive object={obj} /></group>;
}

/** Máy bắn đá thiết kế bằng khối cơ bản: khung gỗ, 4 bánh, cánh tay có gàu; `firing` → cánh tay vung theo nhịp */
export function Catapult({ firing = false, phase = 0, scale = 1 }: { firing?: boolean; phase?: number; scale?: number }) {
  const arm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!arm.current) return;
    if (!firing) { arm.current.rotation.x = -0.9; return; }
    const t = ((clock.elapsedTime + phase) % 2.2) / 2.2;   // 0..1: kéo về (chậm) → bung (nhanh)
    arm.current.rotation.x = t < 0.75 ? -0.9 - (t / 0.75) * 0.5 : -1.4 + ((t - 0.75) / 0.25) * 2.2;
  });
  const wood = "#8b5a2b", dark = "#5b3a1e";
  return (
    <group scale={scale}>
      {[-0.55, 0.55].map((x) => <mesh key={x} position={[x, 0.45, 0]} castShadow><boxGeometry args={[0.18, 0.18, 2]} /><meshStandardMaterial color={wood} /></mesh>)}
      {[-0.7, 0.7].map((z) => <mesh key={z} position={[0, 0.45, z]} castShadow><boxGeometry args={[1.3, 0.16, 0.16]} /><meshStandardMaterial color={wood} /></mesh>)}
      {[[-0.68, -0.7], [0.68, -0.7], [-0.68, 0.7], [0.68, 0.7]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.32, z]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.32, 0.32, 0.12, 12]} /><meshStandardMaterial color={dark} /></mesh>
      ))}
      {[-0.45, 0.45].map((x) => <mesh key={`p${x}`} position={[x, 0.95, -0.2]} rotation={[0.25, 0, 0]} castShadow><boxGeometry args={[0.14, 1, 0.14]} /><meshStandardMaterial color={wood} /></mesh>)}
      <mesh position={[0, 1.4, -0.32]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.07, 0.07, 1.05, 8]} /><meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} /></mesh>
      <group ref={arm} position={[0, 0.62, 0.15]} rotation={[-0.9, 0, 0]}>
        <mesh position={[0, 0.85, 0]} castShadow><boxGeometry args={[0.14, 1.8, 0.14]} /><meshStandardMaterial color={wood} /></mesh>
        <mesh position={[0, 1.78, 0.05]} castShadow><cylinderGeometry args={[0.26, 0.18, 0.18, 10, 1, true]} /><meshStandardMaterial color={dark} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 1.8, 0.05]}><dodecahedronGeometry args={[0.17, 0]} /><meshStandardMaterial color="#9ca3af" flatShading /></mesh>
      </group>
    </group>
  );
}

/** Vị trí từng người trong đội (đội chiếm ô vuông `w` mét) */
export function squadOffsets(n: number, w: number): [number, number][] {
  const k = Math.min(4, Math.max(1, n));
  const d = w * 0.22;
  return ([[-d, -d], [d, d], [d, -d], [-d, d]] as [number, number][]).slice(0, k);
}

/** 1 đội lính trên ô 2×2: tối đa 4 người + nhãn số lượng */
export function Squad({ unit, qty, anim = "idle", width = 4, label = true, tint, height = 1.7 }: { unit: string; qty: number; anim?: Anim; width?: number; label?: boolean; tint?: string; height?: number }) {
  const offs = squadOffsets(unit === "catapult" ? 1 : qty, width);
  return (
    <group>
      {offs.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          {unit === "catapult" ? <Catapult firing={anim === "attack"} phase={i * 0.4} scale={width / 3.2} /> : <Soldier unit={unit} anim={anim} phase={i} height={height} tint={tint} />}
        </group>
      ))}
      {label && (
        <Html position={[0, unit === "catapult" ? 2.6 : height + 0.6, 0]} center distanceFactor={18} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold text-slate-800 shadow whitespace-nowrap">×{qty}</div>
        </Html>
      )}
    </group>
  );
}
