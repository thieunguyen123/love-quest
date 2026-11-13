"use client";
// Trận đánh 3D kiểu Clash of Clans (BTL-06). Kết quả đã do server tính (BTL-02) — đây chỉ là hoạt cảnh trình bày.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { play } from "@/lib/sfx";
import { Squad, UNIT_DEFS, type Anim } from "@/components/three/units";
import { Model, preloadModels } from "@/components/three/models";

// tải sẵn để không bị "suspend" (trắng cảnh) giữa trận
preloadModels(["arrow", "projectile_catapult", "destroyed", "knight", "rogue", "barbarian"]);

export type BattleResult = { id?: string; damage: number; loot: number; hpBefore: number; hpAfter: number; maxHp: number; ruined: boolean; shieldBroken?: boolean };
export type AttackSquad = { unit: string; qty: number };

// mốc thời gian (giây)
export const T_SPAWN = 1.0, T_ARRIVE = 4.2, T_FIGHT_END = 8.8, T_END = 10.5;
export type BattlePhase = "spawn" | "run" | "fight" | "end";
export const phaseAt = (t: number): BattlePhase => (t < T_SPAWN ? "spawn" : t < T_ARRIVE ? "run" : t < T_FIGHT_END ? "fight" : "end");
/** HP hiển thị theo thời gian: giảm đều trong pha giao tranh, kết thúc ĐÚNG hpAfter của server */
export function hpAt(t: number, r: BattleResult) {
  const k = Math.max(0, Math.min(1, (t - T_ARRIVE) / (T_FIGHT_END - T_ARRIVE - 0.4)));
  return Math.round(r.hpBefore - (r.hpBefore - r.hpAfter) * k);
}

type Shot = { from: THREE.Vector3; to: THREE.Vector3; t0: number; kind: "arrow" | "stone" };

function Puff({ at, t0, clock }: { at: THREE.Vector3; t0: number; clock: React.RefObject<number> }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(() => { if (!m.current) return; const k = ((clock.current ?? 0) - t0) / 0.8; m.current.visible = k >= 0 && k < 1; m.current.scale.setScalar(1 + k * 3); (m.current.material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - k); });
  return <mesh ref={m} position={at}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#e5e7eb" transparent depthWrite={false} flatShading /></mesh>;
}

function Boom({ at, t0, clock, big = false }: { at: THREE.Vector3; t0: number; clock: React.RefObject<number>; big?: boolean }) {
  const g = useRef<THREE.Group>(null);
  const parts = useMemo(() => Array.from({ length: big ? 18 : 8 }, (_, i) => new THREE.Vector3(Math.cos(i * 2.4), 0.6 + (i % 3) * 0.4, Math.sin(i * 2.4)).normalize()), [big]);
  useFrame(() => {
    if (!g.current) return;
    const k = ((clock.current ?? 0) - t0) / (big ? 1.4 : 0.6);
    g.current.visible = k >= 0 && k < 1;
    g.current.children.forEach((c, i) => {
      if (i === 0) { c.scale.setScalar((big ? 6 : 1.6) * Math.sqrt(Math.max(0, k))); ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k); return; }
      const d = parts[i - 1]; c.position.copy(d).multiplyScalar((big ? 7 : 2) * k); c.position.y -= k * k * (big ? 4 : 1);
      c.scale.setScalar((1 - k) * (big ? 0.6 : 0.3));
    });
  });
  return (
    <group ref={g} position={at}>
      <mesh><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#fb923c" transparent depthWrite={false} /></mesh>
      {parts.map((_, i) => <mesh key={i}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={i % 2 ? "#f97316" : "#78716c"} /></mesh>)}
    </group>
  );
}

function Projectile({ s, clock, onHit }: { s: Shot; clock: React.RefObject<number>; onHit: () => void }) {
  const g = useRef<THREE.Group>(null);
  const hit = useRef(false);
  const dur = s.kind === "stone" ? 1.1 : 0.55;
  useFrame(() => {
    if (!g.current) return;
    const k = ((clock.current ?? 0) - s.t0) / dur;
    g.current.visible = k >= 0 && k <= 1;
    if (k < 0) return;
    if (k > 1) { if (!hit.current) { hit.current = true; onHit(); } return; }
    const p = new THREE.Vector3().lerpVectors(s.from, s.to, k);
    p.y += Math.sin(k * Math.PI) * (s.kind === "stone" ? 6 : 1.5);
    const p2 = new THREE.Vector3().lerpVectors(s.from, s.to, Math.min(1, k + 0.02)); p2.y += Math.sin(Math.min(1, k + 0.02) * Math.PI) * (s.kind === "stone" ? 6 : 1.5);
    g.current.position.copy(p); g.current.lookAt(p2);
  });
  return (
    <group ref={g} visible={false}>
      {s.kind === "stone" ? <Model name="projectile_catapult" size={0.8} /> : <group rotation={[Math.PI / 2, 0, 0]}><Model name="arrow" height={1.1} shadows={false} /></group>}
    </group>
  );
}

/**
 * Đạo diễn trận đánh: đặt quân ở mép lưới, chạy vào, đánh, bắn; báo HP/rung/đổ nát cho cảnh cha qua callback.
 * `houseHalf` = nửa cạnh nhà (mét). `W` = cạnh lưới (mét).
 */
export function Battle({ result, squads, color, W, houseHalf, hpRef, shakeRef, onRuin, onPhase, onDone }: {
  result: BattleResult; squads: AttackSquad[]; color: string; W: number; houseHalf: number;
  hpRef: React.RefObject<number>; shakeRef: React.RefObject<number>; onRuin: () => void; onPhase: (p: BattlePhase) => void; onDone: () => void;
}) {
  const clock = useRef(0);
  const [phase, setPhase] = useState<BattlePhase>("spawn");
  const [shots, setShots] = useState<Shot[]>([]);
  const [booms, setBooms] = useState<{ at: THREE.Vector3; t0: number; big?: boolean }[]>([]);
  const [pops, setPops] = useState<{ id: number; at: THREE.Vector3; n: number }[]>([]);
  const nextShot = useRef<number[]>([]);
  const ended = useRef(false);
  const ruinedFired = useRef(false);
  const lastHp = useRef(result.hpBefore);
  const refs = useRef<(THREE.Group | null)[]>([]);

  // vị trí xuất phát (mép +z) và vị trí đứng đánh (vòng quanh nhà theo tầm đánh)
  const plan = useMemo(() => {
    const list = squads.length ? squads : [{ unit: "sword", qty: 1 }];
    return list.map((s, i) => {
      const def = UNIT_DEFS[s.unit] ?? UNIT_DEFS.sword;
      const spread = list.length === 1 ? 0 : (i / (list.length - 1) - 0.5);
      const start = new THREE.Vector3(spread * W * 0.7, 0, W / 2 + 5);
      const ang = Math.PI / 2 + spread * 1.6;          // toả ra trước mặt nhà
      const dist = houseHalf + 1.6 + def.range;
      const target = new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      return { ...s, def, start, target };
    });
  }, [squads, W, houseHalf]);

  useEffect(() => { nextShot.current = plan.map((_, i) => T_ARRIVE + 0.2 + i * 0.25); }, [plan]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    clock.current += dt;
    const t = clock.current;
    const ph = phaseAt(t);
    if (ph !== phase) { setPhase(ph); onPhase(ph); if (ph === "fight") play("boom"); }

    // di chuyển đội quân
    plan.forEach((p, i) => {
      const g = refs.current[i]; if (!g) return;
      const k = Math.max(0, Math.min(1, (t - T_SPAWN) / (T_ARRIVE - T_SPAWN)));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      g.position.lerpVectors(p.start, p.target, e);
      // đang chạy: nhìn theo hướng chạy; tới nơi: quay mặt vào nhà (tâm lưới)
      g.rotation.y = k < 1 ? Math.atan2(p.target.x - p.start.x, p.target.z - p.start.z) : Math.atan2(-p.target.x, -p.target.z);
      g.visible = t >= 0.15 * i;
    });

    // HP giảm dần + rung nhà + số sát thương
    const hp = hpAt(t, result);
    hpRef.current = hp;
    if (hp < lastHp.current) {
      const d = lastHp.current - hp;
      if (d >= Math.max(1, result.damage / 8) || hp === result.hpAfter) {
        lastHp.current = hp;
        shakeRef.current = 1;
        setPops((x) => [...x.slice(-5), { id: t, at: new THREE.Vector3((Math.random() - 0.5) * houseHalf, houseHalf * 2 + 1, (Math.random() - 0.5) * houseHalf), n: d }]);
      }
    }
    shakeRef.current = Math.max(0, (shakeRef.current ?? 0) - dt * 3);

    // bắn tên / đá trong pha giao tranh
    if (ph === "fight") plan.forEach((p, i) => {
      if (!p.def.projectile || t < nextShot.current[i]) return;
      nextShot.current[i] = t + (p.def.projectile === "stone" ? 1.6 : 0.7);
      const from = p.target.clone().setY(p.def.projectile === "stone" ? 2.2 : 1.3);
      const to = new THREE.Vector3((Math.random() - 0.5) * houseHalf, houseHalf * 1.2, (Math.random() - 0.5) * houseHalf);
      setShots((x) => [...x.slice(-12), { from, to, t0: t, kind: p.def.projectile! }]);
    });
    // lính cận chiến: tia lửa va chạm theo nhịp chém
    if (ph === "fight" && Math.floor(t * 1.5) !== Math.floor((t - dt) * 1.5)) {
      const melee = plan.filter((p) => !p.def.ranged);
      if (melee.length) { const p = melee[Math.floor(t) % melee.length]; setBooms((x) => [...x.slice(-6), { at: p.target.clone().multiplyScalar(0.8).setY(1.2), t0: t }]); }
    }
    if (t >= T_FIGHT_END && result.ruined && !ruinedFired.current) {
      ruinedFired.current = true; onRuin(); play("boom");
      setBooms((x) => [...x, { at: new THREE.Vector3(0, houseHalf, 0), t0: t, big: true }]);
    }
    if (t >= T_END && !ended.current) { ended.current = true; onDone(); }
  });

  const anim: Anim = phase === "spawn" ? "idle" : phase === "run" ? "run" : phase === "fight" ? "attack" : "cheer";
  return (
    <group>
      {plan.map((p, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g; }} position={p.start} visible={false}>
          <Suspense fallback={null}><Squad unit={p.unit} qty={p.qty} anim={anim} width={4} tint={color} height={2.3} /></Suspense>
          <Html position={[0, 3.2, 0]} center distanceFactor={20} zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
            <div className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-extrabold text-white shadow whitespace-nowrap">⚔️ ×{p.qty}</div>
          </Html>
        </group>
      ))}
      {plan.map((p, i) => <Puff key={`p${i}`} at={p.start.clone().setY(1)} t0={0.15 * i} clock={clock} />)}
      {shots.map((s, i) => <Suspense key={`${s.t0}-${i}`} fallback={null}><Projectile s={s} clock={clock} onHit={() => setBooms((x) => [...x.slice(-6), { at: s.to.clone(), t0: clock.current }])} /></Suspense>)}
      {booms.map((b, i) => <Boom key={`${b.t0}-${i}`} at={b.at} t0={b.t0} clock={clock} big={b.big} />)}
      {pops.map((p) => (
        <Html key={p.id} position={p.at} center zIndexRange={[7, 0]} style={{ pointerEvents: "none" }}>
          <div className="animate-[lqpop_0.9s_ease-out_forwards] text-2xl font-black text-red-600 [text-shadow:0_2px_0_#fff,0_-2px_0_#fff,2px_0_0_#fff,-2px_0_0_#fff]">−{p.n}</div>
        </Html>
      ))}
    </group>
  );
}
