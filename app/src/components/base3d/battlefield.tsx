"use client";
// Chiến trường 3D (BTL-06): vẽ trạng thái của mô phỏng `sim` (src/lib/game/sim.ts) — lính, đội gác, tháp, pháo, bẫy, đạn, nổ.
// Không tự tính kết quả: chỉ gọi step() theo thời gian thực rồi vẽ. Đạn/nổ dùng "hồ" mesh cố định (không tạo rác mỗi khung hình).
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { play } from "@/lib/sfx";
import { aliveOf, deploy, houseXZ, step, type Deploy, type EndReason, type Group, type Sim, type SimEvent } from "@/lib/game/sim";
import { UnitFigure, UNIT_DEFS, squadOffsets, type Anim } from "@/components/three/units";
import { DefenseModel, HpSprite, Rubble, TrapModel } from "@/components/three/defenses";
import { Badge, useQuality } from "@/components/three/quality";
import { WallSet } from "@/components/three/walls";
import { preloadModels } from "@/components/three/models";

preloadModels(["knight", "rogue", "barbarian", "def_tower", "def_cannon", "unit_catapult"]);

const POOL_SHOT = 28, POOL_BOOM = 14;
type Shot = { on: boolean; t: number; dur: number; fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; arc: number; boom: number; round: boolean; color: string };
type Boom = { on: boolean; t: number; dur: number; x: number; y: number; z: number; size: number };

function targetXZ(sim: Sim, g: Group): [number, number] | null {
  const t = g.target; if (!t) return null;
  if (t.k === "house") return houseXZ(sim.snap);
  if (t.k === "def") { const d = sim.snap.defenses[t.i]; return [d.x, d.z]; }
  const o = g.side === "A" ? sim.guards[t.i] : sim.atk[t.i];
  return o ? [o.x, o.z] : null;
}

/** 1 tốp lính (của người đánh hoặc đội gác): đi theo vị trí trong sim, đổi hoạt ảnh theo trạng thái */
function GroupView({ sim, g, color, cap, enemy }: { sim: Sim; g: Group; color: string; cap: number; enemy: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState<Anim>("idle");
  const [alive, setAlive] = useState(g.n0);
  const [gone, setGone] = useState(false);
  const frac = useRef(1), deadT = useRef(0), first = useRef(true);
  const shown = Math.max(1, Math.min(cap, alive));
  const offs = useMemo(() => squadOffsets(g.unit === "catapult" ? 1 : shown, g.unit === "catapult" ? 3 : UNIT_DEFS[g.unit]?.mount ? 3.4 : 2.6, UNIT_DEFS[g.unit]?.mount ? Math.min(cap, 2) : cap), [g.unit, shown, cap]);
  useFrame((_, dt) => {
    const o = ref.current; if (!o) return;
    if (first.current) { o.position.set(g.x, 0, g.z); first.current = false; }
    const k = Math.min(1, dt * 14);
    const dx = g.x - o.position.x, dz = g.z - o.position.z;
    o.position.x += dx * k; o.position.z += dz * k;
    const a: Anim = g.hp <= 0 ? "dead" : g.state === "move" ? "run" : g.state === "attack" ? "attack" : "idle";
    if (a !== anim) setAnim(a);
    const n = aliveOf(g);
    if (n !== alive) setAlive(n);
    frac.current = Math.max(0, g.hp) / (g.n0 * g.unitHp);
    if (g.hp <= 0) { deadT.current += dt; if (deadT.current > 2.2 && !gone) setGone(true); return; }
    let face: [number, number] | null = null;
    if (g.state === "move" && dx * dx + dz * dz > 1e-5) face = [dx, dz];
    else { const t = targetXZ(sim, g); if (t) face = [t[0] - g.x, t[1] - g.z]; }
    if (face) { const want = Math.atan2(face[0], face[1]); const d = ((want - o.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI; o.rotation.y += d * Math.min(1, dt * 10); }
  });
  if (gone) return null;
  const h = 2.1;
  return (
    <group ref={ref}>
      {offs.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <UnitFigure unit={g.unit} anim={anim} phase={i + g.id} height={h} tint={color} shadows={false} catapultScale={0.95} />
        </group>
      ))}
      {g.hp > 0 && <Badge text={`${enemy ? "🛡" : "⚔"}×${alive}`} position={[0, h + 1.05, 0]} h={0.62} wide={2.6} bg={enemy ? "rgba(37,99,235,0.92)" : "rgba(220,38,38,0.92)"} fg="#fff" />}
      <HpSprite frac={frac} y={h + 0.5} w={1.6} />
    </group>
  );
}

function DefenseView({ sim, i, color, dead, aim, recoil }: { sim: Sim; i: number; color: string; dead: boolean; aim: React.RefObject<number>; recoil: React.RefObject<number> }) {
  const d = sim.snap.defenses[i];
  const frac = useRef(1);
  useFrame(() => { frac.current = Math.max(0, sim.defs[i].hp) / d.hp; });
  return (
    <group position={[d.x, 0, d.z]}>
      {dead ? <Rubble size={d.r * 2} /> : <Suspense fallback={null}><DefenseModel code={d.code} size={d.r * 2} color={color} aim={aim} recoil={recoil} stone={sim.snap.house.level >= 3} /></Suspense>}
      <HpSprite frac={frac} y={d.code === "def_cannon" ? 2.6 : d.r * 2 + 1.2} w={2.2} />
    </group>
  );
}

/** Vùng đỏ cấm thả quân (BTL-07): hình vuông quanh nhà và từng công trình phòng thủ */
export function DeployZones({ sim }: { sim: Sim }) {
  const m = sim.snap.cfg.deployMin, half = sim.snap.half;
  const [hx, hz] = houseXZ(sim.snap);
  const zones = [{ x: hx, z: hz, r: sim.snap.house.r + m }, ...sim.snap.defenses.map((d) => ({ x: d.x, z: d.z, r: d.r + m }))];
  return (
    <group>
      {zones.map((z, i) => (
        <mesh key={i} position={[z.x, 0.05 + i * 0.002, z.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[z.r * 2, z.r * 2]} /><meshBasicMaterial color="#ef4444" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
      <lineSegments position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry((half - 0.5) * 2, (half - 0.5) * 2)]} /><lineBasicMaterial color="#22c55e" />
      </lineSegments>
    </group>
  );
}

export type FieldProps = {
  sim: Sim; live: boolean;
  /** xem lại: nhật ký rải quân + tick kết thúc sớm */
  replay?: { deploys: Deploy[]; endTick: number | null };
  attackerColor: string; defenderColor: string;
  speed: React.RefObject<number>; hpRef: React.RefObject<number>; shakeRef: React.RefObject<number>;
  showTraps: boolean;                       // người phòng thủ xem lại thì thấy bẫy từ đầu
  onHouseStage: (stage: number) => void;    // 3: ≥50% · 2: <50% · 1: <25% · 0: sập
  onEnd: (reason: EndReason) => void;
};

export function BattleField({ sim, live, replay, attackerColor, defenderColor, speed, hpRef, shakeRef, showTraps, onHouseStage, onEnd }: FieldProps) {
  const q = useQuality();
  const cap = q.tier === "high" ? 3 : sim.snap.cfg.maxGroups > 12 ? 1 : 2;
  const [nAtk, setNAtk] = useState(sim.atk.length);
  const [deadDefs, setDeadDefs] = useState<number[]>([]);
  const [sprung, setSprung] = useState<number[]>([]);
  const [wallsDown, setWallsDown] = useState<number[]>([]);
  const wallPieces = useMemo(() => (sim.snap.walls ?? []).map((w, i) => ({ x: w.x, z: w.z, alive: !wallsDown.includes(i) })), [sim, wallsDown]);
  const acc = useRef(0), nextDeploy = useRef(0), ended = useRef(false), stage = useRef(3), lastBoomSfx = useRef(0), clock = useRef(0);
  const aims = useMemo(() => sim.snap.defenses.map(() => ({ aim: { current: 0 }, recoil: { current: 0 } })), [sim]);

  // ---- hồ đạn + nổ ----
  const shots = useMemo<Shot[]>(() => Array.from({ length: POOL_SHOT }, () => ({ on: false, t: 0, dur: 1, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0, boom: 0, round: false, color: "#1f2937" })), []);
  const booms = useMemo<Boom[]>(() => Array.from({ length: POOL_BOOM }, () => ({ on: false, t: 0, dur: 1, x: 0, y: 0, z: 0, size: 1 })), []);
  const shotMesh = useRef<(THREE.Mesh | null)[]>([]), boomMesh = useRef<(THREE.Mesh | null)[]>([]);
  const iShot = useRef(0), iBoom = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const boom = (x: number, y: number, z: number, size: number, dur = 0.5) => { const b = booms[iBoom.current++ % POOL_BOOM]; Object.assign(b, { on: true, t: 0, dur, x, y, z, size }); };

  function handle(ev: SimEvent[]) {
    for (const e of ev) {
      if (e.e === "shot") {
        if (e.kind === "melee") { if ((iBoom.current + sim.tick) % 3 === 0) boom(e.tx + (e.fx - e.tx) * 0.25, 1.1, e.tz + (e.fz - e.tz) * 0.25, 0.5, 0.25); continue; }
        const s = shots[iShot.current++ % POOL_SHOT];
        const fromDef = e.kind === "bolt" || e.kind === "ball";
        const d = Math.sqrt((e.tx - e.fx) ** 2 + (e.tz - e.fz) ** 2);
        const magic = e.kind === "magic";
        Object.assign(s, { on: true, t: 0, fx: e.fx, fz: e.fz, tx: e.tx, tz: e.tz, fy: fromDef ? (e.kind === "ball" ? 1.6 : 4.2) : e.kind === "stone" ? 2.2 : 1.4, ty: e.high ? 2 : 1,
          dur: e.kind === "stone" ? 0.9 : e.kind === "ball" ? 0.45 : magic ? Math.max(0.25, d / 18) : Math.max(0.15, d / 30), arc: e.kind === "stone" ? 6 : e.kind === "ball" ? 1.2 : magic ? 0.3 : 0.6,
          boom: e.kind === "stone" ? 1.6 : e.kind === "ball" ? 2.2 : magic ? 1.1 : 0, round: e.kind === "stone" || e.kind === "ball" || magic, color: magic ? "#c084fc" : e.kind === "stone" ? "#78716c" : "#1f2937" });
        if (fromDef) { const i = sim.snap.defenses.findIndex((f) => f.x === e.fx && f.z === e.fz); if (i >= 0) { aims[i].aim.current = Math.atan2(e.tx - e.fx, e.tz - e.fz); aims[i].recoil.current = 1; } }
      } else if (e.e === "house") { shakeRef.current = Math.min(1, (shakeRef.current ?? 0) + 0.5); }
      else if (e.e === "trap") {
        const t = sim.snap.traps[e.i]; boom(t.x, 0.8, t.z, t.splash * 1.3, 0.7); setSprung((s) => [...s, e.i]);
        if (clock.current - lastBoomSfx.current > 0.3) { lastBoomSfx.current = clock.current; play("boom"); }
      } else if (e.e === "wallDown") {
        const w = sim.snap.walls![e.i]; boom(w.x, 1, w.z, 2.2, 0.5); setWallsDown((s) => [...s, e.i]);
      } else if (e.e === "defDown") {
        const d = sim.snap.defenses[e.i]; boom(d.x, 1.5, d.z, d.r * 2.2, 0.8); setDeadDefs((s) => [...s, e.i]);
        if (clock.current - lastBoomSfx.current > 0.3) { lastBoomSfx.current = clock.current; play("boom"); }
      }
    }
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    clock.current += dt;
    if (!sim.ended) {
      acc.current += dt * (speed.current ?? 1);
      let guard = 0;
      while (acc.current >= sim.dt && !sim.ended && guard++ < 12) {
        acc.current -= sim.dt;
        if (replay) {
          while (nextDeploy.current < replay.deploys.length && replay.deploys[nextDeploy.current].t <= sim.tick) deploy(sim, replay.deploys[nextDeploy.current++]);
          handle(step(sim, replay.endTick != null && sim.tick >= replay.endTick));
        } else if (live) handle(step(sim));
      }
      if (guard >= 12) acc.current = 0;
    }
    if (sim.atk.length !== nAtk) setNAtk(sim.atk.length);
    // HP nhà + mức hư hại
    const hp = Math.max(0, Math.ceil(sim.houseHp - 1e-9));
    hpRef.current = hp;
    const pct = hp / Math.max(1, sim.snap.house.maxHp);
    const st = hp <= 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : 3;
    if (st !== stage.current) { stage.current = st; onHouseStage(st); if (st === 0) { const [hx, hz] = houseXZ(sim.snap); boom(hx, sim.snap.house.r, hz, sim.snap.house.r * 3, 1.2); play("boom"); } }
    shakeRef.current = Math.max(0, (shakeRef.current ?? 0) - dt * 3);
    if (sim.ended && !ended.current) { ended.current = true; onEnd(sim.ended); }

    // đạn bay
    const sp = speed.current ?? 1;
    for (let i = 0; i < POOL_SHOT; i++) {
      const s = shots[i], m = shotMesh.current[i]; if (!m) continue;
      if (!s.on) { if (m.visible) m.visible = false; continue; }
      s.t += (dt * sp) / s.dur;
      if (s.t >= 1) { s.on = false; m.visible = false; if (s.boom > 0) boom(s.tx, s.ty * 0.5, s.tz, s.boom, 0.45); continue; }
      const k = s.t, y = s.fy + (s.ty - s.fy) * k + Math.sin(k * Math.PI) * s.arc;
      m.visible = true; m.position.set(s.fx + (s.tx - s.fx) * k, y, s.fz + (s.tz - s.fz) * k);
      if (s.round) { m.scale.setScalar(s.color === "#c084fc" ? 1.3 : 1); (m.material as THREE.MeshBasicMaterial).color.set(s.color); }
      else { const k2 = Math.min(1, k + 0.03); tmp.set(s.fx + (s.tx - s.fx) * k2, s.fy + (s.ty - s.fy) * k2 + Math.sin(k2 * Math.PI) * s.arc, s.fz + (s.tz - s.fz) * k2); m.lookAt(tmp); m.scale.set(0.18, 0.18, 3.2); }
    }
    for (let i = 0; i < POOL_BOOM; i++) {
      const b = booms[i], m = boomMesh.current[i]; if (!m) continue;
      if (!b.on) { if (m.visible) m.visible = false; continue; }
      b.t += (dt * sp) / b.dur;
      if (b.t >= 1) { b.on = false; m.visible = false; continue; }
      m.visible = true; m.position.set(b.x, b.y, b.z); m.scale.setScalar(b.size * (0.3 + 0.7 * Math.sqrt(b.t)));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - b.t);
    }
  });
  useEffect(() => { if (!live) ended.current = false; }, [live]);

  return (
    <group>
      {wallPieces.length > 0 && <WallSet pieces={wallPieces} color={defenderColor} />}
      {sim.snap.defenses.map((d, i) => <DefenseView key={d.id} sim={sim} i={i} color={defenderColor} dead={deadDefs.includes(i)} aim={aims[i].aim} recoil={aims[i].recoil} />)}
      {sim.snap.traps.map((t, i) => (showTraps || sprung.includes(i)) && (
        <group key={t.id} position={[t.x, 0, t.z]}><TrapModel code={t.code} armed={!sprung.includes(i)} /></group>
      ))}
      {sim.guards.map((g) => <Suspense key={`g${g.id}`} fallback={null}><GroupView sim={sim} g={g} color={defenderColor} cap={cap} enemy /></Suspense>)}
      {sim.atk.slice(0, nAtk).map((g) => <Suspense key={`a${g.id}`} fallback={null}><GroupView sim={sim} g={g} color={attackerColor} cap={cap} enemy={false} /></Suspense>)}
      {shots.map((_, i) => <mesh key={`s${i}`} ref={(m) => { shotMesh.current[i] = m; }} visible={false}><sphereGeometry args={[0.28, 8, 6]} /><meshBasicMaterial color={i % 2 ? "#1f2937" : "#3f2d1c"} /></mesh>)}
      {booms.map((_, i) => <mesh key={`b${i}`} ref={(m) => { boomMesh.current[i] = m; }} visible={false}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial color={i % 2 ? "#fb923c" : "#fde047"} transparent depthWrite={false} /></mesh>)}
    </group>
  );
}
