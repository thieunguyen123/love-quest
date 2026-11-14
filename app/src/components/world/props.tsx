"use client";
import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Instances, Instance } from "@react-three/drei";
import * as THREE from "three";
import { Model } from "@/components/three/models";
import { InstancedModel, type Inst } from "@/components/three/quality";
import { RigidBody, CuboidCollider, CylinderCollider, ConeCollider } from "@react-three/rapier";
import { Countdown } from "@/components/countdown";
import { CONES, RAMP, TREES, WORLD_HALF, ZONE_MODELS, bowlingPins, crateStack, type Zone } from "./data";

const GROUND = "#86d78a", ROAD = "#d9c9a8";

const FENCES: [number, number, number][] = [[0, -WORLD_HALF, 0], [0, WORLD_HALF, 0], [-WORLD_HALF, 0, Math.PI / 2], [WORLD_HALF, 0, Math.PI / 2]];

// Mặt đất + đường + hàng rào bao quanh (không lái ra ngoài được)
export function Ground() {
  const L = WORLD_HALF * 2;
  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[WORLD_HALF + 20, 0.5, WORLD_HALF + 20]} position={[0, -0.5, 0]} />
        {[[0, -WORLD_HALF - 0.5, L / 2 + 1, 0.5], [0, WORLD_HALF + 0.5, L / 2 + 1, 0.5], [-WORLD_HALF - 0.5, 0, 0.5, L / 2 + 1], [WORLD_HALF + 0.5, 0, 0.5, L / 2 + 1]].map(([x, z, hx, hz], i) => (
          <CuboidCollider key={i} args={[hx, 2, hz]} position={[x, 2, z]} />
        ))}
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[L + 60, L + 60]} /><meshStandardMaterial color={GROUND} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow><planeGeometry args={[7, L]} /><meshStandardMaterial color={ROAD} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 8]} receiveShadow><planeGeometry args={[L, 6]} /><meshStandardMaterial color={ROAD} /></mesh>
      {/* vạch giữa đường */}
      <Instances limit={28}><planeGeometry args={[0.25, 1.8]} /><meshBasicMaterial color="#fff7ed" />
        {Array.from({ length: 28 }).map((_, i) => <Instance key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -WORLD_HALF + 2 + i * 4.2]} />)}
      </Instances>
      {/* hàng rào gỗ */}
      <Instances limit={8}><boxGeometry args={[L, 0.18, 0.18]} /><meshStandardMaterial color="#a16207" />
        {FENCES.flatMap(([x, z, r], i) => [0.9, 0.45].map((y) => <Instance key={`${i}-${y}`} position={[x, y, z]} rotation={[0, r, 0]} />))}
      </Instances>
      <Instances limit={120}><boxGeometry args={[0.3, 1.2, 0.3]} /><meshStandardMaterial color="#854d0e" />
        {FENCES.flatMap(([x, z, r], i) => Array.from({ length: 30 }).map((_, j) => {
          const t = -L / 2 + j * (L / 29);
          return <Instance key={`${i}-${j}`} position={[x + Math.cos(r) * t, 0.6, z - Math.sin(r) * t]} />;
        }))}
      </Instances>
    </>
  );
}

// Cây KayKit: 1 rigid body cố định nhiều collider; 1/4 số cây nhuộm hồng cho "Làng Tình Yêu"
const TREE_MODELS = ["tree_single_A", "tree_single_B", "trees_A_medium", "tree_single_A", "trees_B_medium", "tree_single_B"];
export function Trees() {
  // gộp 70 cây thành vài InstancedMesh (SYS-05): mỗi loại mô hình 1 nhóm
  const groups = useMemo(() => {
    const out: Record<string, Inst[]> = {};
    TREES.forEach((t, i) => {
      const m = TREE_MODELS[i % 6];
      (out[m] ??= []).push({ x: t.x, z: t.z, s: (m.startsWith("trees_") ? 4.6 : 5) * t.s, rot: i * 1.7, tint: i % 4 === 0 ? "#ffc2e0" : undefined });
    });
    return Object.entries(out);
  }, []);
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {TREES.map((t, i) => <CylinderCollider key={i} args={[1.5, (TREE_MODELS[i % 6].startsWith("trees_") ? 1.4 : 0.45) * t.s]} position={[t.x, 1.5, t.z]} />)}
      </RigidBody>
      {groups.map(([m, items]) => <Suspense key={m} fallback={null}><InstancedModel name={m} items={items} fit={m.startsWith("trees_") ? "size" : "height"} /></Suspense>)}
    </>
  );
}

export function Backdrop() {
  const L = WORLD_HALF;
  const mountains = Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2; const d = L + 22 + (i % 3) * 8; return { x: Math.cos(a) * d, z: Math.sin(a) * d, s: 26 + (i % 4) * 6, r: i * 0.9, m: i % 2 ? "mountain_A_grass_trees" : "mountain_B_grass_trees" }; });
  return (
    <>
      {mountains.map((m, i) => <Suspense key={i} fallback={null}><Model name={m.m} size={m.s} position={[m.x, -0.5, m.z]} rotation={[0, m.r, 0]} /></Suspense>)}
      <Clouds />
    </>
  );
}
function Clouds() {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (!g.current) return; g.current.children.forEach((c, i) => { c.position.x += dt * (0.8 + (i % 3) * 0.3); if (c.position.x > WORLD_HALF + 40) c.position.x = -WORLD_HALF - 40; }); });
  return (
    <group ref={g}>
      {Array.from({ length: 9 }, (_, i) => (
        <group key={i} position={[-WORLD_HALF + i * 14, 26 + (i % 3) * 5, -WORLD_HALF + ((i * 37) % 110)]}>
          <Suspense fallback={null}><Model name={i % 2 ? "cloud_big" : "cloud_small"} size={10 + (i % 3) * 4} shadows={false} /></Suspense>
        </group>
      ))}
    </group>
  );
}

// Khu chức năng = nhà KayKit có va chạm (W3D-02). Đấu trường có cột cờ + đồng hồ màn (W3D-03)
export function Building({ zone, label, deadline }: { zone: Zone; label?: string; deadline?: string | null }) {
  const [model, size] = ZONE_MODELS[zone.id] ?? ["tower_B_red", 6];
  const half = size * 0.42;
  return (
    <group position={[zone.x, 0, zone.z]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[half, 3, half]} position={[0, 3, 0]} />
        {zone.id === "arena" && <CylinderCollider args={[4, 0.25]} position={[size * 0.62, 4, 0]} />}
      </RigidBody>
      <Suspense fallback={null}><Model name={model} size={size} rotation={[0, zone.x < 0 ? Math.PI / 2 : zone.x > 0 ? -Math.PI / 2 : 0, 0]} /></Suspense>
      {zone.id === "arena" && (
        <>
          <mesh position={[size * 0.62, 4, 0]} castShadow><cylinderGeometry args={[0.12, 0.12, 8, 8]} /><meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} /></mesh>
          <Flag x={size * 0.62} />
          <Html position={[size * 0.62, 9.6, 0]} center distanceFactor={24} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div className="rounded-xl bg-red-500 px-3 py-1 text-center text-white shadow-lg whitespace-nowrap">
              <div className="text-xs font-bold opacity-90">{label}</div>
              {deadline && <div className="text-lg font-black tabular-nums">⏳ <Countdown deadline={deadline} /></div>}
            </div>
          </Html>
        </>
      )}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[zone.r - 0.4, zone.r, 48]} /><meshBasicMaterial color={zone.color} transparent opacity={0.55} /></mesh>
      <Html position={[0, size * 0.95 + 1.5, 0]} center distanceFactor={24} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-pink-700 shadow whitespace-nowrap">{zone.emoji} {zone.name}</div>
      </Html>
    </group>
  );
}

function Flag({ x }: { x: number }) {
  return <mesh position={[x + 0.9, 7.3, 0]} castShadow><boxGeometry args={[1.8, 1.1, 0.05]} /><meshStandardMaterial color="#ef4444" side={2} /></mesh>;
}

// Dốc nhảy: tấm ván nghiêng, lên theo hướng +z
export function Ramp() {
  const { x, z, w, len, height } = RAMP;
  const ang = Math.atan2(height, len), L = Math.hypot(height, len), th = 0.4;
  const cy = height / 2 - (th / 2) / Math.cos(ang);
  return (
    <group>
      <RigidBody type="fixed" colliders={false} friction={0.2}>
        <CuboidCollider args={[w / 2, th / 2, L / 2]} position={[x, cy, z]} rotation={[-ang, 0, 0]} />
        <CuboidCollider args={[w / 2, height / 2, 0.2]} position={[x, height / 2, z + len / 2]} />
      </RigidBody>
      <mesh position={[x, cy, z]} rotation={[-ang, 0, 0]} castShadow receiveShadow><boxGeometry args={[w, th, L]} /><meshStandardMaterial color="#f59e0b" /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[x + s * (w / 2 - 0.3), cy + 0.22, z]} rotation={[-ang, 0, 0]}><boxGeometry args={[0.4, 0.05, L]} /><meshStandardMaterial color="#fff" /></mesh>)}
      <mesh position={[x, height / 2, z + len / 2]} castShadow><boxGeometry args={[w, height, 0.4]} /><meshStandardMaterial color="#b45309" /></mesh>
      <Html position={[x, height + 2.4, z]} center distanceFactor={24} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded-full bg-amber-400 px-3 py-1 text-sm font-extrabold text-amber-950 shadow whitespace-nowrap">🚀 Dốc nhảy · giữ Shift!</div>
      </Html>
    </group>
  );
}

// Ky bowling, chồng thùng, cọc giao thông: tông vào là đổ (vật thể động)
export function Toys() {
  return (
    <>
      {bowlingPins().map((p, i) => (
        <RigidBody key={`pin${i}`} colliders={false} position={[p.x, 0.6, p.z]} density={0.4} linearDamping={0.3} angularDamping={0.3}>
          <CylinderCollider args={[0.6, 0.22]} />
          <mesh castShadow><cylinderGeometry args={[0.15, 0.24, 1.2, 12]} /><meshStandardMaterial color="#ffffff" /></mesh>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.16, 0.17, 0.12, 12]} /><meshStandardMaterial color="#ef4444" /></mesh>
        </RigidBody>
      ))}
      {crateStack().map((c, i) => (
        <RigidBody key={`crate${i}`} colliders={false} position={[c.x, c.y, c.z]} density={0.3}>
          <CuboidCollider args={[0.6, 0.6, 0.6]} />
          <Suspense fallback={<mesh castShadow><boxGeometry args={[1.2, 1.2, 1.2]} /><meshStandardMaterial color="#d97706" /></mesh>}><Model name={i % 2 ? "crate_A_big" : "crate_B_big"} size={1.2} position={[0, -0.6, 0]} /></Suspense>
        </RigidBody>
      ))}
      {CONES.map((c, i) => (
        <RigidBody key={`cone${i}`} colliders={false} position={[c.x, 0.5, c.z]} density={0.3}>
          <ConeCollider args={[0.5, 0.35]} />
          <mesh castShadow><coneGeometry args={[0.35, 1, 10]} /><meshStandardMaterial color="#f97316" /></mesh>
          <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.2, 0.25, 0.14, 10]} /><meshStandardMaterial color="#ffffff" /></mesh>
        </RigidBody>
      ))}
      <Html position={[20, 2.6, 41]} center distanceFactor={24} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-pink-700 shadow whitespace-nowrap">🎳 Bowling</div>
      </Html>
    </>
  );
}
