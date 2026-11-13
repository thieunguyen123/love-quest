"use client";
// Nhà 2 người trong làng 3D (W3D-03): mô hình theo cấp & màu, khói/đổ nát, khiên, thú cưng đi dạo, lính gác, bị tấn công thì rung + nổ
import { Suspense, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { HouseModel, HOUSE_NAMES, Model } from "@/components/three/models";
import { Pet } from "@/components/three/pets";
import { Squad } from "@/components/three/units";

export type HouseInfo = {
  name: string; level: number; hpPct: number; shield: boolean; color: string; exists: boolean;
  pets: { code: string; level: number; nickname: string }[];
  squads: { unit: string; qty: number }[];
};
export const HOUSE_LOT = 10;   // cạnh nền nhà trong làng (mét)

function Burst({ hitRef }: { hitRef: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const k = 1 - (hitRef.current ?? 0);   // hitRef: 1 → 0 sau khi bị đánh
    g.current.visible = (hitRef.current ?? 0) > 0;
    g.current.scale.setScalar(2 + k * 9);
    ((g.current.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
  });
  return <group ref={g} position={[0, 4, 0]} visible={false}><mesh><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#fb923c" transparent depthWrite={false} /></mesh></group>;
}

export function House({ x, z, info, hitRef }: { x: number; z: number; info: HouseInfo; hitRef?: React.RefObject<number> }) {
  const ruined = info.exists && info.hpPct <= 0;
  const face = x < 0 ? 0.6 : -0.6;   // quay mặt về phía đường giữa làng
  const shake = useRef(0);
  useFrame((_, dt) => { if (hitRef) { shake.current = hitRef.current ?? 0; if ((hitRef.current ?? 0) > 0) hitRef.current = Math.max(0, (hitRef.current ?? 0) - dt * 0.5); } });
  return (
    <group position={[x, 0, z]} rotation={[0, face, 0]}>
      {info.exists ? <HouseModel level={info.level} color={info.color} hpPct={info.hpPct} shield={info.shield} size={HOUSE_LOT} shakeRef={shake} />
        : <Model name="scaffolding" size={HOUSE_LOT * 0.8} />}
      {hitRef && <Burst hitRef={hitRef} />}
      {/* lính gác đứng 2 bên cửa, thú cưng đi dạo quanh nhà */}
      {!ruined && info.squads.slice(0, 2).map((s, i) => (
        <group key={s.unit} position={[(i ? 1 : -1) * (HOUSE_LOT / 2 + 1.6), 0, HOUSE_LOT / 2 + 0.8]} rotation={[0, 0, 0]}>
          <Suspense fallback={null}><Squad unit={s.unit} qty={s.qty} width={3} height={1.9} tint={info.color} /></Suspense>
        </group>
      ))}
      {info.pets.map((p, i) => (
        <group key={p.code} rotation={[0, (i * Math.PI * 2) / Math.max(1, info.pets.length), 0]}>
          <Pet code={p.code} level={p.level} name={p.nickname} wander={HOUSE_LOT / 2 + 2.2 + (i % 2) * 1.2} sad={ruined} phase={i * 1.7} scale={1.5} />
        </group>
      ))}
      <Html position={[0, HOUSE_LOT * 1.15 + 1, 0]} center distanceFactor={26} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-extrabold text-pink-700 shadow whitespace-nowrap">
          🏠 {info.name} · {info.exists ? `${HOUSE_NAMES[info.level]} (cấp ${info.level})` : "chưa dựng nhà"}{info.shield ? " 🛡️" : ""}{ruined ? " 💥" : ""}
        </div>
      </Html>
    </group>
  );
}
