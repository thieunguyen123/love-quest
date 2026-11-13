"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { createClient } from "@/lib/supabase/client";
import { MY_HOUSE, PARTNER_HOUSE, TREES, WORLD_HALF, ZONES, type Zone } from "./data";
import { nearestZone, spawnAt, stepCar, type CarState, type Keys } from "./physics";
import { House, type HouseInfo } from "./houses";

export type WorldProps = {
  meId: string; coupleKey: string; meName: string; meColor: string; partnerName: string; partnerColor: string;
  myHouse: HouseInfo; partnerHouse: HouseInfo; arenaLabel: string; arenaDeadline: string | null; coins: number; at?: string;
};
type Remote = { x: number; z: number; h: number; t: number };

function Car({ color, keys, onPos, nearest, start }: { color: string; keys: React.MutableRefObject<Keys>; onPos: (p: { x: number; z: number; h: number }) => void; nearest: React.MutableRefObject<Zone | null>; start: CarState }) {
  const g = useRef<THREE.Group>(null);
  const st = useRef<CarState>(start);
  const { camera } = useThree();
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = (st.current = stepCar(st.current, keys.current, dt));
    g.current?.position.set(s.x, 0.6, s.z); g.current?.rotation.set(0, s.h, 0);
    const target = new THREE.Vector3(s.x - Math.sin(s.h) * 13, 8.5, s.z - Math.cos(s.h) * 13);
    camera.position.lerp(target, 1 - Math.pow(0.002, dt)); camera.lookAt(s.x, 1, s.z);
    onPos({ x: s.x, z: s.z, h: s.h });
    nearest.current = nearestZone(s.x, s.z);
  });
  return <CarMesh ref={g} color={color} />;
}

import { forwardRef } from "react";
const CarMesh = forwardRef<THREE.Group, { color: string }>(function CarMesh({ color }, ref) {
  return (
    <group ref={ref}>
      <mesh castShadow position={[0, 0.3, 0]}><boxGeometry args={[1.5, 0.6, 2.8]} /><meshStandardMaterial color={color} /></mesh>
      <mesh castShadow position={[0, 0.85, -0.1]}><boxGeometry args={[1.2, 0.5, 1.4]} /><meshStandardMaterial color="#e0f2fe" /></mesh>
      {[[-0.8, 0.9], [0.8, 0.9], [-0.8, -0.9], [0.8, -0.9]].map(([x, z], i) => <mesh key={i} position={[x, 0, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.35, 0.35, 0.25, 12]} /><meshStandardMaterial color="#1f2937" /></mesh>)}
    </group>
  );
});

function Ghost({ remote, color, name }: { remote: React.MutableRefObject<Remote | null>; color: string; name: string }) {
  const g = useRef<THREE.Group>(null);
  const [online, setOnline] = useState(false);
  useFrame(() => {
    const r = remote.current;
    if (!g.current) return;
    const on = !!r && Date.now() - r.t < 5000;
    if (on !== online) setOnline(on);   // chỉ render xe + nhãn khi đang nhận được vị trí
    if (r && on) { g.current.position.lerp(new THREE.Vector3(r.x, 0.6, r.z), 0.2); g.current.rotation.y += (r.h - g.current.rotation.y) * 0.2; }
  });
  return <group ref={g}>{online && <><CarMesh color={color} /><Html position={[0, 2.4, 0]} center distanceFactor={22} style={{ pointerEvents: "none" }}><div className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-pink-700 whitespace-nowrap">💕 {name}</div></Html></>}</group>;
}

function Building({ zone, label }: { zone: Zone; label?: string }) {
  const big = zone.id === "arena" || zone.id === "library" || zone.id === "market";
  const w = big ? zone.r * 0.9 : 2;
  return (
    <group position={[zone.x, 0, zone.z]}>
      {big ? (
        <>
          <mesh position={[0, 2.2, 0]} castShadow receiveShadow><boxGeometry args={[w, 4.4, w * 0.8]} /><meshStandardMaterial color={zone.color} /></mesh>
          <mesh position={[0, 5.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[w * 0.75, 2.2, 4]} /><meshStandardMaterial color="#be185d" /></mesh>
          {zone.id === "arena" && <><mesh position={[w * 0.6, 4, 0]}><cylinderGeometry args={[0.08, 0.08, 8, 6]} /><meshStandardMaterial color="#9ca3af" /></mesh><mesh position={[w * 0.6 + 0.9, 7.2, 0]}><boxGeometry args={[1.8, 1, 0.05]} /><meshStandardMaterial color="#ef4444" /></mesh></>}
        </>
      ) : (
        <><mesh position={[0, 1, 0]} castShadow><boxGeometry args={[1.6, 2, 0.3]} /><meshStandardMaterial color={zone.color} /></mesh><mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.12, 0.12, 0.4, 6]} /><meshStandardMaterial color="#6b4423" /></mesh></>
      )}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[zone.r - 0.4, zone.r, 40]} /><meshBasicMaterial color={zone.color} transparent opacity={0.5} /></mesh>
      <Html position={[0, big ? 8.6 : 3.4, 0]} center distanceFactor={24} style={{ pointerEvents: "none" }}>
        <div className="rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-pink-700 shadow whitespace-nowrap">{zone.emoji} {zone.name}{label ? ` · ${label}` : ""}</div>
      </Html>
    </group>
  );
}

function Scenery() {
  const trees = useMemo(() => TREES, []);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[WORLD_HALF * 2 + 20, WORLD_HALF * 2 + 20]} /><meshStandardMaterial color="#86d78a" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><planeGeometry args={[7, WORLD_HALF * 2]} /><meshStandardMaterial color="#d9c9a8" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 8]}><planeGeometry args={[WORLD_HALF * 2, 6]} /><meshStandardMaterial color="#d9c9a8" /></mesh>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 0.8, 0]} castShadow><cylinderGeometry args={[0.2, 0.28, 1.6, 6]} /><meshStandardMaterial color="#8b5a2b" /></mesh>
          <mesh position={[0, 2.4, 0]} castShadow><coneGeometry args={[1.2, 2.6, 7]} /><meshStandardMaterial color={i % 4 === 0 ? "#f9a8d4" : "#3fa34d"} /></mesh>
        </group>
      ))}
    </>
  );
}

export default function World3D(p: WorldProps) {
  const router = useRouter();
  const keys = useRef<Keys>({ up: false, down: false, left: false, right: false });
  const nearest = useRef<Zone | null>(null);
  const remote = useRef<Remote | null>(null);
  const lastSend = useRef(0);
  const chan = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const [near, setNear] = useState<Zone | null>(null);
  const start = useMemo(() => spawnAt(p.at), [p.at]);

  useEffect(() => {
    const map: Record<string, keyof Keys> = { w: "up", ArrowUp: "up", s: "down", ArrowDown: "down", a: "left", ArrowLeft: "left", d: "right", ArrowRight: "right" };
    const dn = (e: KeyboardEvent) => { const k = map[e.key]; if (k) { keys.current[k] = true; e.preventDefault(); } if ((e.key === "e" || e.key === "E" || e.key === "Enter") && nearest.current) router.push(nearest.current.href); };
    const up = (e: KeyboardEvent) => { const k = map[e.key]; if (k) keys.current[k] = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    const iv = setInterval(() => setNear((n) => (n?.id === nearest.current?.id ? n : nearest.current)), 150);
    // Người ấy lái xe: gửi/nhận vị trí qua Supabase Realtime Broadcast (W3D-03)
    const sb = createClient();
    const ch = sb.channel(`world-${p.coupleKey}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "pos" }, ({ payload }) => { if (payload.id !== p.meId) remote.current = { x: payload.x, z: payload.z, h: payload.h, t: Date.now() }; }).subscribe();
    chan.current = ch;
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); clearInterval(iv); void sb.removeChannel(ch); };
  }, [router, p.coupleKey, p.meId]);

  const onPos = (pos: { x: number; z: number; h: number }) => {
    const now = Date.now();
    if (now - lastSend.current > 200) { lastSend.current = now; void chan.current?.send({ type: "broadcast", event: "pos", payload: { id: p.meId, ...pos } }); }
  };
  const hold = (k: keyof Keys) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); keys.current[k] = true; },
    onPointerUp: () => { keys.current[k] = false; }, onPointerLeave: () => { keys.current[k] = false; }, onPointerCancel: () => { keys.current[k] = false; },
  });
  const pad = "h-14 w-14 rounded-full bg-white/80 border-2 border-pink-300 text-2xl font-extrabold text-pink-700 active:bg-pink-200 select-none touch-none";

  return (
    <div className="relative h-[calc(100vh-7rem)] min-h-96 rounded-2xl overflow-hidden border border-love-200 bg-sky-200">
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 9, 28], fov: 55 }}>
        <color attach="background" args={["#bfe3ff"]} />
        <fog attach="fog" args={["#bfe3ff", 50, 140]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[30, 50, 20]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} />
        <Scenery />
        {ZONES.map((z) => <Building key={z.id} zone={z} label={z.id === "arena" ? p.arenaLabel : undefined} />)}
        <House x={MY_HOUSE.x} z={MY_HOUSE.z} info={p.myHouse} />
        <House x={PARTNER_HOUSE.x} z={PARTNER_HOUSE.z} info={p.partnerHouse} />
        <Car color={p.meColor} keys={keys} onPos={onPos} nearest={nearest} start={start} />
        <Ghost remote={remote} color={p.partnerColor} name={p.partnerName} />
      </Canvas>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
        <div className="rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-amber-700 shadow">🪙 {p.coins.toLocaleString("vi-VN")}</div>
        {p.arenaDeadline && <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-amber-700 shadow">🏆 {p.arenaLabel}</div>}
        <div className="hidden sm:block rounded-xl bg-white/80 px-3 py-1 text-xs font-semibold text-pink-800">WASD / mũi tên để lái · E để vào</div>
      </div>
      {near && (
        <button onClick={() => router.push(near.href)} className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-2xl bg-pink-500 px-5 py-3 text-white font-extrabold shadow-xl sm:bottom-6">
          {near.emoji} Nhấn E / chạm để vào {near.name}
        </button>
      )}
      <div className="absolute bottom-4 left-4 grid grid-cols-3 gap-1 sm:hidden">
        <span /><button aria-label="Tiến" className={pad} {...hold("up")}>▲</button><span />
        <button aria-label="Trái" className={pad} {...hold("left")}>◀</button><button aria-label="Lùi" className={pad} {...hold("down")}>▼</button><button aria-label="Phải" className={pad} {...hold("right")}>▶</button>
      </div>
    </div>
  );
}
