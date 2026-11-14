"use client";
// Thú cưng 3D "mắt to" có hoạt ảnh thật (Quaternius Colorful Monsters, CC0). TIẾN HOÁ theo cấp (BASE-03):
//   Lv1 Sơ sinh · Lv2 Lớn (to hơn) · Lv3 TIẾN HOÁ (đổi sang mô hình tiến hoá; loài không có thì đổi bộ lông "phép thuật")
//   Lv4 Hào quang (vòng sáng dưới chân) · Lv5 Huyền thoại (vương miện + lấp lánh). Lên cấp → lóe sáng + nảy.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { cutify, modelUrl, Pop } from "./models";
import { Badge } from "./quality";

type PetDef = {
  model: string; evo?: string; h: number; idle: string; move: string; happy: string; fly?: number;
  /** bộ lông "phép thuật" khi tiến hoá (loài không có mô hình tiến hoá) — theo tên vật liệu */
  magic?: Record<string, string>; aura: string;
};
const GROUND = { idle: "Idle", move: "Walk" }, AIR = { idle: "Flying_Idle", move: "Fast_Flying", fly: 0.7 };
export const PETS: Record<string, PetDef> = {
  cat: { model: "pet_cat", h: 0.95, ...GROUND, happy: "Dance", aura: "#ffd166", magic: { Cat_Main: "#ffd76a", Cat_Secondary: "#ff9f1c", Ears: "#ff7eb6" } },          // Mèo thần tài
  corgi: { model: "pet_corgi", h: 0.9, ...GROUND, happy: "Jump", aura: "#7cc8ff", magic: { Dog_Main: "#8fd0ff", Dog_Secondary: "#ffffff" } },                        // Chó mây
  owl: { model: "pet_owl", h: 0.95, ...GROUND, happy: "Dance", aura: "#c4b5fd", magic: { Pigeon_Main: "#f4f1ea", Pigeon_Secondary: "#ffcf4a" } },                    // Cú tuyết
  mushnub: { model: "pet_mushnub", evo: "pet_mushnub_evo", h: 1.0, ...GROUND, happy: "Dance", aura: "#86efac" },
  dragon: { model: "pet_dragon", evo: "pet_dragon_evo", h: 0.85, ...AIR, happy: "Yes", aura: "#ff8fb8" },
  armabee: { model: "pet_armabee", evo: "pet_armabee_evo", h: 0.8, ...AIR, happy: "Yes", aura: "#fde047" },
  glub: { model: "pet_glub", evo: "pet_glub_evo", h: 0.8, ...AIR, happy: "Yes", aura: "#a78bfa" },
  alpaking: { model: "pet_alpaking", evo: "pet_alpaking_evo", h: 0.85, ...AIR, happy: "Yes", aura: "#fbbf24" },
  goleling: { model: "pet_goleling", evo: "pet_goleling_evo", h: 0.85, ...AIR, happy: "Yes", aura: "#4ade80" },
};
export const EVO_NAMES = ["", "Sơ sinh", "Lớn", "Tiến hoá", "Hào quang", "Huyền thoại"];
const STAGE_SCALE = [1, 1, 1.15, 1.32, 1.42, 1.55];

function PetBody({ model, def, anim, sad, phase, magic }: { model: string; def: PetDef; anim: string; sad: boolean; phase: number; magic?: Record<string, string> }) {
  const { scene, animations } = useGLTF(modelUrl(model));
  cutify(scene);
  const root = useRef<THREE.Group>(null);
  const { obj, s, y0 } = useMemo(() => {
    const c = skeletonClone(scene) as THREE.Group;
    c.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (magic && magic[mat.name]) { const n = mat.clone(); n.color.set(magic[mat.name]); n.emissive.set(magic[mat.name]); n.emissiveIntensity = 0.18; m.material = n; }
    });
    const box = new THREE.Box3().setFromObject(scene);
    return { obj: c, s: def.h / Math.max(0.01, box.max.y - box.min.y), y0: -box.min.y };
  }, [scene, def, magic]);
  const { actions } = useAnimations(animations, root);
  useEffect(() => {
    const a = actions[anim] ?? actions[def.idle]; if (!a) return;
    a.reset(); a.time = (phase * 0.37) % Math.max(0.1, a.getClip().duration);
    a.setEffectiveTimeScale(sad ? 0.45 : 1).fadeIn(0.25).play();
    return () => { a.fadeOut(0.25); };
  }, [actions, anim, def, phase, sad]);
  return <group ref={root} scale={s}><primitive object={obj} position={[0, y0, 0]} /></group>;
}

/** Vòng hào quang dưới chân (Lv4+) */
function Aura({ color, r }: { color: string; r: number }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!m.current) return;
    const k = 1 + Math.sin(clock.elapsedTime * 3) * 0.08;
    m.current.scale.set(k, k, 1); m.current.rotation.z = clock.elapsedTime * 0.8;
    (m.current.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(clock.elapsedTime * 3) * 0.15;
  });
  return <mesh ref={m} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[r * 0.55, r, 24, 1, 0, Math.PI * 1.7]} /><meshBasicMaterial color={color} transparent depthWrite={false} side={THREE.DoubleSide} /></mesh>;
}
/** Lấp lánh quanh thú cưng (Lv5) */
function Sparkles({ color, r, h }: { color: string; r: number; h: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.rotation.y = clock.elapsedTime * 0.9;
    g.current.children.forEach((c, i) => { const t = (clock.elapsedTime * 0.7 + i / 5) % 1; c.position.y = h * (0.2 + t * 0.9); c.scale.setScalar(Math.sin(t * Math.PI) * 0.12); });
  });
  return <group ref={g}>{[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[Math.cos(i * 1.26) * r, 0, Math.sin(i * 1.26) * r]}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={i % 2 ? "#fff7c2" : color} /></mesh>)}</group>;
}
/** Lóe sáng khi vừa tiến hoá / lên cấp */
function EvolveFlash({ k, r }: { k: number; r: number }) {
  const m = useRef<THREE.Mesh>(null);
  const t = useRef(2), last = useRef<number | null>(null);
  useFrame((_, dt) => {
    if (last.current === null) { last.current = k; return; }   // lần đầu hiện: không lóe
    if (last.current !== k) { last.current = k; t.current = 0; }
    t.current += dt;
    if (!m.current) return;
    const x = t.current / 0.8;
    m.current.visible = x < 1;
    if (x < 1) { m.current.scale.setScalar(r * (0.4 + x * 2.2)); (m.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - x); }
  });
  return <mesh ref={m} position={[0, r * 0.8, 0]} visible={false}><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#ffffff" transparent depthWrite={false} /></mesh>;
}

export function Pet({ code, level = 1, name, wander = 0, sad = false, phase = 0, scale = 1.6 }: { code: string; level?: number; name?: string; wander?: number; sad?: boolean; phase?: number; scale?: number }) {
  const def = PETS[code] ?? PETS.cat;
  const lv = Math.max(1, Math.min(5, level));
  const evolved = lv >= 3;
  const model = evolved && def.evo ? def.evo : def.model;
  const magic = evolved && !def.evo ? def.magic : undefined;
  const g = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  const t = useRef(phase);
  const roam = wander > 1;   // đi dạo vòng quanh (làng) hay đứng tại ô (căn cứ)
  const [anim, setAnim] = useState(roam ? def.move : def.idle);
  useEffect(() => {
    if (roam || sad) { setAnim(roam ? def.move : def.idle); return; }
    let on = false;
    const iv = setInterval(() => { on = !on; setAnim(on ? def.happy : def.idle); }, on ? 2200 : 5000 + (phase % 7) * 600);
    return () => clearInterval(iv);
  }, [roam, sad, def, phase]);
  useFrame((_, dt) => {
    t.current += dt * (sad ? 0.35 : 1);
    const k = t.current;
    if (g.current && roam) {
      const a = k * 0.3 + phase;
      g.current.position.set(Math.cos(a) * wander, 0, Math.sin(a) * wander);
      g.current.rotation.y = -a + Math.PI;     // mặt trước (+Z) theo chiều đi
    } else if (g.current && wander > 0) {
      g.current.rotation.y = Math.sin(k * 0.4 + phase) * 0.9;   // ngó nghiêng
    }
    if (body.current) body.current.position.y = (def.fly ?? 0) * scale + (def.fly ? Math.sin(k * 2.2) * 0.12 : 0);
  });
  const s = scale * STAGE_SCALE[lv];
  const top = (def.h + (def.fly ?? 0)) * s;
  return (
    <group ref={g}>
      <Pop k={`${model}${lv}`} strength={1.4}>
        <group ref={body} rotation={[sad ? 0.3 : 0, 0, 0]} scale={s}><PetBody model={model} def={def} anim={sad ? def.idle : anim} sad={sad} phase={phase} magic={magic} /></group>
      </Pop>
      <EvolveFlash k={lv} r={def.h * s} />
      {lv >= 4 && !sad && <Aura color={def.aura} r={0.55 * s} />}
      {lv >= 5 && !sad && <Sparkles color={def.aura} r={0.6 * s} h={top} />}
      {lv >= 5 && <mesh position={[0, top + 0.12, 0]}><coneGeometry args={[0.12 * s, 0.2 * s, 5]} /><meshStandardMaterial color="#facc15" metalness={0.7} roughness={0.2} emissive="#facc15" emissiveIntensity={0.3} /></mesh>}
      {name && <Badge text={`${sad ? "😢 " : lv >= 3 ? "✨ " : ""}${name} · Lv${lv}`} position={[0, top + 0.55, 0]} h={0.5} wide={5} fg="#be185d" />}
    </group>
  );
}
