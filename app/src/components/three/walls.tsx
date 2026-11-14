"use client";
// Tường thành (BASE-15): mỗi đoạn 1×1 ô = 1 cột đá + thanh nối sang đoạn bên cạnh (tự liền mạch). Vẽ bằng instancing → 4 lần vẽ cho cả trăm đoạn.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { roofColor } from "./models";

export type WallPiece = { x: number; z: number; alive?: boolean };   // x,z = tâm (mét), ô 2 m

const POST = new THREE.BoxGeometry(1.15, 1.9, 1.15).translate(0, 0.95, 0);
const CAP = new THREE.BoxGeometry(1.35, 0.32, 1.35).translate(0, 2.02, 0);
const BAR_X = new THREE.BoxGeometry(2, 1.45, 0.82).translate(1, 0.72, 0);   // nối sang ô +x
const BAR_Z = new THREE.BoxGeometry(0.82, 1.45, 2).translate(0, 0.72, 1);   // nối sang ô +z

export function WallSet({ pieces, color = "#ec4899", ghost = false }: { pieces: WallPiece[]; color?: string; ghost?: boolean }) {
  const posts = useRef<THREE.InstancedMesh>(null), caps = useRef<THREE.InstancedMesh>(null), barsX = useRef<THREE.InstancedMesh>(null), barsZ = useRef<THREE.InstancedMesh>(null);
  const alive = useMemo(() => pieces.filter((p) => p.alive !== false), [pieces]);
  const n = Math.max(1, pieces.length);
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ color: "#efe6d4", roughness: 0.85, flatShading: true, transparent: ghost, opacity: ghost ? 0.5 : 1 }), [ghost]);
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color: roofColor(color), roughness: 0.7, flatShading: true }), [color]);
  useEffect(() => () => { stone.dispose(); capMat.dispose(); }, [stone, capMat]);
  useEffect(() => {
    const key = (x: number, z: number) => `${Math.round(x / 2)},${Math.round(z / 2)}`;
    const set = new Set(alive.map((p) => key(p.x, p.z)));
    const M = new THREE.Matrix4();
    let ix = 0, iz = 0;
    alive.forEach((p, i) => {
      M.makeTranslation(p.x, 0, p.z);
      posts.current?.setMatrixAt(i, M); caps.current?.setMatrixAt(i, M);
      if (set.has(key(p.x + 2, p.z))) barsX.current?.setMatrixAt(ix++, M);
      if (set.has(key(p.x, p.z + 2))) barsZ.current?.setMatrixAt(iz++, M);
    });
    const fin = (m: THREE.InstancedMesh | null, c: number) => { if (!m) return; m.count = c; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); };
    fin(posts.current, alive.length); fin(caps.current, alive.length); fin(barsX.current, ix); fin(barsZ.current, iz);
  }, [alive]);
  return (
    <group>
      <instancedMesh key={`p${n}`} ref={posts} args={[POST, stone, n]} castShadow receiveShadow />
      <instancedMesh key={`c${n}`} ref={caps} args={[CAP, capMat, n]} castShadow />
      <instancedMesh key={`x${n}`} ref={barsX} args={[BAR_X, stone, n]} castShadow receiveShadow />
      <instancedMesh key={`z${n}`} ref={barsZ} args={[BAR_Z, stone, n]} castShadow receiveShadow />
    </group>
  );
}
