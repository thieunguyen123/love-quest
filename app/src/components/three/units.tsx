"use client";
// Quân đội 3D: lính (nhân vật KayKit có hoạt ảnh) + máy bắn đá tự thiết kế. Mỗi loại lính = 1 đội trên lưới căn cứ.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { cutify, Model, modelUrl, preloadModels } from "./models";
import { Badge } from "./quality";

preloadModels(["unit_catapult", "unit_horse", "weapon_bow"]);

export type Anim = "idle" | "walk" | "run" | "attack" | "cheer" | "hit" | "dead";
type UnitDef = {
  model: string; keep: string[]; attack: string; ranged: boolean; range: number; projectile: "arrow" | "stone" | "magic" | null;
  /** quái vật Quaternius: tên hoạt ảnh khác KayKit + cao hơn/thấp hơn lính thường */
  monster?: { clips: Partial<Record<Anim, string>>; scale: number };
  bow?: boolean;          // cầm cung (Kenney) ở tay trái thay cho nỏ
  mount?: "horse";        // cưỡi ngựa (Quaternius Horse)
};
const MONSTER_CLIPS: Partial<Record<Anim, string>> = { idle: "Idle", walk: "Walk", run: "Run", attack: "Punch", cheer: "Yes", hit: "HitReact", dead: "Death" };
// Phụ kiện được giữ lại trên người (còn lại ẩn đi): mỗi loại lính cầm đúng vũ khí của mình
export const UNIT_DEFS: Record<string, UnitDef> = {
  sword: { model: "knight", keep: ["1H_Sword", "Round_Shield", "Knight_Helmet", "Knight_Cape"], attack: "1H_Melee_Attack_Chop", ranged: false, range: 1.2, projectile: null },
  archer: { model: "rogue", keep: ["Rogue_Cape"], attack: "2H_Ranged_Shoot", ranged: true, range: 9, projectile: "arrow", bow: true },
  knight: { model: "barbarian", keep: ["1H_Axe", "Barbarian_Round_Shield", "Barbarian_Hat", "Barbarian_Cape"], attack: "1H_Melee_Attack_Chop", ranged: false, range: 1.6, projectile: null, mount: "horse" },
  catapult: { model: "", keep: [], attack: "", ranged: true, range: 14, projectile: "stone" },
  mage: { model: "mage", keep: ["2H_Staff", "Mage_Hat", "Mage_Cape"], attack: "Spellcast_Shoot", ranged: true, range: 7, projectile: "magic" },
  ninja: { model: "unit_ninja", keep: [], attack: "Punch", ranged: false, range: 1.4, projectile: null, monster: { clips: { ...MONSTER_CLIPS, attack: "Weapon" }, scale: 1.0 } },
  yeti: { model: "unit_yeti", keep: [], attack: "Punch", ranged: false, range: 1.8, projectile: null, monster: { clips: MONSTER_CLIPS, scale: 1.45 } },
};
const ACCESSORIES = ["1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "1H_Sword", "2H_Sword", "Knight_Helmet", "Knight_Cape",
  "Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Knife", "Throwable", "Rogue_Cape", "1H_Axe_Offhand", "Barbarian_Round_Shield", "1H_Axe", "2H_Axe", "Mug", "Barbarian_Hat", "Barbarian_Cape",
  "Spellbook", "Spellbook_open", "1H_Wand", "2H_Staff", "Mage_Hat", "Mage_Cape"];
const CLIP: Record<Exclude<Anim, "attack">, string> = { idle: "Idle", walk: "Walking_A", run: "Running_A", cheer: "Cheer", hit: "Hit_A", dead: "Death_A" };

/** 1 người lính có hoạt ảnh. `phase` lệch nhịp để cả đội không cử động y hệt nhau */
// Tư thế cầm cung trên xương tay trái (handslot.l), đơn vị = đơn vị mô hình KayKit (nhân vật cao ~2.4)
export const BOW_POSE = { pos: [0, 0.05, 0.02] as [number, number, number], rot: [Math.PI / 2, Math.PI / 2, 0] as [number, number, number], len: 1.4 };
// xương thân dưới: khi cưỡi ngựa lấy từ tư thế ngồi, thân trên vẫn chạy hoạt ảnh đánh/vẫy
const LOWER = /(upperleg|lowerleg|foot|toes|hips|IK-|control-)/;
const trackBone = (t: THREE.KeyframeTrack) => t.name.split(".").slice(0, -1).join(".");
function seatedClips(clips: THREE.AnimationClip[]) {
  const sit = clips.find((c) => c.name === "Sit_Chair_Pose");
  const out = clips.map((c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter((t) => !LOWER.test(trackBone(t)))));
  if (sit) out.push(new THREE.AnimationClip("__seat", sit.duration, sit.tracks.filter((t) => LOWER.test(trackBone(t)))));
  return out;
}

export function Soldier({ unit, anim = "idle", height = 1.7, phase = 0, tint, shadows = true, seated = false }: { unit: string; anim?: Anim; height?: number; phase?: number; tint?: string; shadows?: boolean; seated?: boolean }) {
  const def = UNIT_DEFS[unit] ?? UNIT_DEFS.sword;
  const { scene, animations: rawClips } = useGLTF(modelUrl(def.model));
  const bowGltf = useGLTF(modelUrl("weapon_bow"));
  const animations = useMemo(() => (seated ? seatedClips(rawClips) : rawClips), [rawClips, seated]);
  if (def.monster) cutify(scene);
  const root = useRef<THREE.Group>(null);
  const fit = useMemo(() => { const b = new THREE.Box3().setFromObject(scene); return { h: Math.max(0.01, b.max.y - b.min.y), y0: -b.min.y }; }, [scene]);
  const obj = useMemo(() => {
    const c = skeletonClone(scene) as THREE.Group;
    c.traverse((o) => {
      if (ACCESSORIES.includes(o.name)) o.visible = def.keep.includes(o.name);
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = shadows; m.frustumCulled = false;
        if (tint && /Cape/.test(o.name)) { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.set(tint); }
      }
    });
    if (def.bow) {   // gắn cây cung vào tay trái
      const slot = c.getObjectByName("handslotl") ?? c.getObjectByName("handslot.l");   // GLTFLoader bỏ dấu "." trong tên node
      if (slot) {
        const bow = bowGltf.scene.clone(true);
        const box = new THREE.Box3().setFromObject(bowGltf.scene), k = BOW_POSE.len / Math.max(0.01, box.max.y - box.min.y);
        const holder = new THREE.Group();
        holder.position.set(...BOW_POSE.pos); holder.rotation.set(...BOW_POSE.rot);
        // xương handslot có hệ số co giãn riêng → bù lại để cung đúng cỡ so với nhân vật
        c.updateMatrixWorld(true); const ws = new THREE.Vector3(); slot.getWorldScale(ws); holder.scale.setScalar(1 / Math.max(1e-4, ws.x));
        bow.scale.setScalar(k); bow.position.set(-(box.min.x + box.max.x) / 2 * k, -(box.min.y + box.max.y) / 2 * k, -(box.min.z + box.max.z) / 2 * k);
        bow.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = shadows; m.frustumCulled = false; } });
        holder.add(bow); slot.add(holder);
      }
    }
    return c;
  }, [scene, def, tint, shadows, bowGltf]);
  // nhân vật KayKit cao ~2.4 đơn vị kể cả mũ → co về `height` mét; quái vật: co theo hộp bao × tỉ lệ riêng
  const s = def.monster ? (height * def.monster.scale) / fit.h : height / 2.35;
  const { actions } = useAnimations(animations, root);
  useEffect(() => {   // cưỡi ngựa: thân dưới luôn ngồi
    const seat = seated ? actions["__seat"] : null;
    seat?.reset().play();
    return () => { seat?.stop(); };
  }, [actions, seated]);
  useEffect(() => {
    const name = def.monster ? def.monster.clips[anim] ?? "Idle" : anim === "attack" ? def.attack : seated && (anim === "run" || anim === "walk") ? "Idle" : CLIP[anim];
    const a = actions[name]; if (!a) return;
    a.reset();
    if (anim === "dead") { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.time = (phase * 0.37) % Math.max(0.1, a.getClip().duration);
    a.fadeIn(0.25).play();
    return () => { a.fadeOut(0.25); };
  }, [actions, anim, def, phase, seated]);
  return <group ref={root} scale={s}><primitive object={obj} position={[0, def.monster ? fit.y0 : 0, 0]} /></group>;
}

/** Máy bắn đá (Kenney Castle Kit, CC0): khi bắn thì cả cỗ máy chồm lên – giật lùi theo nhịp, bánh xe lắc */
export function Catapult({ firing = false, phase = 0, scale = 1 }: { firing?: boolean; phase?: number; scale?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    if (!firing) { g.current.rotation.x = 0; g.current.position.z = 0; return; }
    const t = ((clock.elapsedTime + phase) % 2.2) / 2.2;            // 0..1: kéo về (chậm) → bung (nhanh)
    const k = t < 0.75 ? t / 0.75 : 1 - (t - 0.75) / 0.25;
    g.current.rotation.x = -0.12 * k + (t >= 0.75 ? 0.18 * (1 - k) : 0);
    g.current.position.z = -0.25 * k;
  });
  return <group scale={scale}><group ref={g}><Model name="unit_catapult" size={2.4} /></group></group>;
}

// ngựa trắng kem, bờm & đuôi hồng — hợp tông "Làng Tình Yêu"
const HORSE_PALETTE = { Main: "#fff4e6", Main_Dark: "#ead9c4", Main_Light: "#ffffff", Hair: "#f7a8c4", Hooves: "#8a6a55", Muzzle: "#f3c9b8", Eye_White: "#ffffff", Eye_Black: "#1b1b22" };
const HORSE_CLIP: Record<Anim, string> = { idle: "Idle", walk: "Walk", run: "Gallop", attack: "Attack_Kick", cheer: "Idle", hit: "Idle", dead: "Death" };
/** Kỵ binh: ngựa Quaternius (có hoạt ảnh đứng / đi / phi / đá hậu) + kỵ sĩ KayKit ngồi trên yên, thân trên vung rìu */
export function Mounted({ unit, anim = "idle", height = 1.7, phase = 0, tint, shadows = true }: { unit: string; anim?: Anim; height?: number; phase?: number; tint?: string; shadows?: boolean }) {
  const { scene, animations } = useGLTF(modelUrl("unit_horse"));
  cutify(scene, HORSE_PALETTE);
  const root = useRef<THREE.Group>(null);
  const { obj, s } = useMemo(() => {
    const c = skeletonClone(scene) as THREE.Group;
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = shadows; m.frustumCulled = false; } });
    const b = new THREE.Box3().setFromObject(scene);
    return { obj: c, s: (height * 1.05) / Math.max(0.01, b.max.y - b.min.y) };
  }, [scene, height, shadows]);
  const { actions } = useAnimations(animations, root);
  useEffect(() => {
    const a = actions[HORSE_CLIP[anim]] ?? actions.Idle; if (!a) return;
    a.reset(); a.time = (phase * 0.41) % Math.max(0.1, a.getClip().duration);
    if (anim === "dead") { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.fadeIn(0.25).play();
    return () => { a.fadeOut(0.25); };
  }, [actions, anim, phase]);
  // yên ngựa: ~58% chiều cao ngựa, lùi về sau một chút (mô hình ngựa quay mặt +Z)
  return (
    <group>
      <group ref={root} scale={s}><primitive object={obj} /></group>
      <group position={[0, height * 0.42, -height * 0.08]}><Soldier unit={unit} anim={anim} phase={phase} height={height * 0.8} tint={tint} shadows={shadows} seated /></group>
    </group>
  );
}

/** 1 người/1 cỗ máy của loại lính bất kỳ */
export function UnitFigure({ unit, anim = "idle", height = 1.7, phase = 0, tint, shadows = true, catapultScale = 1 }: { unit: string; anim?: Anim; height?: number; phase?: number; tint?: string; shadows?: boolean; catapultScale?: number }) {
  if (unit === "catapult") return <Catapult firing={anim === "attack"} phase={phase * 0.4} scale={catapultScale} />;
  if (UNIT_DEFS[unit]?.mount) return <Mounted unit={unit} anim={anim} phase={phase} height={height} tint={tint} shadows={shadows} />;
  return <Soldier unit={unit} anim={anim} phase={phase} height={height} tint={tint} shadows={shadows} />;
}

/** Vị trí từng người trong đội (đội chiếm ô vuông `w` mét) */
export function squadOffsets(n: number, w: number, cap = 4): [number, number][] {
  const k = Math.min(4, cap, Math.max(1, n));
  if (k === 1) return [[0, 0]];
  const d = w * 0.22;
  return ([[-d, -d], [d, d], [d, -d], [-d, d]] as [number, number][]).slice(0, k);
}

/** 1 đội lính trên ô 2×2: tối đa 4 người + nhãn số lượng */
export function Squad({ unit, qty, anim = "idle", width = 4, label = true, tint, height = 1.7, cap = 4, shadows = true }: { unit: string; qty: number; anim?: Anim; width?: number; label?: boolean; tint?: string; height?: number; cap?: number; shadows?: boolean }) {
  const offs = squadOffsets(unit === "catapult" ? 1 : qty, width, UNIT_DEFS[unit]?.mount ? Math.min(cap, 2) : cap);   // ngựa dài → tối đa 2 con / ô
  return (
    <group>
      {offs.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <UnitFigure unit={unit} anim={anim} phase={i} height={height} tint={tint} shadows={shadows} catapultScale={width / 3.2} />
        </group>
      ))}
      {label && <Badge text={`×${qty}`} position={[0, unit === "catapult" ? 2.7 : height + 0.7, 0]} h={0.7} wide={2.5} />}
    </group>
  );
}
