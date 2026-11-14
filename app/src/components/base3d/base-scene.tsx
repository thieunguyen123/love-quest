"use client";
// Căn cứ 3D kiểu Clash of Clans (BASE-07/08, BTL-06): lưới, nhà ở giữa, đội quân/thú cưng/vũ khí/trang trí; chế độ xây dựng; trận đánh.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RPC_MSG } from "@/components/rpc-button";
import { play } from "@/lib/sfx";
import { autoPlace, canPlace, cellCenter, cellFromPoint, houseRect, keyOf, TILE, type Item, type Placed } from "@/lib/game/layout";
import { obstacleKind, obstacleRects, type Obstacle } from "@/lib/game/obstacles";
import type { BaseData, SceneItem } from "@/lib/base";
import { Dust, HouseModel, HOUSE_NAMES, Model, Pop, roofColor } from "@/components/three/models";
import { WallSet } from "@/components/three/walls";
import { TrainBox, type TrainInfo } from "@/components/train-box";
import { fmtClock } from "@/lib/training";
import { Squad } from "@/components/three/units";
import { Pet } from "@/components/three/pets";
import { WeaponStand, Decor } from "@/components/three/items";
import { DefenseModel, TrapModel } from "@/components/three/defenses";
import { Badge, GameCanvas, InstancedModel, useQuality, type Inst } from "@/components/three/quality";
import { autoDeploys, createSim, deploy, q as quant, step, type BattleOutcome, type Deploy, type EndReason, type Sim, type Snapshot } from "@/lib/game/sim";
import { BattleField, DeployZones } from "./battlefield";
import { BuildPanel, type CatalogItem } from "./build-panel";

export type ArmyRow = { unit: string; qty: number; emoji: string; name: string };
export type AttackInfo = { reason: string | null; left: number; total: number; myShield: boolean; army: ArmyRow[]; armorPct: number; defenses: number; dps: number };
export type ReplayInfo = { snapshot: Snapshot; deploys: Deploy[]; endTick: number | null; damage: number; loot: number; hpAfter: number; shieldBroken: boolean; stats: BattleOutcome | null };
export type BaseSceneProps = {
  mode: "own" | "partner" | "replay";
  /** luyện quân (chế độ own): thông tin từng loại lính + số chỗ quân còn trống */
  train?: { info: Record<string, TrainInfo>; freeSlots: number };
  data: BaseData;
  catalog?: CatalogItem[]; coins?: number;
  me?: { name: string; color: string };
  attack?: AttackInfo;
  replay?: ReplayInfo;
};
type Fight = { id: string | null; sim: Sim; live: boolean; replay?: { deploys: Deploy[]; endTick: number | null } };
type Result = { damage: number; loot: number; hpAfter: number; ruined: boolean; shieldBroken: boolean; expired?: boolean; reason: EndReason; out: BattleOutcome | null };
const DEPLOY_MSG: Record<string, string> = {
  TOO_CLOSE: "Quá gần công trình — hãy thả ngoài vùng đỏ", OUT_OF_BOUNDS: "Chỉ thả quân được trong đảo", BAD_COUNT: "Hết lính loại này rồi", TOO_MANY_GROUPS: "Đã đủ số tốp tối đa của 1 trận",
  ENDED: "Trận đã kết thúc", NO_UNIT: "Bạn không có loại lính này", BAD_TIME: "Không thả được lúc này",
};
const END_TEXT: Record<EndReason, string> = { ruin: "Nhà người ấy đổ nát!", time: "Hết giờ", wiped: "Quân đã ngã hết", retreat: "Bạn đã rút quân" };
const UNIT_EMOJI: Record<string, string> = { sword: "🗡️", archer: "🏹", knight: "🐎", catapult: "🪨", mage: "🧙", ninja: "🥷", yeti: "🦍" };

const LAYOUT_MSG: Record<string, string> = {
  OVERLAP_OBSTACLE: "Vướng vật cản — hãy dọn trước", OUT_OF_BOUNDS: "Ra ngoài căn cứ rồi", OVERLAP_HOUSE: "Không đặt đè lên nhà được", OVERLAP: "Ô này đã có vật khác", DUPLICATE_ITEM: "Vật bị đặt 2 lần", ITEM_NOT_OWNED: "Bạn không còn sở hữu vật này",
};

// ---------- nền đảo cỏ ô bàn cờ + cảnh quanh ----------
// cỏ mềm: ô xen kẽ rất nhẹ (vẫn thấy lưới) + đốm cỏ/hoa ngẫu nhiên; vẽ 1 lần ra canvas
function useGrassTexture(grid: number) {
  return useMemo(() => {
    const px = 32, c = document.createElement("canvas"); c.width = c.height = grid * px;
    const g = c.getContext("2d")!;
    for (let x = 0; x < grid; x++) for (let z = 0; z < grid; z++) { g.fillStyle = (x + z) % 2 ? "#86cc5a" : "#7fc454"; g.fillRect(x * px, z * px, px, px); }
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < grid * grid * 3; i++) {
      const x = rnd() * c.width, y = rnd() * c.height, r = 1 + rnd() * 2.2;
      g.fillStyle = i % 17 === 0 ? (i % 2 ? "#fff6a8" : "#ffd1e6") : rnd() > 0.5 ? "#98d86a" : "#70b84a";
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }, [grid]);
}
/** Mặt biển: gợn sóng nhẹ bằng cách xoay pha màu (rẻ, không cần shader riêng) */
function Sea({ W }: { W: number }) {
  const m = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => { if (m.current) m.current.emissiveIntensity = 0.12 + Math.sin(clock.elapsedTime * 0.8) * 0.04; });
  return (
    <group>
      <mesh position={[0, -1.3, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[W * 8, W * 8]} /><meshStandardMaterial ref={m} color="#46c3f0" emissive="#7fe0ff" emissiveIntensity={0.12} roughness={0.25} /></mesh>
      {/* vùng nước nông sáng quanh đảo */}
      <mesh position={[0, -1.27, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[W * 0.95, 48]} /><meshBasicMaterial color="#8ee6ff" transparent opacity={0.55} depthWrite={false} /></mesh>
    </group>
  );
}
function Island({ W, grid, editing }: { W: number; grid: number; editing: boolean }) {
  const tex = useGrassTexture(grid);
  return (
    <group>
      <mesh position={[0, -0.5, 0]} receiveShadow><boxGeometry args={[W, 1, W]} /><meshStandardMaterial map={tex} roughness={0.95} /></mesh>
      {/* bờ cát + vách đất bo tròn */}
      <mesh position={[0, -0.95, 0]} receiveShadow><cylinderGeometry args={[W * 0.78, W * 0.8, 0.5, 40]} /><meshStandardMaterial color="#f7e3a6" roughness={1} /></mesh>
      <mesh position={[0, -1.6, 0]}><cylinderGeometry args={[W * 0.8, W * 0.66, 1.2, 40]} /><meshStandardMaterial color="#d19a5f" flatShading /></mesh>
      <Sea W={W} />
      {editing && <gridHelper args={[W, grid, "#ffffff", "#ffffff"]} position={[0, 0.03, 0]} material-opacity={0.45} material-transparent />}
    </group>
  );
}
// cảnh nền quanh đảo (Quaternius Fantasy RTS + Stylized Nature): rừng thông, rừng cây, núi đá, bụi hoa ven bờ.
// Gộp theo mô hình (instancing) → chỉ vài lần vẽ dù có vài chục vật.
function Scenery({ W, density }: { W: number; density: number }) {
  const groups = useMemo(() => {
    const out: Record<string, Inst[]> = {};
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const add = (name: string, it: Inst) => (out[name] ??= []).push(it);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + rnd() * 0.15, d = W * 0.78 + rnd() * W * 0.4;
      if (density < 1 && i % 3 === 2) continue;
      const big = i % 6 === 0;
      add(big ? (i % 12 ? "rts_mountains" : "rts_mountain") : i % 2 ? "rts_pines" : "rts_trees",
        { x: Math.cos(a) * d, z: Math.sin(a) * d, s: big ? 16 + rnd() * 8 : 9 + rnd() * 4, rot: rnd() * 6 });
    }
    // bụi hoa & đá ven mép đảo
    const n = density < 1 ? 10 : 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2, r = W * 0.62 + rnd() * W * 0.12;
      add(i % 4 === 0 ? "rts_rocks" : "bush_flowers", { x: Math.cos(a) * r, y: 0.55, z: Math.sin(a) * r, s: i % 4 === 0 ? 2.5 : 1.6 + rnd() * 0.8, rot: rnd() * 6 });
    }
    return Object.entries(out);
  }, [W, density]);
  return <group position={[0, -1.25, 0]}>{groups.map(([name, items]) => <InstancedModel key={name} name={name} items={items} shadows={false} />)}</group>;
}

// ---------- 1 vật trên lưới ----------
/** Nhà máy luyện quân (BASE-04): mô hình Fantasy RTS + mái màu người chơi + biển đếm ngược khi đang luyện */
function FactoryView({ it, color, queue }: { it: SceneItem; color: string; queue: { unit_code: string; qty: number; started_at: string; done_at: string }[] }) {
  const mine = queue.filter((q) => q.unit_code === it.unit);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!mine.length) return; const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, [mine.length]);
  const w = it.size * TILE;
  const active = mine.find((q) => Date.parse(q.done_at) > now);
  const total = mine.reduce((a, q) => a + q.qty, 0);
  return (
    <group>
      <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[w * 0.96, 0.12, w * 0.96]} /><meshStandardMaterial color="#d9cba8" /></mesh>
      <Model name={it.model ?? "house_fortress_l0"} size={w * 0.86} position={[0, 0.12, 0]} team={roofColor(color)} />
      <Badge text={active ? `⚒️ ${total} · ${fmtClock((Date.parse(mine[mine.length - 1].done_at) - now) / 1000)}` : `${it.emoji} ${it.name}`} position={[0, w * 0.95 + 0.8, 0]} h={0.75} wide={4.2}
        bg={active ? "rgba(245,158,11,0.95)" : "rgba(255,255,255,0.9)"} fg={active ? "#fff" : "#9d174d"} />
    </group>
  );
}

function ItemView({ it, color, sad, cap, shadows, stone = true, queue = [] }: { it: SceneItem; color: string; sad: boolean; cap: number; shadows: boolean; stone?: boolean; queue?: { unit_code: string; qty: number; started_at: string; done_at: string }[] }) {
  const w = it.size * TILE;
  switch (it.kind) {
    case "FACTORY": return <FactoryView it={it} color={color} queue={queue} />;
    case "WALL": return null;   // vẽ chung bằng WallSet
    case "UNIT": return <Squad unit={it.code} qty={it.qty ?? 1} width={w} anim="idle" tint={color} height={2.3} cap={cap} shadows={shadows} />;
    case "DEFENSE": return <DefenseModel code={it.code} size={w} color={color} stone={stone} />;
    case "TRAP": return <TrapModel code={it.code} size={w} />;
    case "PET": return <Pet code={it.code} level={it.level} name={it.nickname} wander={0.5} sad={sad} phase={it.ref.charCodeAt(0)} scale={1.9} />;
    case "WEAPON": return <WeaponStand code={it.code} size={w} />;
    default: return <Decor model={it.model ?? "bush"} size={it.size} color={color} />;
  }
}

// chỉ ở dev: cho script E2E đổi ô lưới → pixel màn hình để kéo thả chuột thật
function DevHook({ placed, grid, sizeOf, sim }: { placed: Placed[]; grid: number; sizeOf: (p: Placed) => number; sim: Sim | null }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const project = (cx: number, cz: number, s: number) => {
      const c = cellCenter(cx, cz, s, grid), v = new THREE.Vector3(c.x, 0.3, c.z).project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    };
    const projectM = (x: number, z: number) => { const v = new THREE.Vector3(x, 0.05, z).project(camera); return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height }; };
    (window as unknown as { __base: unknown }).__base = { placed, grid, project, projectM, sizeOf, sim };
  });
  return null;
}

function Footprint({ x, z, s, grid, ok }: { x: number; z: number; s: number; grid: number; ok: boolean }) {
  const c = cellCenter(x, z, s, grid);
  return (
    <mesh position={[c.x, 0.06, c.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[s * TILE - 0.12, s * TILE - 0.12]} />
      <meshBasicMaterial color={ok ? "#22c55e" : "#ef4444"} transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}

function HpBar({ hpRef, max, name, level, battle }: { hpRef: React.RefObject<number>; max: number; name: string; level: number; battle: boolean }) {
  const bar = useRef<HTMLDivElement>(null), txt = useRef<HTMLSpanElement>(null);
  // Html của drei render ở React root riêng (ngoài Canvas) → không dùng useFrame được; dùng rAF thuần
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const hp = Math.max(0, hpRef.current ?? 0), pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
      if (bar.current) { bar.current.style.width = `${pct}%`; bar.current.style.background = pct < 30 ? "#ef4444" : pct < 60 ? "#f59e0b" : "#22c55e"; }
      if (txt.current) txt.current.textContent = `${hp}/${max}`;
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [hpRef, max]);
  return (
    <div className={`w-44 rounded-xl bg-white/90 px-2 py-1 text-center shadow ${battle ? "ring-2 ring-red-400" : ""}`}>
      <div className="truncate text-[11px] font-extrabold text-pink-700">🏠 {name} · Cấp {level}</div>
      <div className="mt-0.5 h-2.5 overflow-hidden rounded-full bg-slate-200"><div ref={bar} className="h-full transition-[width] duration-200" /></div>
      <div className="text-[10px] font-bold text-slate-600">HP <span ref={txt} data-testid="house-hp" /></div>
    </div>
  );
}

/** Màn hình dọc (điện thoại): lùi camera xa hơn để thấy cả đảo */
function FitCamera() {
  const { camera, size, controls } = useThree();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !controls) return;
    done.current = true;
    const aspect = size.width / Math.max(1, size.height);
    if (aspect < 1) { camera.position.multiplyScalar(Math.min(1.9, 1 / aspect + 0.15)); camera.updateProjectionMatrix(); }
  }, [camera, size, controls]);
  return null;
}
/** Vật cản chưa dọn (BASE-13): gộp theo mô hình bằng instancing — vài lần vẽ cho cả trăm vật */
function Obstacles({ list, hidden, grid }: { list: Obstacle[]; hidden: { id: string }[]; grid: number }) {
  const groups = useMemo(() => {
    const out: Record<string, Inst[]> = {};
    const gone = new Set(hidden.map((h) => h.id));
    for (const o of list) {
      if (gone.has(o.id)) continue;
      const k = obstacleKind(o.code), c = cellCenter(o.x, o.z, o.size, grid);
      const h = (o.id.charCodeAt(1) * 7 + o.x * 13 + o.z * 3) % 10;   // xoay / co giãn nhẹ cho tự nhiên (xác định)
      (out[k.model] ??= []).push({ x: c.x, z: c.z, s: o.size * TILE * (k.code === "boulder" ? 0.95 : k.size === 1 ? 0.8 : 0.9) * (0.92 + h * 0.016), rot: h * 0.63 });
    }
    return Object.entries(out);
  }, [list, hidden, grid]);
  return <>{groups.map(([name, items]) => <InstancedModel key={name} name={name} items={items} />)}</>;
}
/** Vòng tầm bắn / bán kính kích hoạt của vật đang chọn trong chế độ xây dựng (BASE-10) */
function RangeRing({ x, z, r }: { x: number; z: number; r: number }) {
  return (
    <mesh position={[x, 0.07, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[Math.max(0.1, r - 0.18), r, 48]} /><meshBasicMaterial color="#f97316" transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
/** Đồng hồ trận: đọc thẳng tick của sim bằng rAF (không render lại React mỗi khung hình) */
function BattleClock({ sim }: { sim: Sim }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let id = 0;
    const tick = () => { const left = Math.max(0, Math.ceil((sim.maxTicks - sim.tick) * sim.dt)); if (ref.current) ref.current.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; id = requestAnimationFrame(tick); };
    tick(); return () => cancelAnimationFrame(id);
  }, [sim]);
  return <span ref={ref} data-testid="battle-timer" className="tabular-nums" />;
}

export default function BaseScene({ mode, data, catalog = [], coins = 0, me, attack, replay, train }: BaseSceneProps) {
  const router = useRouter();
  const Q = useQuality();
  const grid = data.grid, W = grid * TILE;
  const W0 = Math.min(W, 40);   // camera lúc mở nhìn vào vùng giữa (20×20 ô) — lưới lớn hơn thì kéo/zoom để xem thêm
  const [hpView, setHpView] = useState(data.house.hp);           // HP hiển thị (đổi trong trận)
  const hs = data.houseSizes[data.house.level] ?? 2;
  const owned = useMemo(() => data.items.map<Item>((i) => ({ kind: i.kind, ref: i.ref, size: i.size })), [data.items]);
  const byKey = useMemo(() => new Map(data.items.map((i) => [keyOf(i), i])), [data.items]);
  const sizeOf = useCallback((p: Placed) => byKey.get(keyOf(p))?.size ?? 1, [byKey]);

  // ---------- trận đánh (BTL-06..08) ----------
  const mkReplay = useCallback((): Fight | null => (replay ? { id: null, sim: createSim(replay.snapshot), live: false, replay: { deploys: replay.deploys, endTick: replay.endTick } } : null), [replay]);
  const [fight, setFight] = useState<Fight | null>(() => (mode === "replay" ? mkReplay() : null));
  const [run, setRun] = useState(0);                 // tăng để dựng lại chiến trường (xem lại từ đầu)
  const [result, setResult] = useState<Result | null>(null);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [selUnit, setSelUnit] = useState<string | null>(null);
  const [busyAtk, setBusyAtk] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [fast, setFast] = useState(false);
  const log = useRef<Deploy[]>([]), endTick = useRef<number | null>(null), speed = useRef(1);
  const hpRef = useRef(data.house.hp), shakeRef = useRef(0);
  useEffect(() => { speed.current = fast ? 2 : 1; }, [fast]);
  useEffect(() => { if (!fight) hpRef.current = hpView; }, [hpView, fight]);

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const blocked = useMemo(() => obstacleRects(data.obstacles), [data.obstacles]);   // vật cản chưa dọn (BASE-13)
  const [placed, setPlaced] = useState<Placed[]>(() => autoPlace(data.layout, owned, grid, hs, blocked).placed);
  const [selObs, setSelObs] = useState<Obstacle | null>(null);
  const [wallMode, setWallMode] = useState(false);
  const paint = useRef<"add" | "erase" | null>(null);
  const [selFac, setSelFac] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [goneObs, setGoneObs] = useState<{ id: string; x: number; z: number; s: number }[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [shop, setShop] = useState(false);
  const controls = useRef<OrbitControlsImpl>(null);

  // dữ liệu server đổi (mua thêm, nâng cấp nhà…) → đặt tự động vật mới, giữ chỗ đang sửa nếu chưa lưu
  useEffect(() => {
    setPlaced((prev) => autoPlace(dirty ? prev : data.layout, owned, grid, hs, blocked).placed);
    if (!fight) setHpView(data.house.hp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, owned, grid, hs, blocked]);

  const placedKeys = useMemo(() => new Set(placed.map(keyOf)), [placed]);
  const unplaced = data.items.filter((i) => !placedKeys.has(keyOf(i)) && i.kind !== "WALL");
  const selItem = sel ? byKey.get(sel) : undefined;
  const ghostErr = selItem && ghost ? canPlace(selItem, ghost.x, ghost.z, placed, sizeOf, grid, hs, blocked) : null;
  // trong trận: lính gác, tháp, pháo, bẫy do chiến trường vẽ (theo ảnh chụp) → chỉ còn thú cưng / vũ khí / trang trí ở cảnh tĩnh
  const shownPlaced = fight ? placed.filter((p) => p.kind === "PET" || p.kind === "WEAPON" || p.kind === "DECOR" || p.kind === "FACTORY") : placed.filter((p) => p.kind !== "WALL");
  const wallPieces = useMemo(() => placed.filter((p) => p.kind === "WALL").map((p) => { const c = cellCenter(p.x, p.z, 1, grid); return { x: c.x, z: c.z }; }), [placed, grid]);
  const freeWalls = data.items.filter((i) => i.kind === "WALL" && !placedKeys.has(keyOf(i)));

  const moveTo = useCallback((key: string, x: number, z: number) => {
    const it = byKey.get(key); if (!it) return false;
    const err = canPlace(it, x, z, placed, sizeOf, grid, hs, blocked);
    if (err) { setMsg({ ok: false, t: LAYOUT_MSG[err] }); play("wrong"); return false; }
    setPlaced((ps) => { const cur = ps.find((p) => keyOf(p) === key); return [...ps.filter((p) => keyOf(p) !== key), { kind: it.kind, ref: it.ref, x, z, rot: cur?.rot ?? 0 }]; });
    setDirty(true); setMsg(null); play("click"); return true;
  }, [byKey, placed, sizeOf, grid, hs, blocked]);

  // thả khi nhả chuột/ngón tay ở bất cứ đâu
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      setDrag(false);
      if (controls.current) controls.current.enabled = true;
      if (sel && ghost) moveTo(sel, ghost.x, ghost.z);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [drag, sel, ghost, moveTo]);

  const pickItem = (key: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!editing && !fight && mode === "own" && key.startsWith("FACTORY:")) { e.stopPropagation(); setSelFac(key.slice(8)); setSelObs(null); play("click"); return; }
    if (!editing || fight || wallMode) return;
    e.stopPropagation();
    setSel(key); setDrag(true);
    const p = placed.find((q) => keyOf(q) === key); if (p) setGhost({ x: p.x, z: p.z });
    if (controls.current) controls.current.enabled = false;
  };
  // ---- 🧱 Xây tường: chạm/vuốt ô trống để xây, bắt đầu ở đoạn tường thì vuốt để gỡ (BASE-15) ----
  const wallAt = (x: number, z: number) => placed.find((p) => p.kind === "WALL" && p.x === x && p.z === z);
  const paintCell = (x: number, z: number, mode: "add" | "erase") => {
    setPlaced((ps) => {
      const hit = ps.find((p) => p.kind === "WALL" && p.x === x && p.z === z);
      if (mode === "erase") return hit ? ps.filter((p) => p !== hit) : ps;
      if (hit) return ps;
      const used = new Set(ps.filter((p) => p.kind === "WALL").map((p) => p.ref));
      const next = data.items.find((i) => i.kind === "WALL" && !used.has(i.ref));
      if (!next) { setMsg({ ok: false, t: "Hết tường trong kho — mua thêm ở 🛒 Xây thêm → 🧱" }); return ps; }
      if (canPlace(next, x, z, ps, sizeOf, grid, hs, blocked)) return ps;
      return [...ps, { kind: "WALL", ref: next.ref, x, z, rot: 0 }];
    });
    setDirty(true);
  };
  const onGroundDown = (e: ThreeEvent<PointerEvent>) => {
    if (!editing || !wallMode) return;
    e.stopPropagation();
    const c = cellFromPoint(e.point.x, e.point.z, 1, grid);
    paint.current = wallAt(c.x, c.z) ? "erase" : "add";
    if (controls.current) controls.current.enabled = false;
    paintCell(c.x, c.z, paint.current);
  };
  useEffect(() => {
    const up = () => { if (paint.current) { paint.current = null; if (controls.current) controls.current.enabled = true; } };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  /** tự xây 1 vòng tường quanh nhà, cách nhà 2 ô (dùng tường đang có trong kho) */
  const ringHouse = () => {
    const r = houseRect(grid, hs), g = 2, x0 = r.x - g - 1, z0 = r.z - g - 1, x1 = r.x + r.s + g, z1 = r.z + r.s + g;
    const cells: [number, number][] = [];
    for (let x = x0; x <= x1; x++) cells.push([x, z0], [x, z1]);
    for (let z = z0 + 1; z < z1; z++) cells.push([x0, z], [x1, z]);
    let ok = 0;
    setPlaced((ps) => {
      const out = [...ps]; const used = new Set(out.filter((p) => p.kind === "WALL").map((p) => p.ref));
      const pool = data.items.filter((i) => i.kind === "WALL" && !used.has(i.ref));
      for (const [x, z] of cells) {
        if (!pool.length) break;
        if (out.some((p) => p.kind === "WALL" && p.x === x && p.z === z)) continue;
        if (canPlace(pool[0], x, z, out, sizeOf, grid, hs, blocked)) continue;
        const w = pool.shift()!; out.push({ kind: "WALL", ref: w.ref, x, z, rot: 0 }); ok++;
      }
      return out;
    });
    setDirty(true); play("click");
    setTimeout(() => setMsg({ ok: true, t: ok ? `Đã xây ${ok} đoạn tường quanh nhà — nhớ 💾 Lưu bố cục` : "Không còn tường trong kho hoặc vòng quanh nhà đã kín" }), 0);
  };
  const onGroundMove = (e: ThreeEvent<PointerEvent>) => {
    if (editing && wallMode) { if (paint.current) { const c = cellFromPoint(e.point.x, e.point.z, 1, grid); paintCell(c.x, c.z, paint.current); } return; }
    if (!editing || !selItem) return;
    if (!drag && placedKeys.has(sel!)) return;   // vật đã đặt: chỉ bám theo khi đang kéo
    setGhost(cellFromPoint(e.point.x, e.point.z, selItem.size, grid));
  };
  const rotate = () => { if (!sel) return; setPlaced((ps) => ps.map((p) => (keyOf(p) === sel ? { ...p, rot: (p.rot + 1) % 4 } : p))); setDirty(true); };
  const store = () => { if (!sel) return; setPlaced((ps) => ps.filter((p) => keyOf(p) !== sel)); setSel(null); setGhost(null); setDirty(true); };
  const cancel = () => { setPlaced(autoPlace(data.layout, owned, grid, hs, blocked).placed); setDirty(false); setSel(null); setGhost(null); setEditing(false); setWallMode(false); setMsg(null); };
  async function save() {
    setSaving(true); setMsg(null);
    const { error } = await createClient().rpc("save_base_layout", { p_items: placed.map(({ kind, ref, x, z, rot }) => ({ kind, ref, x, z, rot })) });
    setSaving(false);
    if (error) { play("wrong"); return setMsg({ ok: false, t: LAYOUT_MSG[error.message] ?? RPC_MSG[error.message] ?? "Không lưu được" }); }
    play("coin"); setDirty(false); setEditing(false); setWallMode(false); setSel(null); setGhost(null);
    setMsg({ ok: true, t: "Đã lưu bố cục căn cứ ✅" }); router.refresh();
  }

  // ---------- tấn công: bắt đầu → rải quân → gửi nhật ký ----------
  async function startAttack() {
    if (!attack) return;
    if (!window.confirm(attack.myShield ? "Bạn đang bật khiên. Đi tấn công sẽ làm VỠ khiên của bạn. Vẫn tấn công?" : `Tấn công nhà ${data.owner.name}? (mất 1 lượt hôm nay)`)) return;
    setBusyAtk(true); setMsg(null);
    const res = await fetch("/api/attack/start", { method: "POST" }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setBusyAtk(false);
    if (!res?.ok || !j?.snapshot) { play("wrong"); return setMsg({ ok: false, t: RPC_MSG[j?.error] ?? "Không tấn công được" }); }
    const sim = createSim(j.snapshot as Snapshot);
    log.current = []; endTick.current = null; hpRef.current = sim.snap.house.hp;
    setLeft({ ...sim.left }); setSelUnit(sim.snap.army[0]?.unit ?? null); setResult(null); setSendErr(null); setFast(false);
    setFight({ id: j.id, sim, live: true });
    setMsg({ ok: true, t: "Chọn loại lính rồi chạm lên bản đồ để thả quân (ngoài vùng đỏ)" });
  }
  function dropAt(x: number, z: number) {
    if (!fight?.live || fight.sim.ended || !selUnit) return;
    const sim = fight.sim;
    const d: Deploy = { t: sim.tick, unit: selUnit, n: Math.min(sim.snap.cfg.groupSize, sim.left[selUnit] ?? 0), x: quant(x), z: quant(z) };
    const err = deploy(sim, d);
    if (err) { play("wrong"); return setMsg({ ok: false, t: DEPLOY_MSG[err] ?? "Không thả được" }); }
    log.current.push(d); play("click"); setMsg(null); setLeft({ ...sim.left });
    if ((sim.left[selUnit] ?? 0) <= 0) setSelUnit(sim.snap.army.find((u) => (sim.left[u.unit] ?? 0) > 0)?.unit ?? null);
  }
  function autoDrop() {
    if (!fight?.live || fight.sim.ended) return;
    log.current.push(...autoDeploys(fight.sim.snap, fight.sim));
    setLeft({ ...fight.sim.left }); setSelUnit(null); play("click");
  }
  function retreat() {
    if (!fight?.live || fight.sim.ended) return;
    endTick.current = fight.sim.tick; step(fight.sim, true);     // BattleField thấy sim.ended → gọi onEnd
  }
  async function sendLog(f: Fight, reason: EndReason) {
    setSending(true); setSendErr(null);
    const res = await fetch("/api/attack/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: f.id, deploys: log.current, endTick: reason === "retreat" ? endTick.current : null }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setSending(false);
    if (!res?.ok || !j) return setSendErr(j?.error === "ATTACK_NOT_PENDING" ? "Trận này đã được ghi nhận trước đó." : "Chưa gửi được kết quả lên máy chủ.");
    hpRef.current = j.hp_after; setHpView(j.hp_after);
    setResult({ damage: j.damage, loot: j.loot, hpAfter: j.hp_after, ruined: j.ruined, shieldBroken: j.shield_broken, expired: j.expired, reason, out: j.out ?? null });
    play(j.damage > 0 ? "coin" : "wrong");
  }
  const lastReason = useRef<EndReason>("time");
  function onEnd(reason: EndReason) {
    lastReason.current = reason;
    if (!fight) return;
    if (fight.live) void sendLog(fight, reason);
    else if (replay) { hpRef.current = replay.hpAfter; setHpView(replay.hpAfter); setResult({ damage: replay.damage, loot: replay.loot, hpAfter: replay.hpAfter, ruined: replay.hpAfter === 0 && replay.damage > 0, shieldBroken: replay.shieldBroken, reason, out: replay.stats }); }
  }
  const closeFight = () => { setFight(null); setResult(null); setSelUnit(null); setMsg(null); router.refresh(); };
  const replayAgain = () => { const f = mkReplay(); if (!f) return; hpRef.current = f.sim.snap.house.hp; setHpView(f.sim.snap.house.hp); setResult(null); setFight(f); setRun((n) => n + 1); };

  async function clearObs(o: Obstacle) {
    setClearing(true);
    const { error } = await createClient().rpc("clear_obstacle", { p_id: o.id });
    setClearing(false);
    if (error) { play("wrong"); return setMsg({ ok: false, t: RPC_MSG[error.message] ?? "Không dọn được" }); }
    play("coin"); setSelObs(null); setGoneObs((g) => [...g, { id: o.id, x: o.x, z: o.z, s: o.size }]);
    setMsg({ ok: true, t: `Đã dọn ${obstacleKind(o.code).name} — căn cứ rộng thêm ${o.size * o.size} ô 🎉` }); router.refresh();
  }
  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    if (fight?.live) return dropAt(e.point.x, e.point.z);
    if (editing && wallMode) return;
    if (!editing && mode === "own" && !fight) {   // chạm vật cản → bảng dọn
      const c = cellFromPoint(e.point.x, e.point.z, 1, grid);
      const o = data.obstacles.find((q) => c.x >= q.x && c.x < q.x + q.size && c.z >= q.z && c.z < q.z + q.size && !goneObs.some((g) => g.id === q.id));
      setSelObs(o ?? null); setSelFac(null); if (o) play("click");
      return;
    }
    if (!editing || !selItem) return;
    const c = cellFromPoint(e.point.x, e.point.z, selItem.size, grid);
    if (moveTo(sel!, c.x, c.z)) setGhost(c);
  };

  const inFight = !!fight;
  const order = useMemo(() => new Map(placed.map((p, i) => [keyOf(p), i])), [placed]);
  const mountDelay = (k: string) => Math.min(1.2, (order.get(k) ?? 0) * 0.06);
  const houseC = useMemo(() => { const r = houseRect(grid, hs); return cellCenter(r.x, r.z, r.s, grid); }, [grid, hs]);   // nhà cạnh lẻ ô lệch tâm đảo 1 m
  const ringAt = editing && selItem?.range ? (() => { const p = (drag || !placedKeys.has(sel!)) && ghost ? ghost : placed.find((x) => keyOf(x) === sel); return p ? cellCenter(p.x, p.z, selItem.size, grid) : null; })() : null;
  const btn = "pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-xs font-extrabold text-pink-700 shadow hover:bg-white disabled:opacity-50";
  const btnHot = "pointer-events-auto rounded-full bg-pink-500 px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-extrabold text-white shadow-lg hover:bg-pink-600 disabled:bg-slate-400";
  const totalLeft = Object.values(left).reduce((a, b) => a + b, 0);
  const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
  const attackerColor = fight?.sim.snap.scene?.attacker.color ?? me?.color ?? "#ef4444";

  return (
    <div className="relative h-full w-full touch-none overflow-hidden bg-sky-200" data-testid="base-scene">
      <GameCanvas camera={{ position: [W0 * 0.4, W0 * 0.48, W0 * 0.46], fov: 45 }}>
        <color attach="background" args={["#aee4ff"]} />
        <fog attach="fog" args={["#aee4ff", W * 1.8, W * 4.5]} />
        <hemisphereLight args={["#ffffff", "#9be07a", 1.25]} />
        <ambientLight intensity={0.25} color="#ffe9f4" />
        <directionalLight position={[W * 0.5, W, W * 0.3]} intensity={2.3} color="#fff3dc" castShadow={Q.shadows} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
          shadow-camera-left={-W * 0.7} shadow-camera-right={W * 0.7} shadow-camera-top={W * 0.7} shadow-camera-bottom={-W * 0.7} shadow-camera-far={W * 3} />
        <OrbitControls ref={controls} makeDefault target={[0, 0, 0]} enableDamping maxPolarAngle={1.15} minPolarAngle={0.35} minDistance={10} maxDistance={W * 2.2} />
        <Suspense fallback={null}>
          <FitCamera />
          <DevHook placed={placed} grid={grid} sizeOf={sizeOf} sim={fight?.sim ?? null} />
          <Island W={W} grid={grid} editing={editing} />
          <Suspense fallback={null}><Scenery W={W} density={Q.decor} /></Suspense>
          <Suspense fallback={null}><Obstacles list={data.obstacles} hidden={goneObs} grid={grid} /></Suspense>
          {goneObs.map((g) => { const c = cellCenter(g.x, g.z, g.s, grid); return <group key={g.id} position={[c.x, 0, c.z]}><Dust k={g.id} r={g.s * TILE * 0.5} /></group>; })}
          {selObs && (() => { const c = cellCenter(selObs.x, selObs.z, selObs.size, grid); return <RangeRing x={c.x} z={c.z} r={selObs.size * TILE * 0.62} />; })()}
          <group position={[houseC.x, 0, houseC.z]}>
            {data.house.exists ? <HouseModel level={data.house.level} style={data.house.style} color={data.owner.color} hpPct={hpView / Math.max(1, data.house.max_hp)} shield={data.shield && !inFight} size={hs * TILE} shakeRef={shakeRef} />
              : <Model name="scaffolding" size={hs * TILE * 0.9} />}
            <Html position={[0, hs * TILE * 1.1 + 1.5, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
              <HpBar hpRef={hpRef} max={data.house.max_hp} name={data.owner.name} level={data.house.level} battle={inFight} />
            </Html>
          </group>
          {!fight && wallPieces.length > 0 && <WallSet pieces={wallPieces} color={data.owner.color} />}
          {shownPlaced.map((p) => {
            const it = byKey.get(keyOf(p)); if (!it) return null;
            const k = keyOf(p), isSel = k === sel;
            const pos = isSel && drag && ghost ? ghost : p;
            const c = cellCenter(pos.x, pos.z, it.size, grid);
            return (
              <group key={k} position={[c.x, 0, c.z]} rotation={[0, (p.rot * Math.PI) / 2, 0]} onPointerDown={pickItem(k)}>
                <Pop k={`${pos.x},${pos.z},${p.rot}`} delay={mountDelay(k)} strength={0.8}><Suspense fallback={null}><ItemView it={it} color={data.owner.color} sad={hpView <= 0} cap={Q.squadCap} shadows={Q.shadows} stone={data.house.level >= 3} queue={data.training} /></Suspense></Pop>
                {it.kind !== "UNIT" && it.kind !== "PET" && <Dust k={`${pos.x},${pos.z}`} r={it.size * TILE * 0.45} />}
                {editing && <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[it.size * TILE - 0.2, it.size * TILE - 0.2]} /><meshBasicMaterial color={isSel ? "#facc15" : it.kind === "TRAP" ? "#f87171" : "#ffffff"} transparent opacity={isSel ? 0.5 : 0.18} depthWrite={false} /></mesh>}
              </group>
            );
          })}
          {/* vật đang đặt mới từ kho: hiện bóng theo con trỏ */}
          {editing && selItem && ghost && !placedKeys.has(sel!) && (() => { const c = cellCenter(ghost.x, ghost.z, selItem.size, grid); return <group position={[c.x, 0, c.z]}><Suspense fallback={null}><ItemView it={selItem} color={data.owner.color} sad={false} cap={1} shadows={false} /></Suspense></group>; })()}
          {editing && selItem && ghost && <Footprint x={ghost.x} z={ghost.z} s={selItem.size} grid={grid} ok={!ghostErr} />}
          {ringAt && <RangeRing x={ringAt.x} z={ringAt.z} r={selItem!.range!} />}
          {/* mặt phẳng bắt sự kiện chuột/chạm */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} visible={false} onPointerDown={onGroundDown} onPointerMove={onGroundMove} onClick={onGroundClick}><planeGeometry args={[W * 3, W * 3]} /><meshBasicMaterial /></mesh>
          {fight && (
            <BattleField key={run} sim={fight.sim} live={fight.live} replay={fight.replay} attackerColor={attackerColor} defenderColor={data.owner.color}
              speed={speed} hpRef={hpRef} shakeRef={shakeRef} showTraps={mode === "replay"} onHouseStage={() => setHpView(hpRef.current)} onEnd={onEnd} />
          )}
          {fight?.live && selUnit && !fight.sim.ended && <DeployZones sim={fight.sim} />}
        </Suspense>
      </GameCanvas>

      {/* ---------- HUD ---------- */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[60%] flex-col items-start gap-2">
        <div className="hidden rounded-2xl bg-white/90 px-3 py-1.5 text-sm font-extrabold text-pink-700 shadow sm:block">
          {mode === "own" ? "🏠 Căn cứ của tôi" : `🏡 Căn cứ của ${data.owner.name}`} · {HOUSE_NAMES[data.house.level]}{data.shield ? " · 🛡️" : ""}
        </div>
        {mode === "own" && <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-extrabold text-amber-700 shadow">🪙 {coins.toLocaleString("vi-VN")}</div>}
        {msg && <div role="status" className={`pointer-events-auto rounded-xl px-3 py-1.5 text-xs font-bold shadow ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.t}</div>}
      </div>

      {mode === "own" && !editing && !fight && selFac && train && (() => {
        const fi = data.items.find((i) => i.kind === "FACTORY" && i.ref === selFac); const info = fi?.unit ? train.info[fi.unit] : undefined;
        if (!fi || !info) return null;
        return (
          <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-md rounded-2xl bg-white/95 p-3 shadow-xl" data-testid="factory-panel">
            <div className="mb-1 flex items-center gap-2"><span className="text-2xl">{fi.emoji}</span><b className="flex-1 text-pink-700">{fi.name} → {info.emoji} {info.name}</b><button className="text-lg font-black text-slate-400" onClick={() => setSelFac(null)} aria-label="Đóng">✕</button></div>
            <TrainBox info={info} queue={data.training} coins={coins} freeSlots={train.freeSlots} compact />
          </div>
        );
      })()}
      {mode === "own" && !editing && !fight && selObs && (() => { const k = obstacleKind(selObs.code); return (
        <div className="absolute inset-x-3 bottom-3 z-10 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-xl" data-testid="obstacle-panel">
          <div className="text-3xl">{k.emoji}</div>
          <div className="min-w-0 flex-1"><div className="font-extrabold text-slate-800">{k.name} <span className="text-[10px] text-slate-400">{selObs.size}×{selObs.size} ô</span></div><div className="text-xs text-slate-600">Dọn để mở rộng chỗ xây căn cứ</div></div>
          <button className="rounded-xl bg-pink-500 px-3 py-2 text-xs font-extrabold text-white shadow disabled:bg-slate-300" disabled={clearing || coins < selObs.price} onClick={() => clearObs(selObs)} data-testid="clear-obstacle">{clearing ? "…" : coins < selObs.price ? `Thiếu ${(selObs.price - coins).toLocaleString("vi-VN")} xu` : `🪓 Dọn · 🪙 ${selObs.price.toLocaleString("vi-VN")}`}</button>
          <button className="text-lg font-black text-slate-400" onClick={() => setSelObs(null)} aria-label="Đóng">✕</button>
        </div>); })()}
      {mode === "own" && !editing && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">
          <button className={btnHot} onClick={() => { setEditing(true); setShop(false); setMsg(null); }} data-testid="edit-base">🔨 Xây dựng</button>
          <button className={btnHot} onClick={() => setShop(true)} data-testid="open-shop">🛒 Xây thêm</button>
        </div>
      )}
      {mode === "own" && editing && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap justify-end gap-2">
          <button className={wallMode ? btnHot : btn} onClick={() => { setWallMode((v) => !v); setSel(null); setGhost(null); setMsg({ ok: true, t: "🧱 Chạm / vuốt ô trống để xây tường · chạm đoạn tường để gỡ" }); }} data-testid="wall-mode">🧱 Tường ({freeWalls.length})</button>
          {wallMode && <button className={btn} onClick={ringHouse} data-testid="wall-ring">⭕ Bao quanh nhà</button>}
          <button className={btn} disabled={!sel || !placedKeys.has(sel)} onClick={rotate}>↻ Xoay</button>
          <button className={btn} disabled={!sel || !placedKeys.has(sel)} onClick={store}>📦 Cất vào kho</button>
          <button className={btn} onClick={cancel}>✖ Huỷ</button>
          <button className={btnHot} disabled={saving || !dirty} onClick={save} data-testid="save-layout">{saving ? "Đang lưu…" : "💾 Lưu bố cục"}</button>
        </div>
      )}
      {mode === "own" && editing && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-white/90 p-2 shadow-lg">
          <div className="px-1 pb-1 text-[11px] font-bold text-slate-600">
            {selItem ? <>Đang chọn <b className="text-pink-700">{selItem.emoji} {selItem.nickname ?? selItem.name}</b>{selItem.range ? <> · {selItem.kind === "TRAP" ? "kích hoạt" : "tầm bắn"} {selItem.range} m (vòng cam)</> : null} — kéo thả, hoặc chạm vào ô trống để chuyển tới đó.</> : "Chạm/kéo một vật trong căn cứ để di chuyển. Vật trong kho: bấm để đặt. Bẫy (ô đỏ) người ấy không nhìn thấy."}
          </div>
          <div className="flex gap-2 overflow-x-auto" data-testid="tray">
            {unplaced.length === 0 && <span className="px-1 text-xs text-slate-400">📦 Kho trống — mọi thứ đã được đặt.</span>}
            {unplaced.map((i) => (
              <button key={keyOf(i)} onClick={() => { setSel(keyOf(i)); setGhost(null); setMsg({ ok: true, t: "Chạm vào ô trống để đặt" }); }}
                className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold ${sel === keyOf(i) ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-700"}`}>
                {i.emoji} {i.nickname ?? i.name}{i.qty ? ` ×${i.qty}` : ""} · {i.size}×{i.size}
              </button>
            ))}
          </div>
        </div>
      )}
      {mode === "own" && shop && <BuildPanel catalog={catalog} coins={coins} onClose={() => setShop(false)} onBought={() => undefined} />}

      {/* do thám nhà người ấy → bảng Tấn công (BTL-01) */}
      {mode === "partner" && attack && !fight && (
        <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-md rounded-2xl bg-white/95 p-3 shadow-xl" data-testid="attack-hud">
          <div className="flex items-center justify-around text-center">
            <div><div className="text-xl font-black text-red-600">{Math.round(attack.dps)}</div><div className="text-[10px] font-bold">Sức đánh / giây</div></div>
            <div><div className="text-xl font-black text-blue-600">{attack.armorPct}%</div><div className="text-[10px] font-bold">Giáp nhà</div></div>
            <div><div className="text-xl font-black text-violet-600">{attack.defenses}</div><div className="text-[10px] font-bold">Tháp / pháo</div></div>
            <div><div className="text-xl font-black text-slate-700">{attack.left}/{attack.total}</div><div className="text-[10px] font-bold">Lượt hôm nay</div></div>
          </div>
          {attack.army.length > 0 && <div className="mt-1 text-center text-[11px] font-semibold text-slate-600">Quân của bạn: {attack.army.map((s) => `${s.emoji}×${s.qty}`).join("  ")} · bẫy thì không nhìn thấy đâu 👀</div>}
          {attack.myShield && !attack.reason && <p className="mt-1 text-center text-xs font-bold text-amber-700">⚠️ Tấn công sẽ làm vỡ khiên của bạn.</p>}
          {attack.reason && <p className="mt-1 text-center text-xs font-bold text-amber-700">{attack.reason}</p>}
          <button className={`${btnHot} mt-2 w-full`} disabled={!!attack.reason || busyAtk} onClick={startAttack} data-testid="attack-btn">{busyAtk ? "Đang vào trận…" : "⚔️ Tấn công!"}</button>
        </div>
      )}

      {/* trong trận: đồng hồ + thanh chọn lính (BTL-07) */}
      {fight && !result && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-2">
          <div className="rounded-full bg-black/70 px-3 py-1.5 text-sm font-black text-white shadow">⏱ <BattleClock sim={fight.sim} /></div>
          <button className={btn} onClick={() => setFast((v) => !v)}>{fast ? "⏩ ×2" : "▶ ×1"}</button>
          {fight.live && <button className={btn} onClick={retreat} disabled={sending} data-testid="end-battle">🏳️ Kết thúc</button>}
        </div>
      )}
      {fight?.live && !result && !sending && !sendErr && (
        <div className="absolute inset-x-2 bottom-2 z-10 rounded-2xl bg-white/95 p-2 shadow-xl" data-testid="troop-bar">
          <div className="flex items-stretch gap-2 overflow-x-auto">
            {fight.sim.snap.army.map((u) => {
              const n = left[u.unit] ?? 0;
              return (
                <button key={u.unit} disabled={n <= 0} onClick={() => setSelUnit(u.unit)} data-testid={`troop-${u.unit}`}
                  className={`flex min-w-16 flex-col items-center rounded-xl border-2 px-2 py-1 font-extrabold ${selUnit === u.unit ? "border-pink-500 bg-pink-100 text-pink-700" : "border-transparent bg-slate-100 text-slate-700"} disabled:opacity-35`}>
                  <span className="text-2xl leading-none">{UNIT_EMOJI[u.unit] ?? "🪖"}</span><span className="text-xs">×{n}</span>
                </button>
              );
            })}
            <button onClick={autoDrop} disabled={totalLeft <= 0} className="ml-auto rounded-xl bg-amber-100 px-3 text-xs font-extrabold text-amber-800 disabled:opacity-35" data-testid="auto-deploy">⚡ Tự rải hết</button>
          </div>
          <div className="px-1 pt-1 text-[11px] font-bold text-slate-600">{totalLeft > 0 ? (selUnit ? `Chạm lên bản đồ để thả tối đa ${fight.sim.snap.cfg.groupSize} lính / lần — vùng đỏ không thả được.` : "Chọn một loại lính.") : "Đã thả hết quân — xem trận đánh hoặc bấm Kết thúc."}</div>
        </div>
      )}
      {fight?.live && (sending || sendErr) && !result && (
        <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-sm rounded-2xl bg-white/95 p-3 text-center text-sm font-bold shadow-xl">
          {sending ? "Máy chủ đang tính kết quả…" : <>{sendErr} <button className="ml-2 rounded-full bg-pink-500 px-3 py-1 text-xs font-extrabold text-white" onClick={() => void sendLog(fight, lastReason.current)}>Gửi lại</button> <button className="ml-1 text-xs underline" onClick={closeFight}>Đóng</button></>}
        </div>
      )}
      {fight && result && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4" data-testid="battle-result">
          <div className="w-full max-w-sm rounded-3xl border-4 border-white bg-white p-5 text-center shadow-2xl">
            <div className="text-5xl">{result.ruined ? "💥" : result.damage > 0 ? "⚔️" : "🛡️"}</div>
            <h2 className="mt-1 text-xl font-black text-pink-700">{result.expired ? "Trận đã quá hạn" : result.ruined ? "Nhà đổ nát!" : END_TEXT[result.reason]}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-red-50 p-2"><div className="text-2xl font-black text-red-600" data-testid="battle-damage">−{result.damage}</div><div className="text-[11px] font-bold">HP nhà</div></div>
              <div className="rounded-xl bg-amber-50 p-2"><div className="text-2xl font-black text-amber-600" data-testid="battle-loot">+{result.loot}</div><div className="text-[11px] font-bold">xu chiến lợi phẩm</div></div>
            </div>
            <p className="mt-2 text-sm font-semibold">HP còn lại: <b>{result.hpAfter}/{data.house.max_hp}</b>{result.shieldBroken ? " · khiên của người đánh đã vỡ" : ""}</p>
            {result.out && <p className="mt-1 text-xs font-semibold text-slate-600">Lính ngã {sum(result.out.lost)}/{sum(result.out.deployed)} · phá {result.out.defsDown}/{fight.sim.snap.defenses.length} công trình{result.out.wallsDown ? ` · ${result.out.wallsDown} đoạn tường` : ""} · dính {result.out.trapsHit} bẫy<br />(sau trận quân và công trình tự hồi)</p>}
            <div className="mt-4 flex flex-col gap-2">
              {mode === "partner" ? <button onClick={closeFight} className={btnHot}>Xong</button> : <button onClick={replayAgain} className={btnHot}>↺ Xem lại</button>}
              {fight.id && <Link href={`/battle/${fight.id}`} className="text-sm font-bold text-pink-600 underline">🎬 Xem lại trận</Link>}
              <Link href="/battles" className="text-sm font-bold text-pink-600 underline">📜 Nhật ký trận</Link>
            </div>
          </div>
        </div>
      )}
      {!editing && !fight && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-0 hidden rounded-xl bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-pink-800 sm:block">🖱️ Kéo để xoay · cuộn để zoom · chuột phải để di chuyển</div>
      )}
    </div>
  );
}
