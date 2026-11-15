"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sky } from "@react-three/drei";
import { GameCanvas, useQuality } from "@/components/three/quality";
import { Physics, RigidBody, CuboidCollider, CylinderCollider, type RapierRigidBody } from "@react-three/rapier";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { createClient, realtimeReady } from "@/lib/supabase/client";
import { MY_HOUSE, PARTNER_HOUSE, ZONES } from "./data";
import { mergeInput, nearestZone, spawnAt, type Input } from "./physics";
import { House, HOUSE_LOT, type HouseInfo } from "./houses";
import { Heart } from "@/components/three/models";
import { play } from "@/lib/sfx";
import { Car, CarMesh, type CamMode, type CarPose } from "./car";
import { Backdrop, Building, Ground, Ramp, Toys, Trees } from "./props";
import { Joystick, Minimap, Overlay } from "./hud";

export type WorldProps = {
  meId: string; coupleKey: string; meName: string; meColor: string; partnerName: string; partnerColor: string;
  myHouse: HouseInfo; partnerHouse: HouseInfo; arenaLabel: string; arenaDeadline: string | null; coins: number; at?: string;
};
type Remote = { x: number; z: number; h: number; t: number };
type Keys = { up: boolean; down: boolean; left: boolean; right: boolean; brake: boolean; boost: boolean };

// Xe người ấy (W3D-03, realtime): thân kinematic nên 2 xe tông nhau được
function Ghost({ remote, color, name }: { remote: React.RefObject<Remote | null>; color: string; name: string }) {
  const body = useRef<RapierRigidBody>(null);
  const [online, setOnline] = useState(false);
  const cur = useRef({ x: 0, z: 0, h: 0, init: false });
  useFrame((_, dt) => {
    const r = remote.current, b = body.current; if (!b) return;
    const on = !!r && Date.now() - r.t < 5000;
    if (on !== online) setOnline(on);
    if (!r || !on) { b.setNextKinematicTranslation({ x: 0, y: -50, z: 0 }); cur.current.init = false; return; }
    const c = cur.current, a = cur.current.init ? 1 - Math.pow(0.0001, dt) : 1;
    c.x += (r.x - c.x) * a; c.z += (r.z - c.z) * a;
    let dh = r.h - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.h += dh * a; c.init = true;
    b.setNextKinematicTranslation({ x: c.x, y: 0.6, z: c.z });
    b.setNextKinematicRotation({ x: 0, y: Math.sin(c.h / 2), z: 0, w: Math.cos(c.h / 2) });
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -50, 0]}>
      <CuboidCollider args={[0.8, 0.5, 1.45]} position={[0, 0.2, 0]} />
      <group position={[0, -0.6, 0]} visible={online}><CarMesh color={color} /></group>
      {online && <Html position={[0, 2.2, 0]} center distanceFactor={22} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}><div className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-pink-700 whitespace-nowrap">💕 {name}</div></Html>}
    </RigidBody>
  );
}

// Tim bay lên trên xe khi thả tim (nhấn H) — thấy ở cả 2 máy
type Emote = { who: "me" | "partner"; t0: number };
function Hearts({ emotes, pose, remote }: { emotes: React.RefObject<Emote[]>; pose: React.RefObject<CarPose>; remote: React.RefObject<Remote | null> }) {
  const N = 16;
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const now = performance.now() / 1000;
    emotes.current = (emotes.current ?? []).filter((e) => now - e.t0 < 2.2);
    const list = emotes.current.flatMap((e) => [0, 1, 2, 3].map((j) => ({ ...e, j })));
    refs.current.forEach((g, i) => {
      if (!g) return;
      const e = list[i]; g.visible = !!e; if (!e) return;
      const a = e.who === "me" ? pose.current : remote.current; if (!a) { g.visible = false; return; }
      const k = (now - e.t0) / 2.2;
      g.position.set(a.x + Math.sin(e.j * 1.7 + k * 6) * 0.8, 2.6 + k * 5 + e.j * 0.5, a.z + Math.cos(e.j * 2.3) * 0.6);
      g.scale.setScalar(0.35 * (1 - k * 0.6));
    });
  });
  return <>{Array.from({ length: N }, (_, i) => <group key={i} ref={(g) => { refs.current[i] = g; }} visible={false}><Heart scale={1} /></group>)}</>;
}

function HouseBody({ x, z, info, hitRef }: { x: number; z: number; info: HouseInfo; hitRef?: React.RefObject<number> }) {
  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[x, 0, z]}><CylinderCollider args={[3, HOUSE_LOT * 0.55]} position={[0, 3, 0]} /></RigidBody>
      <House x={x} z={z} info={info} hitRef={hitRef} />
    </>
  );
}

const KEYMAP: Record<string, keyof Keys> = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  Space: "brake", ShiftLeft: "boost", ShiftRight: "boost",
};

export default function World3D(p: WorldProps) {
  const router = useRouter();
  const keys = useRef<Keys>({ up: false, down: false, left: false, right: false, brake: false, boost: false });
  const joy = useRef({ x: 0, y: 0 });
  const input = useRef<() => Input>(() => mergeInput(keys.current, joy.current));
  // 2 người cùng xuất phát 1 chỗ → mỗi người lệch 1 bên (theo thứ tự id trong coupleKey), xe không chồng lên nhau
  const start = useMemo(() => spawnAt(p.at, p.coupleKey.startsWith(p.meId) ? -1 : 1), [p.at, p.coupleKey, p.meId]);
  const pose = useRef<CarPose>({ ...start, speed: 0 });
  const remote = useRef<Remote | null>(null);
  const cam = useRef<{ mode: CamMode; zoom: number }>({ mode: "iso", zoom: 1 });
  const respawn = useRef(0);
  const light = useRef<THREE.DirectionalLight>(null);
  const [overlay, setOverlay] = useState<{ href: string; name: string } | null>(null);
  const paused = useRef(false);
  paused.current = !!overlay;
  const [near, setNear] = useState<ReturnType<typeof nearestZone>>(null);
  const nearRef = useRef(near); nearRef.current = near;
  const [camMode, setCamMode] = useState<CamMode>("iso");
  const Q = useQuality();
  const [touch, setTouch] = useState(false);
  const emotes = useRef<Emote[]>([]);
  const chanRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const myHit = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const sendHeart = useCallback(() => {
    emotes.current = [...(emotes.current ?? []), { who: "me", t0: performance.now() / 1000 }];
    void chanRef.current?.send({ type: "broadcast", event: "emote", payload: { id: p.meId } });
    play("click");
  }, [p.meId]);

  const open = useCallback((href: string, name: string) => {
    keys.current = { up: false, down: false, left: false, right: false, brake: false, boost: false };
    joy.current = { x: 0, y: 0 };
    setOverlay({ href, name });
  }, []);
  const close = useCallback(() => { setOverlay(null); router.refresh(); }, [router]);   // cập nhật nhà/xu sau khi mua, đánh…

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    // chỉ ở dev: cho script E2E đọc vị trí xe
    if (process.env.NODE_ENV !== "production") (window as unknown as { __world: unknown }).__world = { pose, near: nearRef, remote, emotes, myHit };
    try { const m = localStorage.getItem("world-cam"); if (m === "follow" || m === "iso") { cam.current.mode = m; setCamMode(m); } } catch { /* ignore */ }
    const dn = (e: KeyboardEvent) => {
      if (paused.current || e.target instanceof HTMLInputElement) return;
      const k = KEYMAP[e.code]; if (k) { keys.current[k] = true; e.preventDefault(); }
      if ((e.code === "KeyE" || e.code === "Enter") && nearRef.current) open(nearRef.current.href, nearRef.current.name);
      if (e.code === "KeyR") respawn.current++;
      if (e.code === "KeyH") sendHeart();
      if (e.code === "KeyC") { const m = cam.current.mode === "iso" ? "follow" : "iso"; cam.current.mode = m; setCamMode(m); try { localStorage.setItem("world-cam", m); } catch { /* ignore */ } }
    };
    const up = (e: KeyboardEvent) => { const k = KEYMAP[e.code]; if (k) keys.current[k] = false; };
    const blur = () => { keys.current = { up: false, down: false, left: false, right: false, brake: false, boost: false }; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    const iv = setInterval(() => { const n = nearestZone(pose.current.x, pose.current.z); setNear((o) => (o?.id === n?.id ? o : n)); }, 150);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); clearInterval(iv); };
  }, [open, sendHeart]);

  // Người ấy lái xe: gửi/nhận vị trí qua Supabase Realtime Broadcast, 10 lần/giây, chỉ gửi khi có thay đổi
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`world-${p.coupleKey}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "pos" }, ({ payload }) => { if (payload.id !== p.meId) remote.current = { x: payload.x, z: payload.z, h: payload.h, t: Date.now() }; })
      .on("broadcast", { event: "emote" }, ({ payload }) => { if (payload.id !== p.meId) { emotes.current = [...(emotes.current ?? []), { who: "partner", t0: performance.now() / 1000 }]; setToast(`💕 ${p.partnerName} thả tim cho bạn!`); setTimeout(() => setToast(null), 2500); } })
      .subscribe();
    chanRef.current = ch;
    // Bị tấn công lúc đang ở làng → nhà rung + nổ + thông báo, rồi tải lại trạng thái nhà
    const nc = sb.channel(`world-notif-${p.meId}`);
    void realtimeReady(sb).then(() => nc.on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${p.meId}` }, ({ new: n }) => {
      if ((n as { type: string }).type !== "ATTACKED") return;
      myHit.current = 1; play("boom");
      setToast(`💥 ${(n as { title: string }).title} ${(n as { body: string }).body}`);
      setTimeout(() => { setToast(null); router.refresh(); }, 3500);
    }).subscribe());
    let last = { x: 0, z: 0, h: 0, at: 0 };
    const iv = setInterval(() => {
      const q = pose.current, now = Date.now();
      const moved = Math.abs(q.x - last.x) + Math.abs(q.z - last.z) + Math.abs(q.h - last.h) > 0.02;
      if (moved || now - last.at > 2000) {   // vẫn gửi "nhịp tim" 2 giây/lần để người kia biết mình đang online
        last = { x: q.x, z: q.z, h: q.h, at: now };
        void ch.send({ type: "broadcast", event: "pos", payload: { id: p.meId, x: +q.x.toFixed(2), z: +q.z.toFixed(2), h: +q.h.toFixed(3) } });
      }
    }, 100);
    return () => { clearInterval(iv); void sb.removeChannel(ch); void sb.removeChannel(nc); chanRef.current = null; };
  }, [p.coupleKey, p.meId, p.partnerName, router]);

  const onWheel = (e: React.WheelEvent) => { cam.current.zoom = THREE.MathUtils.clamp(cam.current.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.55, 1.8); };
  const btn = "pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-xs font-extrabold text-pink-700 shadow hover:bg-white";

  return (
    <div className="relative h-full w-full overflow-hidden bg-sky-200" onWheel={onWheel}>
      {/* mở overlay 2D thì dừng hẳn vòng render 3D phía sau (SYS-05) */}
      <GameCanvas camera={{ position: [start.x + 11, 16, start.z + 15], fov: 50 }} paused={!!overlay}>
        <Sky sunPosition={[60, 40, 30]} turbidity={4} rayleigh={0.6} />
        <fog attach="fog" args={["#cfe8ff", 70, 160]} />
        <hemisphereLight args={["#ffffff", "#9be07a", 1.15]} />
        <directionalLight ref={light} intensity={2.1} color="#fff3dc" castShadow={Q.shadows} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005}
          shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-far={120} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -25, 0]}>
            <Ground />
            <Trees />
            <Backdrop />
            {ZONES.map((z) => <Building key={z.id} zone={z} label={z.id === "arena" ? p.arenaLabel : undefined} deadline={z.id === "arena" ? p.arenaDeadline : undefined} />)}
            <HouseBody x={MY_HOUSE.x} z={MY_HOUSE.z} info={p.myHouse} hitRef={myHit} />
            <HouseBody x={PARTNER_HOUSE.x} z={PARTNER_HOUSE.z} info={p.partnerHouse} />
            <Ramp />
            <Toys />
            <Car color={p.meColor} start={start} input={input} pose={pose} paused={paused} cam={cam} respawn={respawn} light={light} />
            <Ghost remote={remote} color={p.partnerColor} name={p.partnerName} />
            <Hearts emotes={emotes} pose={pose} remote={remote} />
          </Physics>
        </Suspense>
      </GameCanvas>

      {/* HUD */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
        <div className="hidden rounded-full bg-white/90 px-3 py-1 text-sm font-extrabold text-amber-700 shadow sm:block">🪙 {p.coins.toLocaleString("vi-VN")}</div>
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-amber-700 shadow">🏆 {p.arenaLabel}</div>
      </div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex gap-2">
        <button className={btn} title="Đổi camera (C)" onClick={() => { const m = camMode === "iso" ? "follow" : "iso"; cam.current.mode = m; setCamMode(m); try { localStorage.setItem("world-cam", m); } catch { /* ignore */ } }}>🎥<span className="hidden sm:inline"> {camMode === "iso" ? "Camera sau xe" : "Camera trên cao"} (C)</span></button>
        <button className={btn} title="Thả tim cho người ấy (H)" onClick={sendHeart} data-testid="heart-btn">💕<span className="hidden sm:inline"> Thả tim (H)</span></button>
        <button className={btn} title="Về chỗ cũ (R)" onClick={() => respawn.current++}>↺<span className="hidden sm:inline"> Về chỗ cũ (R)</span></button>
        <Link className={btn} title="Giao diện đơn giản (2D)" href="/?view=2d" onClick={() => { try { localStorage.setItem("view", "2d"); } catch { /* ignore */ } }}>🗂️ 2D</Link>
      </div>
      {!touch && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold leading-5 text-pink-800 shadow">
          <b>WASD / ↑↓←→</b> lái · <b>Shift</b> tăng tốc · <b>Space</b> phanh<br /><b>E</b> vào khu · <b>H</b> thả tim · <b>R</b> về chỗ cũ · <b>C</b> đổi camera · lăn chuột để zoom
        </div>
      )}
      <div className="absolute bottom-3 right-3 z-10">
        <Minimap pose={pose} partner={remote} meColor={p.meColor} partnerColor={p.partnerColor} onOpen={open} />
      </div>
      {near && !overlay && (
        <button onClick={() => open(near.href, near.name)} className="absolute bottom-44 left-1/2 z-10 -translate-x-1/2 animate-bounce rounded-2xl bg-pink-500 px-5 py-3 font-extrabold text-white shadow-xl sm:bottom-8">
          {near.emoji} {touch ? "Chạm" : "Nhấn E"} để vào {near.name}
        </button>
      )}
      {touch && !overlay && (
        <>
          <div className="absolute bottom-6 left-6 z-10"><Joystick value={joy} /></div>
          <button aria-label="Tăng tốc" className="absolute bottom-40 right-6 z-10 h-16 w-16 rounded-full border-4 border-white bg-amber-400 text-2xl shadow-lg touch-none select-none active:bg-amber-500"
            onPointerDown={() => { keys.current.boost = true; }} onPointerUp={() => { keys.current.boost = false; }} onPointerCancel={() => { keys.current.boost = false; }} onPointerLeave={() => { keys.current.boost = false; }}>🚀</button>
        </>
      )}
      {toast && <div role="status" data-testid="world-toast" className="absolute left-1/2 top-16 z-20 max-w-[90%] -translate-x-1/2 rounded-2xl bg-white/95 px-4 py-2 text-center text-sm font-extrabold text-pink-700 shadow-xl">{toast}</div>}
      {overlay && <Overlay href={overlay.href} name={overlay.name} onClose={close} />}
    </div>
  );
}
