"use client";
import { Suspense, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { GameCanvas } from "@/components/three/quality";
import { UnitFigure, type Anim } from "@/components/three/units";

const UNITS = ["sword", "archer", "knight", "mage", "ninja", "yeti", "catapult"];
const ANIMS: Anim[] = ["idle", "run", "attack", "cheer", "dead"];

export default function UnitsLab() {
  const [anim, setAnim] = useState<Anim>("idle");
  return (
    <div className="fixed inset-0 bg-sky-200">
      <GameCanvas camera={{ position: [-2.5, 3, 7.5], fov: 40 }}>
        <color attach="background" args={["#bfe3ff"]} />
        <hemisphereLight args={["#ffffff", "#9be07a", 1.2]} />
        <directionalLight position={[4, 8, 6]} intensity={2.2} />
        <OrbitControls target={[-2.5, 1.2, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#86cc5a" /></mesh>
        {UNITS.map((u, i) => (
          <group key={u} position={[(i - (UNITS.length - 1) / 2) * 2.4, 0, 0]} rotation={[0, 0.5, 0]}>
            <Suspense fallback={null}><UnitFigure unit={u} anim={anim} height={2.1} tint="#ec4899" catapultScale={0.8} /></Suspense>
          </group>
        ))}
      </GameCanvas>
      <div className="absolute left-2 top-2 flex gap-1">{ANIMS.map((a) => <button key={a} data-anim={a} onClick={() => setAnim(a)} className={`rounded px-2 py-1 text-xs font-bold ${anim === a ? "bg-pink-500 text-white" : "bg-white"}`}>{a}</button>)}</div>
    </div>
  );
}
