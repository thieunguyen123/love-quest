"use client";
import { Html, Instances, Instance } from "@react-three/drei";
import { RigidBody, CuboidCollider, CylinderCollider, ConeCollider } from "@react-three/rapier";
import { Countdown } from "@/components/countdown";
import { BIG_ZONES, CONES, RAMP, TREES, WORLD_HALF, bowlingPins, crateStack, type Zone } from "./data";

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

// Cây: 1 rigid body cố định nhiều collider (rẻ hơn mỗi cây 1 body)
export function Trees() {
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {TREES.map((t, i) => <CylinderCollider key={i} args={[1.5, 0.35 * t.s]} position={[t.x, 1.5, t.z]} />)}
      </RigidBody>
      {/* instancing: 70 cây chỉ tốn 3 lệnh vẽ (quan trọng cho điện thoại) */}
      <Instances limit={TREES.length} castShadow><cylinderGeometry args={[0.2, 0.28, 1.6, 6]} /><meshStandardMaterial color="#8b5a2b" flatShading />
        {TREES.map((t, i) => <Instance key={i} position={[t.x, 0.8 * t.s, t.z]} scale={t.s} />)}
      </Instances>
      {[true, false].map((pink) => (
        <Instances key={String(pink)} limit={TREES.length} castShadow><coneGeometry args={[1.2, 2.6, 7]} /><meshStandardMaterial color={pink ? "#f9a8d4" : "#3fa34d"} flatShading />
          {TREES.map((t, i) => (i % 4 === 0) === pink && <Instance key={i} position={[t.x, 2.4 * t.s, t.z]} scale={t.s} />)}
        </Instances>
      ))}
    </>
  );
}

// Khu chức năng: khu to là nhà khối có va chạm, khu nhỏ là biển báo. Đấu trường có cột cờ + đồng hồ màn (W3D-03)
export function Building({ zone, label, deadline }: { zone: Zone; label?: string; deadline?: string | null }) {
  const big = BIG_ZONES.has(zone.id);
  const w = big ? zone.r * 0.9 : 2;
  return (
    <group position={[zone.x, 0, zone.z]}>
      {big ? (
        <>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[w / 2, 2.2, w * 0.4]} position={[0, 2.2, 0]} />
            {zone.id === "arena" && <CylinderCollider args={[4, 0.2]} position={[w * 0.6, 4, 0]} />}
          </RigidBody>
          <mesh position={[0, 2.2, 0]} castShadow receiveShadow><boxGeometry args={[w, 4.4, w * 0.8]} /><meshStandardMaterial color={zone.color} flatShading /></mesh>
          <mesh position={[0, 1.2, w * 0.4 + 0.01]}><planeGeometry args={[1.6, 2.4]} /><meshStandardMaterial color="#7c4a2d" /></mesh>
          {[-1, 1].map((s) => <mesh key={s} position={[s * w * 0.28, 2.8, w * 0.4 + 0.01]}><planeGeometry args={[1.1, 1.1]} /><meshStandardMaterial color="#e0f2fe" emissive="#93c5fd" emissiveIntensity={0.3} /></mesh>)}
          <mesh position={[0, 5.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[w * 0.75, 2.2, 4]} /><meshStandardMaterial color="#be185d" flatShading /></mesh>
          {zone.id === "arena" && (
            <>
              <mesh position={[w * 0.6, 4, 0]} castShadow><cylinderGeometry args={[0.1, 0.1, 8, 8]} /><meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} /></mesh>
              <Flag x={w * 0.6} />
              <Html position={[w * 0.6, 9.4, 0]} center distanceFactor={24} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
                <div className="rounded-xl bg-red-500 px-3 py-1 text-center text-white shadow-lg whitespace-nowrap">
                  <div className="text-xs font-bold opacity-90">{label}</div>
                  {deadline && <div className="text-lg font-black tabular-nums">⏳ <Countdown deadline={deadline} /></div>}
                </div>
              </Html>
            </>
          )}
        </>
      ) : (
        <>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[0.8, 1, 0.15]} position={[0, 1, 0]} />
          </RigidBody>
          <mesh position={[0, 1.3, 0]} castShadow><boxGeometry args={[1.6, 1.4, 0.3]} /><meshStandardMaterial color={zone.color} /></mesh>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.12, 0.12, 0.6, 6]} /><meshStandardMaterial color="#6b4423" /></mesh>
        </>
      )}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[zone.r - 0.4, zone.r, 48]} /><meshBasicMaterial color={zone.color} transparent opacity={0.55} /></mesh>
      <Html position={[0, big ? 8 : 3.2, 0]} center distanceFactor={24} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
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
          <mesh castShadow receiveShadow><boxGeometry args={[1.2, 1.2, 1.2]} /><meshStandardMaterial color={i % 2 ? "#c2410c" : "#d97706"} flatShading /></mesh>
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
