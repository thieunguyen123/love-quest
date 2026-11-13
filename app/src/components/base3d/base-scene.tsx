"use client";
// Căn cứ 3D kiểu Clash of Clans (BASE-07/08, BTL-06): lưới, nhà ở giữa, đội quân/thú cưng/vũ khí/trang trí; chế độ xây dựng; trận đánh.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RPC_MSG } from "@/components/rpc-button";
import { play } from "@/lib/sfx";
import { autoPlace, canPlace, cellCenter, cellFromPoint, keyOf, TILE, type Item, type Placed } from "@/lib/game/layout";
import type { BaseData, SceneItem } from "@/lib/base";
import { HouseModel, HOUSE_NAMES, Model } from "@/components/three/models";
import { Squad } from "@/components/three/units";
import { Pet } from "@/components/three/pets";
import { WeaponStand, Decor } from "@/components/three/items";
import { Battle, type AttackSquad, type BattlePhase, type BattleResult } from "./battle";
import { BuildPanel, type CatalogItem } from "./build-panel";

export type AttackInfo = { partnerId: string; atk: number; def: number; reason: string | null; left: number; total: number; myShield: boolean };
export type BaseSceneProps = {
  mode: "own" | "partner" | "replay";
  data: BaseData;
  catalog?: CatalogItem[]; coins?: number;
  attacker?: { name: string; color: string; squads: AttackSquad[] };
  attack?: AttackInfo;
  replay?: BattleResult;
};

const LAYOUT_MSG: Record<string, string> = {
  OUT_OF_BOUNDS: "Ra ngoài căn cứ rồi", OVERLAP_HOUSE: "Không đặt đè lên nhà được", OVERLAP: "Ô này đã có vật khác", DUPLICATE_ITEM: "Vật bị đặt 2 lần", ITEM_NOT_OWNED: "Bạn không còn sở hữu vật này",
};

// ---------- nền đảo cỏ ô bàn cờ + cảnh quanh ----------
function useCheckerTexture(grid: number) {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = grid * 8;
    const g = c.getContext("2d")!;
    for (let x = 0; x < grid; x++) for (let z = 0; z < grid; z++) { g.fillStyle = (x + z) % 2 ? "#86cf6a" : "#7cc35f"; g.fillRect(x * 8, z * 8, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [grid]);
}
function Island({ W, grid, editing }: { W: number; grid: number; editing: boolean }) {
  const tex = useCheckerTexture(grid);
  return (
    <group>
      <mesh position={[0, -0.5, 0]} receiveShadow><boxGeometry args={[W, 1, W]} /><meshStandardMaterial map={tex} /></mesh>
      <mesh position={[0, -1.6, 0]}><boxGeometry args={[W + 1.2, 1.4, W + 1.2]} /><meshStandardMaterial color="#8b5a2b" flatShading /></mesh>
      <mesh position={[0, -1.25, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[W * 6, W * 6]} /><meshStandardMaterial color="#5fa64a" /></mesh>
      {editing && <gridHelper args={[W, grid, "#ffffff", "#ffffff"]} position={[0, 0.03, 0]} material-opacity={0.45} material-transparent />}
    </group>
  );
}
function Scenery({ W }: { W: number }) {
  const items = useMemo(() => {
    const out: { name: string; x: number; z: number; s: number; r: number }[] = [];
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2, d = W * 0.72 + rnd() * W * 0.35;
      out.push({ name: i % 5 === 0 ? (i % 2 ? "mountain_A_grass_trees" : "mountain_B_grass_trees") : i % 3 ? "trees_A_large" : "trees_B_large", x: Math.cos(a) * d, z: Math.sin(a) * d, s: i % 5 === 0 ? 14 + rnd() * 6 : 7 + rnd() * 3, r: rnd() * 6 });
    }
    return out;
  }, [W]);
  return <group position={[0, -1.25, 0]}>{items.map((it, i) => <Model key={i} name={it.name} size={it.s} position={[it.x, 0, it.z]} rotation={[0, it.r, 0]} />)}</group>;
}

// ---------- 1 vật trên lưới ----------
function ItemView({ it, color, sad, defending }: { it: SceneItem; color: string; sad: boolean; defending: boolean }) {
  const w = it.size * TILE;
  switch (it.kind) {
    case "UNIT": return <Squad unit={it.code} qty={it.qty ?? 1} width={w} anim={defending ? "attack" : "idle"} tint={color} height={2.3} />;
    case "PET": return <Pet code={it.code} level={it.level} name={it.nickname} wander={0.5} sad={sad} phase={it.ref.charCodeAt(0)} scale={1.9} />;
    case "WEAPON": return <WeaponStand code={it.code} size={w} />;
    default: return <Decor model={it.model ?? "bush"} size={it.size} color={color} />;
  }
}

// chỉ ở dev: cho script E2E đổi ô lưới → pixel màn hình để kéo thả chuột thật
function DevHook({ placed, grid, sizeOf }: { placed: Placed[]; grid: number; sizeOf: (p: Placed) => number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const project = (cx: number, cz: number, s: number) => {
      const c = cellCenter(cx, cz, s, grid), v = new THREE.Vector3(c.x, 0.3, c.z).project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    };
    (window as unknown as { __base: unknown }).__base = { placed, grid, project, sizeOf };
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

export default function BaseScene({ mode, data, catalog = [], coins = 0, attacker, attack, replay }: BaseSceneProps) {
  const router = useRouter();
  const grid = data.grid, W = grid * TILE;
  const [hpView, setHpView] = useState(data.house.hp);           // HP hiển thị (đổi trong trận)
  const hs = data.houseSizes[data.house.level] ?? 2;
  const owned = useMemo(() => data.items.map<Item>((i) => ({ kind: i.kind, ref: i.ref, size: i.size })), [data.items]);
  const byKey = useMemo(() => new Map(data.items.map((i) => [keyOf(i), i])), [data.items]);
  const sizeOf = useCallback((p: Placed) => byKey.get(keyOf(p))?.size ?? 1, [byKey]);

  // ---------- trận đánh ----------
  const [battle, setBattle] = useState<BattleResult | null>(mode === "replay" ? replay ?? null : null);
  const [phase, setPhase] = useState<BattlePhase | null>(null);
  const [done, setDone] = useState(false);
  const [busyAtk, setBusyAtk] = useState(false);
  const [run, setRun] = useState(0);   // tăng để phát lại trận từ đầu
  const hpRef = useRef(data.house.hp), shakeRef = useRef(0);
  useEffect(() => { if (!battle) hpRef.current = hpView; }, [hpView, battle]);
  useEffect(() => { if (battle) hpRef.current = battle.hpBefore; }, [battle]);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [placed, setPlaced] = useState<Placed[]>(() => autoPlace(data.layout, owned, grid, hs).placed);
  const [sel, setSel] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [shop, setShop] = useState(false);
  const controls = useRef<OrbitControlsImpl>(null);

  // dữ liệu server đổi (mua thêm, nâng cấp nhà…) → đặt tự động vật mới, giữ chỗ đang sửa nếu chưa lưu
  useEffect(() => {
    setPlaced((prev) => autoPlace(dirty ? prev : data.layout, owned, grid, hs).placed);
    setHpView(data.house.hp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, owned, grid, hs]);

  const placedKeys = useMemo(() => new Set(placed.map(keyOf)), [placed]);
  const unplaced = data.items.filter((i) => !placedKeys.has(keyOf(i)));
  const selItem = sel ? byKey.get(sel) : undefined;
  const ghostErr = selItem && ghost ? canPlace(selItem, ghost.x, ghost.z, placed, sizeOf, grid, hs) : null;

  const moveTo = useCallback((key: string, x: number, z: number) => {
    const it = byKey.get(key); if (!it) return false;
    const err = canPlace(it, x, z, placed, sizeOf, grid, hs);
    if (err) { setMsg({ ok: false, t: LAYOUT_MSG[err] }); play("wrong"); return false; }
    setPlaced((ps) => { const cur = ps.find((p) => keyOf(p) === key); return [...ps.filter((p) => keyOf(p) !== key), { kind: it.kind, ref: it.ref, x, z, rot: cur?.rot ?? 0 }]; });
    setDirty(true); setMsg(null); play("click"); return true;
  }, [byKey, placed, sizeOf, grid, hs]);

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
    if (!editing || battle) return;
    e.stopPropagation();
    setSel(key); setDrag(true);
    const p = placed.find((q) => keyOf(q) === key); if (p) setGhost({ x: p.x, z: p.z });
    if (controls.current) controls.current.enabled = false;
  };
  const onGroundMove = (e: ThreeEvent<PointerEvent>) => {
    if (!editing || !selItem) return;
    if (!drag && placedKeys.has(sel!)) return;   // vật đã đặt: chỉ bám theo khi đang kéo
    setGhost(cellFromPoint(e.point.x, e.point.z, selItem.size, grid));
  };
  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    if (!editing || !selItem || e.delta > 8) return;
    const c = cellFromPoint(e.point.x, e.point.z, selItem.size, grid);
    if (moveTo(sel!, c.x, c.z)) setGhost(c);
  };
  const rotate = () => { if (!sel) return; setPlaced((ps) => ps.map((p) => (keyOf(p) === sel ? { ...p, rot: (p.rot + 1) % 4 } : p))); setDirty(true); };
  const store = () => { if (!sel) return; setPlaced((ps) => ps.filter((p) => keyOf(p) !== sel)); setSel(null); setGhost(null); setDirty(true); };
  const cancel = () => { setPlaced(autoPlace(data.layout, owned, grid, hs).placed); setDirty(false); setSel(null); setGhost(null); setEditing(false); setMsg(null); };
  async function save() {
    setSaving(true); setMsg(null);
    const { error } = await createClient().rpc("save_base_layout", { p_items: placed.map(({ kind, ref, x, z, rot }) => ({ kind, ref, x, z, rot })) });
    setSaving(false);
    if (error) { play("wrong"); return setMsg({ ok: false, t: LAYOUT_MSG[error.message] ?? RPC_MSG[error.message] ?? "Không lưu được" }); }
    play("coin"); setDirty(false); setEditing(false); setSel(null); setGhost(null);
    setMsg({ ok: true, t: "Đã lưu bố cục căn cứ ✅" }); router.refresh();
  }

  async function doAttack() {
    if (!attack) return;
    if (!window.confirm(attack.myShield ? "Bạn đang bật khiên. Đi tấn công sẽ làm VỠ khiên của bạn. Vẫn tấn công?" : `Xuất quân tấn công nhà ${data.owner.name}?`)) return;
    setBusyAtk(true); setMsg(null);
    const { data: r, error } = await createClient().rpc("attack", { p_defender: attack.partnerId });
    setBusyAtk(false);
    if (error) { play("wrong"); return setMsg({ ok: false, t: RPC_MSG[error.message] ?? "Không tấn công được" }); }
    setDone(false);
    setBattle({ id: r.id, damage: r.damage, loot: r.loot, hpBefore: data.house.hp, hpAfter: r.hp_after, maxHp: data.house.max_hp, ruined: r.ruined, shieldBroken: r.shield_broken });
  }
  const finishBattle = () => { setBattle(null); setPhase(null); setDone(false); router.refresh(); };

  const shownHp = battle ? (phase === "end" && battle.ruined ? 0 : hpView) : hpView;
  const houseHalf = (hs * TILE) / 2;
  const btn = "pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-xs font-extrabold text-pink-700 shadow hover:bg-white disabled:opacity-50";
  const btnHot = "pointer-events-auto rounded-full bg-pink-500 px-4 py-2 text-sm font-extrabold text-white shadow-lg hover:bg-pink-600 disabled:bg-slate-400";

  return (
    <div className="relative h-full w-full overflow-hidden bg-sky-200" data-testid="base-scene">
      <Canvas shadows dpr={[1, 1.75]} camera={{ position: [W * 0.4, W * 0.48, W * 0.46], fov: 45 }}>
        <color attach="background" args={["#bfe3ff"]} />
        <fog attach="fog" args={["#bfe3ff", W * 1.6, W * 4]} />
        <hemisphereLight args={["#fff1f7", "#6aa84f", 0.95]} />
        <directionalLight position={[W * 0.5, W, W * 0.3]} intensity={1.7} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
          shadow-camera-left={-W * 0.7} shadow-camera-right={W * 0.7} shadow-camera-top={W * 0.7} shadow-camera-bottom={-W * 0.7} shadow-camera-far={W * 3} />
        <OrbitControls ref={controls} makeDefault target={[0, 0, 0]} enableDamping maxPolarAngle={1.15} minPolarAngle={0.35} minDistance={10} maxDistance={W * 2.2} />
        <Suspense fallback={null}>
          <DevHook placed={placed} grid={grid} sizeOf={sizeOf} />
          <Island W={W} grid={grid} editing={editing} />
          <Scenery W={W} />
          <group>
            {data.house.exists ? <HouseModel level={data.house.level} color={data.owner.color} hpPct={shownHp / Math.max(1, data.house.max_hp)} shield={data.shield && !battle} size={hs * TILE} shakeRef={shakeRef} />
              : <Model name="scaffolding" size={hs * TILE * 0.9} />}
            <Html position={[0, hs * TILE * 1.1 + 1.5, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
              <HpBar hpRef={hpRef} max={data.house.max_hp} name={data.owner.name} level={data.house.level} battle={!!battle} />
            </Html>
          </group>
          {placed.map((p) => {
            const it = byKey.get(keyOf(p)); if (!it) return null;
            const k = keyOf(p), isSel = k === sel;
            const pos = isSel && drag && ghost ? ghost : p;
            const c = cellCenter(pos.x, pos.z, it.size, grid);
            return (
              <group key={k} position={[c.x, 0, c.z]} rotation={[0, (p.rot * Math.PI) / 2, 0]} onPointerDown={pickItem(k)}>
                <Suspense fallback={null}><ItemView it={it} color={data.owner.color} sad={shownHp <= 0} defending={!!battle && phase === "fight"} /></Suspense>
                {editing && <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[it.size * TILE - 0.2, it.size * TILE - 0.2]} /><meshBasicMaterial color={isSel ? "#facc15" : "#ffffff"} transparent opacity={isSel ? 0.5 : 0.18} depthWrite={false} /></mesh>}
              </group>
            );
          })}
          {/* vật đang đặt mới từ kho: hiện bóng theo con trỏ */}
          {editing && selItem && ghost && !placedKeys.has(sel!) && (() => { const c = cellCenter(ghost.x, ghost.z, selItem.size, grid); return <group position={[c.x, 0, c.z]}><Suspense fallback={null}><ItemView it={selItem} color={data.owner.color} sad={false} defending={false} /></Suspense></group>; })()}
          {editing && selItem && ghost && <Footprint x={ghost.x} z={ghost.z} s={selItem.size} grid={grid} ok={!ghostErr} />}
          {/* mặt phẳng bắt sự kiện chuột/chạm */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} visible={false} onPointerMove={onGroundMove} onClick={onGroundClick}><planeGeometry args={[W * 3, W * 3]} /><meshBasicMaterial /></mesh>
          {battle && attacker && (
            <Suspense fallback={null}><Battle key={run} result={battle} squads={attacker.squads} color={attacker.color} W={W} houseHalf={houseHalf} hpRef={hpRef} shakeRef={shakeRef}
              onRuin={() => setHpView(0)} onPhase={setPhase} onDone={() => { setDone(true); setHpView(battle.hpAfter); }} /></Suspense>
          )}
        </Suspense>
      </Canvas>

      {/* ---------- HUD ---------- */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[60%] flex-col items-start gap-2">
        <div className="rounded-2xl bg-white/90 px-3 py-1.5 text-sm font-extrabold text-pink-700 shadow">
          {mode === "own" ? "🏠 Căn cứ của tôi" : `🏡 Căn cứ của ${data.owner.name}`} · {HOUSE_NAMES[data.house.level]}{data.shield ? " · 🛡️" : ""}
        </div>
        {mode === "own" && <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-extrabold text-amber-700 shadow">🪙 {coins.toLocaleString("vi-VN")}</div>}
        {msg && <div role="status" className={`pointer-events-auto rounded-xl px-3 py-1.5 text-xs font-bold shadow ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.t}</div>}
      </div>

      {mode === "own" && !editing && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">
          <button className={btnHot} onClick={() => { setEditing(true); setShop(false); setMsg(null); }} data-testid="edit-base">🔨 Xây dựng</button>
          <button className={btnHot} onClick={() => setShop(true)} data-testid="open-shop">🛒 Xây thêm</button>
        </div>
      )}
      {mode === "own" && editing && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap justify-end gap-2">
          <button className={btn} disabled={!sel || !placedKeys.has(sel)} onClick={rotate}>↻ Xoay</button>
          <button className={btn} disabled={!sel || !placedKeys.has(sel)} onClick={store}>📦 Cất vào kho</button>
          <button className={btn} onClick={cancel}>✖ Huỷ</button>
          <button className={btnHot} disabled={saving || !dirty} onClick={save} data-testid="save-layout">{saving ? "Đang lưu…" : "💾 Lưu bố cục"}</button>
        </div>
      )}
      {mode === "own" && editing && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-white/90 p-2 shadow-lg">
          <div className="px-1 pb-1 text-[11px] font-bold text-slate-600">
            {selItem ? <>Đang chọn <b className="text-pink-700">{selItem.emoji} {selItem.nickname ?? selItem.name}</b> — kéo thả, hoặc chạm vào ô trống để chuyển tới đó.</> : "Chạm/kéo một vật trong căn cứ để di chuyển. Vật trong kho: bấm để đặt."}
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

      {/* tấn công nhà người ấy */}
      {mode === "partner" && attack && !battle && (
        <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-md rounded-2xl bg-white/95 p-3 shadow-xl" data-testid="attack-hud">
          <div className="flex items-center justify-around text-center">
            <div><div className="text-xl font-black text-red-600">{attack.atk}</div><div className="text-[10px] font-bold">ATK của bạn</div></div>
            <div className="text-2xl">⚔️</div>
            <div><div className="text-xl font-black text-blue-600">≈ {attack.def}</div><div className="text-[10px] font-bold">DEF người ấy</div></div>
            <div><div className="text-xl font-black text-slate-700">{attack.left}/{attack.total}</div><div className="text-[10px] font-bold">Lượt hôm nay</div></div>
          </div>
          {attacker && attacker.squads.length > 0 && <div className="mt-1 text-center text-[11px] font-semibold text-slate-600">Quân xuất trận: {attacker.squads.map((s) => `${s.unit === "sword" ? "🗡️" : s.unit === "archer" ? "🏹" : s.unit === "knight" ? "🐎" : "🪨"}×${s.qty}`).join(" ")}</div>}
          {attack.myShield && !attack.reason && <p className="mt-1 text-center text-xs font-bold text-amber-700">⚠️ Tấn công sẽ làm vỡ khiên của bạn.</p>}
          {attack.reason && <p className="mt-1 text-center text-xs font-bold text-amber-700">{attack.reason}</p>}
          <button className={`${btnHot} mt-2 w-full`} disabled={!!attack.reason || busyAtk} onClick={doAttack} data-testid="attack-btn">{busyAtk ? "Đang xuất quân…" : "⚔️ Xuất quân tấn công!"}</button>
        </div>
      )}
      {battle && !done && (
        <button onClick={() => { setDone(true); setHpView(battle.hpAfter); hpRef.current = battle.hpAfter; }} className="absolute bottom-3 right-3 z-10 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 shadow">Bỏ qua ⏭</button>
      )}
      {battle && done && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4" data-testid="battle-result">
          <div className="w-full max-w-sm rounded-3xl border-4 border-white bg-white p-5 text-center shadow-2xl">
            <div className="text-5xl">{battle.ruined ? "💥" : "⚔️"}</div>
            <h2 className="mt-1 text-xl font-black text-pink-700">{battle.ruined ? "Nhà người ấy đổ nát!" : "Trận đánh kết thúc"}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-red-50 p-2"><div className="text-2xl font-black text-red-600" data-testid="battle-damage">−{battle.damage}</div><div className="text-[11px] font-bold">HP gây ra</div></div>
              <div className="rounded-xl bg-amber-50 p-2"><div className="text-2xl font-black text-amber-600">+{battle.loot}</div><div className="text-[11px] font-bold">xu chiến lợi phẩm</div></div>
            </div>
            <p className="mt-2 text-sm font-semibold">HP còn lại: <b>{battle.hpAfter}/{battle.maxHp}</b>{battle.shieldBroken ? " · khiên của bạn đã vỡ" : ""}</p>
            <div className="mt-4 flex flex-col gap-2">
              {mode === "partner" ? <button onClick={finishBattle} className={btnHot}>Xong</button> : <button onClick={() => { setDone(false); setPhase(null); hpRef.current = battle.hpBefore; setHpView(battle.hpBefore); setRun((n) => n + 1); }} className={btnHot}>↺ Xem lại</button>}
              {battle.id && mode === "partner" && <Link href={`/battle/${battle.id}`} className="text-sm font-bold text-pink-600 underline">Xem lại trận</Link>}
              <Link href="/battles" className="text-sm font-bold text-pink-600 underline">📜 Nhật ký trận</Link>
            </div>
          </div>
        </div>
      )}
      {!editing && !battle && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-0 hidden rounded-xl bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-pink-800 sm:block">🖱️ Kéo để xoay · cuộn để zoom · chuột phải để di chuyển</div>
      )}
    </div>
  );
}
