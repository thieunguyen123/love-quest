"use client";
import { Suspense, forwardRef, useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { colorVariant, modelUrl, Heart } from "@/components/three/models";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, BallCollider, CuboidCollider, useRapier, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { drive, yawOf, type Input } from "./physics";

export type CarPose = { x: number; y?: number; z: number; h: number; speed: number };
export type CamMode = "iso" | "follow";
const WHEEL_R = 0.38;

// Thân xe low-poly; bánh trước bẻ lái, bánh quay theo tốc độ; đèn phanh sáng khi phanh/lùi
const ProcCar = forwardRef<THREE.Group, { color: string; wheels?: React.RefObject<THREE.Group[]>; brake?: React.RefObject<THREE.MeshStandardMaterial | null> }>(
  function ProcCar({ color, wheels, brake }, ref) {
    return (
      <group ref={ref} position={[0, WHEEL_R - 0.05, 0]}>
        <mesh castShadow position={[0, 0.35, 0]}><boxGeometry args={[1.6, 0.55, 2.9]} /><meshStandardMaterial color={color} flatShading /></mesh>
        <mesh castShadow position={[0, 0.85, -0.15]}><boxGeometry args={[1.3, 0.5, 1.5]} /><meshStandardMaterial color={color} flatShading /></mesh>
        <mesh position={[0, 0.86, 0.61]} rotation={[-0.35, 0, 0]}><planeGeometry args={[1.2, 0.5]} /><meshStandardMaterial color="#bae6fd" metalness={0.4} roughness={0.1} /></mesh>
        <mesh position={[0, 0.86, -0.91]} rotation={[0.35, Math.PI, 0]}><planeGeometry args={[1.2, 0.45]} /><meshStandardMaterial color="#bae6fd" metalness={0.4} roughness={0.1} /></mesh>
        {/* đèn pha + đèn hậu */}
        {[-0.55, 0.55].map((x) => <mesh key={`h${x}`} position={[x, 0.42, 1.46]}><boxGeometry args={[0.32, 0.16, 0.04]} /><meshStandardMaterial color="#fffbeb" emissive="#fde68a" emissiveIntensity={1.2} /></mesh>)}
        {[-0.55, 0.55].map((x) => <mesh key={`t${x}`} position={[x, 0.45, -1.46]}><boxGeometry args={[0.3, 0.14, 0.04]} /><meshStandardMaterial ref={x < 0 ? brake : undefined} color="#7f1d1d" emissive="#ef4444" emissiveIntensity={0.3} /></mesh>)}
        {/* tim trên nóc */}
        <mesh position={[0, 1.2, -0.15]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.25, 0.25, 0.08]} /><meshStandardMaterial color="#ec4899" emissive="#ec4899" emissiveIntensity={0.4} /></mesh>
        {[[-0.85, 0.95], [0.85, 0.95], [-0.85, -0.95], [0.85, -0.95]].map(([x, z], i) => (
          <group key={i} position={[x, 0.05, z]} ref={(g) => { if (g && wheels?.current) wheels.current[i] = g; }}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.28, 14]} /><meshStandardMaterial color="#1f2937" flatShading /></mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.16, 0.16, 0.3, 8]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
          </group>
        ))}
      </group>
    );
  },
);

// Ô tô KayKit (bánh xe là node riêng → quay & bẻ lái được). Mẫu xe theo màu yêu thích; cờ tim cùng màu trên nóc
const CAR_BY_COLOR = { red: "car_hatchback", blue: "car_sedan", green: "car_stationwagon", yellow: "car_taxi" } as const;
const CAR_LEN = 3.1;
function KayKitCar({ color, wheels, brake }: { color: string; wheels?: React.RefObject<THREE.Group[]>; brake?: React.RefObject<THREE.MeshStandardMaterial | null> }) {
  const name = CAR_BY_COLOR[colorVariant(color)];
  const { scene } = useGLTF(modelUrl(name));
  const obj = useMemo(() => { const c = scene.clone(true); c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return c; }, [scene]);
  useEffect(() => {
    if (!wheels?.current) return;
    ["front_left", "front_right", "rear_left", "rear_right"].forEach((k, i) => { const w = obj.getObjectByName(`${name}_wheel_${k}`); if (w) wheels.current[i] = w as THREE.Group; });
  }, [obj, name, wheels]);
  const s = CAR_LEN / 0.94;
  return (
    <group>
      <primitive object={obj} scale={s} position={[0, 0.06 * s, 0]} />
      {/* đèn phanh + cờ tim trên nóc */}
      {[-0.42, 0.42].map((x) => <mesh key={x} position={[x, 0.62, -1.62]}><boxGeometry args={[0.3, 0.12, 0.04]} /><meshStandardMaterial ref={x < 0 ? brake : undefined} color="#7f1d1d" emissive="#ef4444" emissiveIntensity={0.3} /></mesh>)}
      <mesh position={[0.35, 1.7, -0.6]}><cylinderGeometry args={[0.03, 0.03, 1.1, 6]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
      <Heart position={[0.35, 2.3, -0.6]} scale={0.22} color={color} />
    </group>
  );
}
export const CarMesh = forwardRef<THREE.Group, { color: string; wheels?: React.RefObject<THREE.Group[]>; brake?: React.RefObject<THREE.MeshStandardMaterial | null> }>(
  function CarMesh(p, ref) {
    return <group ref={ref}><Suspense fallback={<ProcCar {...p} />}><KayKitCar {...p} /></Suspense></group>;
  },
);

// Bụi tung lên phía sau khi chạy nhanh / phanh gấp
function useDust() {
  const N = 18;
  const meshes = useRef<THREE.Mesh[]>([]);
  const life = useRef<number[]>(Array(N).fill(0));
  const next = useRef(0);
  const acc = useRef(0);
  const el = (
    <>{Array.from({ length: N }).map((_, i) => (
      <mesh key={i} visible={false} ref={(m) => { if (m) meshes.current[i] = m; }}>
        <icosahedronGeometry args={[0.35, 0]} /><meshStandardMaterial color="#e7d8b8" transparent opacity={0.7} depthWrite={false} flatShading />
      </mesh>
    ))}</>
  );
  const update = (dt: number, emit: boolean, at: THREE.Vector3) => {
    acc.current += dt;
    if (emit && acc.current > 0.04) {
      acc.current = 0;
      const i = next.current = (next.current + 1) % N;
      const m = meshes.current[i]; if (m) { m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 0.6)); life.current[i] = 1; }
    }
    meshes.current.forEach((m, i) => {
      if (!m) return;
      const l = (life.current[i] = Math.max(0, life.current[i] - dt * 1.6));
      m.visible = l > 0;
      if (l > 0) { m.position.y += dt * 1.2; m.scale.setScalar(0.5 + (1 - l) * 1.4); (m.material as THREE.MeshStandardMaterial).opacity = 0.6 * l; }
    });
  };
  return { el, update };
}

type Props = {
  color: string; start: { x: number; z: number; h: number };
  input: React.RefObject<() => Input>; pose: React.RefObject<CarPose>; paused: React.RefObject<boolean>;
  cam: React.RefObject<{ mode: CamMode; zoom: number }>; respawn: React.RefObject<number>;
  light: React.RefObject<THREE.DirectionalLight | null>;
};

export function Car({ color, start, input, pose, paused, cam, respawn, light }: Props) {
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group[]>([]);
  const brake = useRef<THREE.MeshStandardMaterial>(null);
  const spin = useRef(0);
  const lastRespawn = useRef(respawn.current);
  const { world, rapier } = useRapier();
  const { camera } = useThree();
  const dust = useDust();
  const tmp = useRef({ p: new THREE.Vector3(), camT: new THREE.Vector3(), look: new THREE.Vector3(), rear: new THREE.Vector3() }).current;

  useFrame((_, dtRaw) => {
    const b = body.current; if (!b) return;
    const dt = Math.min(dtRaw, 0.05);
    const t = b.translation(), lv = b.linvel(), h = yawOf(b.rotation());
    const fx = Math.sin(h), fz = Math.cos(h);
    const fwd = lv.x * fx + lv.z * fz;

    // về điểm xuất phát (phím R) hoặc rơi khỏi bản đồ
    if (respawn.current !== lastRespawn.current || t.y < -5) {
      lastRespawn.current = respawn.current;
      b.setTranslation({ x: start.x, y: 1.2, z: start.z }, true);
      b.setRotation({ x: 0, y: Math.sin(start.h / 2), z: 0, w: Math.cos(start.h / 2) }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    const inp: Input = paused.current ? { throttle: 0, steer: 0, brake: true } : input.current();
    // chỉ điều khiển được khi bánh chạm đất; đang bay thì giữ quán tính
    const hit = world.castRay(new rapier.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }), 0.95, true, undefined, undefined, undefined, b);
    const grounded = hit !== null;
    if (grounded) {
      const { speed, yawRate } = drive(fwd, inp, dt);
      b.setLinvel({ x: fx * speed, y: lv.y, z: fz * speed }, true);
      b.setAngvel({ x: 0, y: yawRate, z: 0 }, true);
    } else {
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    // hình ảnh: nghiêng thân theo dốc/rẽ, bánh quay & bẻ lái, đèn phanh
    if (tilt.current) {
      const pitch = THREE.MathUtils.clamp(-Math.atan2(lv.y, Math.max(4, Math.abs(fwd))), -0.5, 0.5);
      const roll = THREE.MathUtils.clamp(-inp.steer * Math.min(1, Math.abs(fwd) / 15) * 0.08, -0.1, 0.1);
      tilt.current.rotation.x += (pitch - tilt.current.rotation.x) * Math.min(1, dt * 10);
      tilt.current.rotation.z += (roll - tilt.current.rotation.z) * Math.min(1, dt * 8);
    }
    spin.current += (fwd * dt) / WHEEL_R;
    wheels.current.forEach((w, i) => { if (!w) return; w.rotation.set(spin.current, i < 2 ? inp.steer * 0.45 : 0, 0, "YXZ"); });
    if (brake.current) brake.current.emissiveIntensity = inp.brake || (inp.throttle < -0.05 && fwd > 0.5) ? 2.5 : 0.3;

    // vị trí đã nội suy của phần hình (mượt hơn đọc thẳng từ vật lý)
    visual.current?.getWorldPosition(tmp.p);
    tmp.rear.set(tmp.p.x - fx * 1.6, 0.25, tmp.p.z - fz * 1.6);
    dust.update(dt, grounded && (Math.abs(fwd) > 12 || (!!inp.brake && Math.abs(fwd) > 3)), tmp.rear);
    pose.current = { x: tmp.p.x, y: t.y, z: tmp.p.z, h, speed: fwd };

    // camera: "iso" góc cố định kiểu bruno-simon, "follow" bám sau đuôi xe
    const { mode, zoom } = cam.current;
    if (mode === "iso") tmp.camT.set(tmp.p.x + 11 * zoom, tmp.p.y + 15 * zoom, tmp.p.z + 15 * zoom);
    else tmp.camT.set(tmp.p.x - fx * 11 * zoom, tmp.p.y + 6 * zoom, tmp.p.z - fz * 11 * zoom);
    camera.position.lerp(tmp.camT, 1 - Math.pow(0.004, dt));
    tmp.look.set(tmp.p.x + fx * Math.min(4, Math.abs(fwd) * 0.25), tmp.p.y + 0.5, tmp.p.z + fz * Math.min(4, Math.abs(fwd) * 0.25));
    camera.lookAt(tmp.look);

    // bóng đổ đi theo xe (khung bóng nhỏ → nét)
    const L = light.current;
    if (L) { L.position.set(tmp.p.x + 20, 40, tmp.p.z + 12); L.target.position.set(tmp.p.x, 0, tmp.p.z); L.target.updateMatrixWorld(); }
  });

  return (
    <>
      <RigidBody ref={body} colliders={false} position={[start.x, 1.2, start.z]} rotation={[0, start.h, 0]}
        enabledRotations={[false, true, false]} angularDamping={6} linearDamping={0.1} ccd canSleep={false}>
        <BallCollider args={[0.6]} friction={0} density={3} />
        <CuboidCollider args={[0.8, 0.32, 1.4]} position={[0, 0.4, 0]} friction={0} density={3} />
        <group ref={visual} position={[0, -0.6, 0]}>
          <group ref={tilt}><CarMesh color={color} wheels={wheels} brake={brake} /></group>
        </group>
      </RigidBody>
      {dust.el}
    </>
  );
}
