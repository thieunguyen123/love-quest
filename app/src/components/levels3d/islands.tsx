"use client";
// LVL-01: bản đồ màn chơi dạng QUẦN ĐẢO 3D — mỗi màn 1 hòn đảo, cầu đá nối theo thứ tự, trạng thái hiện ngay trên đảo.
// Tối ưu điện thoại (SYS-05): thân đảo, đá cầu, cây, cờ đều là InstancedMesh; nhãn là sprite; không có bóng đổ động.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import * as THREE from "three";
import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { Model, colorVariant, Heart, roofColor } from "@/components/three/models";
import { Badge, GameCanvas, InstancedModel, useQuality, type Inst } from "@/components/three/quality";

export type IslandLevel = {
  order_no: number; topic_vi: string; topic_en: string; cefr: string; status: "LOCKED" | "OPEN" | "COUNTDOWN" | "CLOSED";
  deadline_at: string | null; reward_multiplier: number; win_coins: number; question_count: number;
  is_draw: boolean; winner: { name: string; color: string } | null;
};

// công trình trên từng đảo (Quaternius Fantasy RTS, tô bảng màu cute) — lớn dần theo màn
const LANDMARKS = ["house_l0", "house_l1", "def_tower_wood", "house_l2", "house_l1", "house_l3", "def_tower", "house_l2", "house_l3", "house_l4",
  "def_tower_wood", "house_l3", "house_l4", "def_tower", "house_l4", "house_l3", "house_l5", "house_l4", "def_tower", "house_l5"];
const ROOFS = ["#f05a5a", "#4f8ef7", "#f7a33b", "#a77bf3", "#ff7eb6", "#3fbf7f"];
const BIOME: Record<string, { grass: string; sand: string; tree: string | undefined }> = {
  A1: { grass: "#86d860", sand: "#f7e3a6", tree: undefined }, A2: { grass: "#a5dc6b", sand: "#ffe9a8", tree: "#d8f5a0" },
  B1: { grass: "#e3b352", sand: "#e8cf9a", tree: "#f7a23b" }, B2: { grass: "#eef4f8", sand: "#cfdde6", tree: "#dff1ff" }, C1: { grass: "#c9a7f5", sand: "#e3d2f8", tree: "#f0a6e8" },
};
const GREY = { grass: "#aab3ba", sand: "#c3c9cd", tree: "#98a2a9" };
const STATUS_TXT: Record<IslandLevel["status"], string> = { LOCKED: "🔒 Chưa mở", OPEN: "▶ Đang mở — vào thi đấu!", COUNTDOWN: "⏳ Đang đếm ngược", CLOSED: "👑 Đã đóng" };

/** Vị trí đảo thứ i (đường uốn lượn đi dần về phía xa) */
export const islandPos = (i: number) => ({ x: Math.sin(i * 1.1) * 12 + (i % 2 ? 3 : -3), z: -i * 14 });
const radiusOf = (l: IslandLevel) => (l.reward_multiplier > 1 ? 7 : 5);

function Bodies({ levels }: { levels: IslandLevel[] }) {
  const top = useRef<THREE.InstancedMesh>(null), shore = useRef<THREE.InstancedMesh>(null), rock = useRef<THREE.InstancedMesh>(null), stones = useRef<THREE.InstancedMesh>(null);
  const nStones = (levels.length - 1) * 5;
  const cone = useMemo(() => new THREE.ConeGeometry(1, 3.2, 9).rotateX(Math.PI), []);
  useEffect(() => {
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Qn = new THREE.Quaternion(), S = new THREE.Vector3(), C = new THREE.Color();
    levels.forEach((l, i) => {
      const p = islandPos(i), R = radiusOf(l), b = l.status === "LOCKED" ? GREY : BIOME[l.cefr] ?? BIOME.A1;
      top.current?.setMatrixAt(i, M.compose(P.set(p.x, 0, p.z), Qn, S.set(R, 1, R))); top.current?.setColorAt(i, C.set(b.grass));
      shore.current?.setMatrixAt(i, M.compose(P.set(p.x, -0.42, p.z), Qn, S.set(R, 1, R))); shore.current?.setColorAt(i, C.set(b.sand));
      rock.current?.setMatrixAt(i, M.compose(P.set(p.x, -2.1, p.z), Qn, S.set(R * 0.98, 1, R * 0.98))); rock.current?.setColorAt(i, C.set(l.status === "LOCKED" ? "#8d959b" : "#9a7b5c"));
      if (i < levels.length - 1) {
        const n = islandPos(i + 1), open = levels[i + 1].status !== "LOCKED";
        for (let k = 0; k < 5; k++) {
          const t = (k + 1) / 6, a = radiusOf(l) / 14, bb = 1 - radiusOf(levels[i + 1]) / 14, u = a + (bb - a) * t;
          stones.current?.setMatrixAt(i * 5 + k, M.compose(P.set(p.x + (n.x - p.x) * u, -0.55, p.z + (n.z - p.z) * u), Qn, S.set(1, 1, 1)));
          stones.current?.setColorAt(i * 5 + k, C.set(open ? "#fff3c4" : "#9aa3a9"));
        }
      }
    });
    for (const m of [top, shore, rock, stones]) { const o = m.current; if (!o) continue; o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; o.computeBoundingSphere(); }
  }, [levels]);
  return (
    <>
      <instancedMesh ref={top} args={[undefined, undefined, levels.length]}><cylinderGeometry args={[1, 1.04, 0.7, 12]} /><meshStandardMaterial flatShading /></instancedMesh>
      <instancedMesh ref={shore} args={[undefined, undefined, levels.length]}><cylinderGeometry args={[1.14, 1.02, 0.25, 12]} /><meshStandardMaterial flatShading /></instancedMesh>
      <instancedMesh ref={rock} args={[cone, undefined, levels.length]}><meshStandardMaterial flatShading /></instancedMesh>
      <instancedMesh ref={stones} args={[undefined, undefined, Math.max(1, nStones)]}><cylinderGeometry args={[0.75, 0.6, 0.3, 7]} /><meshStandardMaterial flatShading /></instancedMesh>
    </>
  );
}

/** Cột sáng + mũi tên nhún nhảy trên đảo đang chơi */
function Beacon({ x, z, y }: { x: number; z: number; y: number }) {
  const arrow = useRef<THREE.Group>(null), beam = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (arrow.current) { arrow.current.position.y = y + 1.2 + Math.abs(Math.sin(clock.elapsedTime * 3)) * 1.2; arrow.current.rotation.y = clock.elapsedTime * 2; }
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(clock.elapsedTime * 2.5) * 0.07;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh ref={beam} position={[0, 9, 0]}><cylinderGeometry args={[1.5, 2.6, 18, 16, 1, true]} /><meshBasicMaterial color="#fde047" transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      <group ref={arrow}><mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.8, 1.5, 4]} /><meshBasicMaterial color="#f43f5e" /></mesh></group>
    </group>
  );
}
function Ring({ x, z, r }: { x: number; z: number; r: number }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (m.current) { const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.04; m.current.scale.set(s, s, 1); } });
  return <mesh ref={m} position={[x, 0.42, z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[r + 0.5, r + 0.95, 40]} /><meshBasicMaterial color="#f43f5e" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} /></mesh>;
}

/** Camera lướt trên bản đồ: chỉ kéo (pan) + zoom, giới hạn trong vùng có đảo; bay tới đảo được chọn */
function Rig({ fly, zMin }: { fly: React.RefObject<{ x: number; z: number } | null>; zMin: number }) {
  const controls = useThree((s) => s.controls) as unknown as MapControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const d = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    if (!controls) return;
    const t = controls.target;
    if (fly.current) {
      d.set(fly.current.x - t.x, 0, fly.current.z + 2 - t.z);
      if (d.lengthSq() < 0.05) fly.current = null;
      d.multiplyScalar(Math.min(1, dt * 5)); t.add(d); camera.position.add(d);
    }
    const cx = Math.max(-22, Math.min(22, t.x)), cz = Math.max(zMin - 8, Math.min(10, t.z));
    if (cx !== t.x || cz !== t.z) { d.set(cx - t.x, 0, cz - t.z); t.add(d); camera.position.add(d); }
  });
  return null;
}

function DevHook({ n, select }: { n: number; select: (i: number) => void }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const project = (i: number) => { const p = islandPos(i), v = new THREE.Vector3(p.x, 0.4, p.z).project(camera); return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height }; };
    (window as unknown as { __islands: unknown }).__islands = { n, project, select };
  });
  return null;
}

export default function Islands({ levels, paused = false }: { levels: IslandLevel[]; paused?: boolean }) {
  const Q = useQuality();
  const current = Math.max(0, levels.findIndex((l) => l.status === "OPEN" || l.status === "COUNTDOWN"));
  const start = levels.some((l) => l.status === "OPEN" || l.status === "COUNTDOWN") ? current : Math.max(0, levels.filter((l) => l.status === "CLOSED").length - 1);
  const [sel, setSel] = useState(start);
  const fly = useRef<{ x: number; z: number } | null>(null);
  const select = useCallback((i: number) => { setSel(i); fly.current = islandPos(i); }, []);
  const p0 = islandPos(start);
  const zMin = islandPos(levels.length - 1).z;

  // cây + cờ: gộp theo mô hình
  const { trees, flags, clouds } = useMemo(() => {
    const trees: Record<string, Inst[]> = {}, flags: Record<string, Inst[]> = {}, clouds: Inst[] = [];
    let seed = 99; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    levels.forEach((l, i) => {
      const p = islandPos(i), R = radiusOf(l), b = l.status === "LOCKED" ? GREY : BIOME[l.cefr] ?? BIOME.A1;
      const n = Q.tier === "high" ? 4 : 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd() * 1.2 + 0.6, d = R * (0.62 + rnd() * 0.2);
        (trees[k % 2 ? "tree_single_A" : "tree_single_B"] ??= []).push({ x: p.x + Math.cos(a) * d, y: 0.35, z: p.z + Math.sin(a) * d, s: 1.1 + rnd() * 0.7, rot: rnd() * 6, tint: b.tree });
      }
      if (l.status === "CLOSED" && l.winner && !l.is_draw) (flags[`flag_${colorVariant(l.winner.color)}`] ??= []).push({ x: p.x + R * 0.55, y: 0.35, z: p.z + R * 0.45, s: 1.6 });
      if (Q.tier === "high" && i % 3 === 0) clouds.push({ x: p.x + (i % 2 ? 26 : -26), y: 9 + rnd() * 4, z: p.z - 6, s: 9 + rnd() * 5, rot: rnd() * 6 });
    });
    return { trees: Object.entries(trees), flags: Object.entries(flags), clouds };
  }, [levels, Q.tier]);

  const L = levels[sel];
  return (
    <div className="relative h-full w-full touch-none overflow-hidden bg-sky-300" data-testid="islands">
      <GameCanvas shadows={false} paused={paused} camera={{ position: [p0.x, 46, p0.z + 30], fov: 42, near: 1, far: 400 }}>
        <color attach="background" args={["#8fd3ff"]} />
        <fog attach="fog" args={["#8fd3ff", 70, 170]} />
        <hemisphereLight args={["#ffffff", "#7fd0f0", 1.3]} />
        <directionalLight position={[30, 60, 20]} intensity={2.2} color="#fff3dc" />
        <MapControls makeDefault enableRotate={false} enableDamping dampingFactor={0.12} minDistance={20} maxDistance={78} target={[p0.x, 0, p0.z - 8]} screenSpacePanning={false} zoomSpeed={0.9} />
        <Rig fly={fly} zMin={zMin} />
        <DevHook n={levels.length} select={select} />
        {/* biển */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, zMin / 2]}><planeGeometry args={[500, Math.abs(zMin) + 400]} /><meshStandardMaterial color="#4cc4ee" roughness={0.3} metalness={0.05} /></mesh>
        <Bodies levels={levels} />
        <Suspense fallback={null}>
          {trees.map(([name, items]) => <InstancedModel key={name} name={name} items={items} shadows={false} />)}
          {flags.map(([name, items]) => <InstancedModel key={name} name={name} items={items} shadows={false} />)}
          {clouds.length > 0 && <InstancedModel name="cloud_big" items={clouds} shadows={false} />}
        </Suspense>
        {levels.map((l, i) => {
          const p = islandPos(i), R = radiusOf(l), locked = l.status === "LOCKED";
          const icon = locked ? "🔒" : l.status === "OPEN" ? "▶" : l.status === "COUNTDOWN" ? "⏳" : l.is_draw ? "🤝" : "👑";
          return (
            <group key={l.order_no}>
              <Suspense fallback={null}>
                <Model name={LANDMARKS[i % LANDMARKS.length]} size={R * (l.reward_multiplier > 1 ? 1.15 : LANDMARKS[i % LANDMARKS.length].startsWith("def_") ? 0.6 : 1.0)} position={[p.x, 0.35, p.z]} rotation={[0, 0.5, 0]} shadows={false}
                  tint={locked ? "#b6bec4" : undefined} team={locked ? undefined : l.status === "CLOSED" && l.winner ? roofColor(l.winner.color) : ROOFS[i % ROOFS.length]} />
              </Suspense>
              {i === 3 && !locked && <Heart position={[p.x, R * 0.9 + 1, p.z]} scale={0.5} />}
              <Badge text={`${icon} ${l.order_no}${l.reward_multiplier > 1 ? " BOSS" : ""}`} position={[p.x, R * 0.95 + 2.6, p.z]} h={1.7} wide={l.reward_multiplier > 1 ? 3.6 : 2.4}
                bg={locked ? "rgba(71,85,105,0.9)" : l.status === "OPEN" ? "rgba(22,163,74,0.95)" : l.status === "COUNTDOWN" ? "rgba(217,119,6,0.95)" : "rgba(219,39,119,0.95)"} fg="#fff" />
              {/* vùng chạm (không vẽ) */}
              <mesh position={[p.x, 2, p.z]} visible={false} onClick={(e) => { if (e.delta < 8) { e.stopPropagation(); select(i); } }}><cylinderGeometry args={[R + 1, R + 1, 7, 8]} /><meshBasicMaterial /></mesh>
            </group>
          );
        })}
        {levels[current] && (levels[current].status === "OPEN" || levels[current].status === "COUNTDOWN") && <Beacon {...islandPos(current)} y={radiusOf(levels[current]) + 4.2} />}
        {L && <Ring {...islandPos(sel)} r={radiusOf(L)} />}
      </GameCanvas>

      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-2xl bg-white/90 px-3 py-1.5 text-sm font-extrabold text-pink-700 shadow">🏝️ Quần đảo màn chơi</div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex gap-2">
        <button onClick={() => select(start)} className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-xs font-extrabold text-pink-700 shadow">📍 Màn đang chơi</button>
      </div>
      {L && (
        <div className="absolute inset-x-2 bottom-2 z-10 mx-auto max-w-md rounded-2xl bg-white/95 p-3 shadow-xl" data-testid="island-card">
          <div className="flex items-center gap-2">
            <button aria-label="Màn trước" disabled={sel <= 0} onClick={() => select(sel - 1)} className="h-9 w-9 shrink-0 rounded-full bg-pink-50 text-lg font-black text-pink-700 disabled:opacity-30">‹</button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-[11px] font-bold text-pink-700/70">Màn {L.order_no} · {L.cefr}{L.reward_multiplier > 1 ? ` · BOSS ×${L.reward_multiplier}` : ""} · {L.question_count} câu · 🪙 thắng {L.win_coins.toLocaleString("vi-VN")}</div>
              <div className="truncate text-base font-extrabold text-slate-800">{L.topic_vi}</div>
              <div className="truncate text-xs text-slate-500">{L.topic_en}</div>
            </div>
            <button aria-label="Màn sau" disabled={sel >= levels.length - 1} onClick={() => select(sel + 1)} className="h-9 w-9 shrink-0 rounded-full bg-pink-50 text-lg font-black text-pink-700 disabled:opacity-30">›</button>
          </div>
          <div className="mt-1 text-center text-xs font-bold text-slate-600">
            {L.status === "COUNTDOWN" && L.deadline_at ? <>⏳ còn <Countdown deadline={L.deadline_at} /></> : L.status === "CLOSED" ? (L.is_draw ? "🤝 Hòa" : L.winner ? `👑 ${L.winner.name} thắng` : "👑 Đã đóng") : L.status === "LOCKED" ? `🔒 Mở khi màn ${L.order_no - 1} đóng` : STATUS_TXT[L.status]}
          </div>
          {L.status === "LOCKED"
            ? <div className="mt-2 rounded-full bg-slate-200 py-2 text-center text-sm font-extrabold text-slate-500" data-testid="island-locked">Chưa vào được</div>
            : <Link href={`/levels/${L.order_no}`} data-testid="island-go" className="mt-2 block rounded-full bg-pink-500 py-2 text-center text-sm font-extrabold text-white shadow hover:bg-pink-600">{L.status === "CLOSED" ? "Xem kết quả / luyện tập →" : "Vào màn →"}</Link>}
        </div>
      )}
    </div>
  );
}
