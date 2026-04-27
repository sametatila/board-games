"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const FACE_COLOR = "#f3e7c6";
const PIP_COLOR = "#1a1a1a";

type Vec3 = [number, number, number];

// Pip layout per face. Face axes: px=+x, nx=-x, py=+y, ny=-y, pz=+z, nz=-z.
// Standard die: opposite faces sum to 7. We choose:
//   px=1, nx=6, py=2, ny=5, pz=3, nz=4
// (matches pre-existing convention so we don't have to redo art)
function pipsFor(
  value: number,
  axis: "px" | "nx" | "py" | "ny" | "pz" | "nz",
): Vec3[] {
  const s = 0.51;
  const offset = 0.18;
  const PIPS_2D: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [
      [-offset, -offset],
      [offset, offset],
    ],
    3: [
      [-offset, -offset],
      [0, 0],
      [offset, offset],
    ],
    4: [
      [-offset, -offset],
      [-offset, offset],
      [offset, -offset],
      [offset, offset],
    ],
    5: [
      [-offset, -offset],
      [-offset, offset],
      [offset, -offset],
      [offset, offset],
      [0, 0],
    ],
    6: [
      [-offset, -offset],
      [-offset, 0],
      [-offset, offset],
      [offset, -offset],
      [offset, 0],
      [offset, offset],
    ],
  };
  const pips2d = PIPS_2D[value] ?? [];
  return pips2d.map(([u, v]) => {
    switch (axis) {
      case "px":
        return [s, v, u];
      case "nx":
        return [-s, v, -u];
      case "py":
        return [u, s, v];
      case "ny":
        return [u, -s, -v];
      case "pz":
        return [-u, v, s];
      case "nz":
        return [u, v, -s];
    }
  });
}

// Final Euler rotation that puts the requested face value on top (+y).
// Layout: px=1, nx=6, py=2, ny=5, pz=3, nz=4
// In Three.js right-handed coords:
//   rotateZ(+90°): +x -> +y     (so face 1 lands on top)
//   rotateZ(-90°): -x -> +y     (face 6)
//   rotateX(-90°): +z -> +y     (face 3)
//   rotateX(+90°): -z -> +y     (face 4)
//   identity:                   (face 2 already +y)
//   rotateX(180°): -y -> +y     (face 5)
function targetRotationFor(value: number): Vec3 {
  switch (value) {
    case 1:
      return [0, 0, Math.PI / 2];
    case 6:
      return [0, 0, -Math.PI / 2];
    case 2:
      return [0, 0, 0];
    case 5:
      return [Math.PI, 0, 0];
    case 3:
      return [-Math.PI / 2, 0, 0];
    case 4:
      return [Math.PI / 2, 0, 0];
    default:
      return [0, 0, 0];
  }
}

// Smoothstep-like ease for the final lock: ease in/out with a slight overshoot.
function easeOutCubic(t: number) {
  const u = 1 - t;
  return 1 - u * u * u;
}

type DieProps = {
  finalValue: number;
  positionX: number;
  /** RNG seed (0..1) for the tumble axis so the two dice spin differently. */
  spinSeed: number;
  /** Total animation duration in seconds. */
  duration: number;
};

function AnimatedDie({ finalValue, positionX, spinSeed, duration }: DieProps) {
  const groupRef = useRef<THREE.Group>(null);
  const startTime = useRef<number>(performance.now() / 1000);

  // Pre-compute spin axis (random but deterministic per mount via the seed).
  const spinAxis = useMemo(() => {
    // Use the seed to derive 3 axis components.
    const a = (Math.sin(spinSeed * 12.9898) * 43758.5453) % 1;
    const b = (Math.sin(spinSeed * 78.233) * 43758.5453) % 1;
    const c = (Math.sin(spinSeed * 39.346) * 43758.5453) % 1;
    return new THREE.Vector3(a - 0.5, b - 0.5, c - 0.5).normalize();
  }, [spinSeed]);

  // Initial Euler (starting orientation) and final Euler (target).
  const startEuler = useMemo(
    () => new THREE.Euler(spinSeed * 6.28, spinSeed * 4.13, spinSeed * 2.71),
    [spinSeed],
  );
  const targetEuler = useMemo(() => {
    const t = targetRotationFor(finalValue);
    return new THREE.Euler(t[0], t[1], t[2]);
  }, [finalValue]);

  // Quaternions for slerp at the lock-in phase.
  const startQuat = useMemo(
    () => new THREE.Quaternion().setFromEuler(startEuler),
    [startEuler],
  );
  const targetQuat = useMemo(
    () => new THREE.Quaternion().setFromEuler(targetEuler),
    [targetEuler],
  );

  // Vertical bounce: up then down then small bounce on landing.
  function heightAt(t: number) {
    // t in [0,1]. Two bounces.
    const dropH = 2.5;
    if (t < 0.5) {
      // Falling phase
      const u = t / 0.5;
      return dropH * (1 - u * u);
    }
    if (t < 0.75) {
      // First bounce up
      const u = (t - 0.5) / 0.25;
      return 0.6 * Math.sin(u * Math.PI);
    }
    return 0;
  }

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = performance.now() / 1000 - startTime.current;
    const t = Math.min(1, elapsed / duration);

    // Position: drop with bounce.
    groupRef.current.position.set(positionX, heightAt(t), 0);

    // Rotation: spin freely until 80%, then ease to target.
    if (t < 0.8) {
      const spinSpeed = 18; // radians per second (full duration)
      const rot = spinSpeed * elapsed;
      const tumble = new THREE.Quaternion().setFromAxisAngle(spinAxis, rot);
      const composed = startQuat.clone().multiply(tumble);
      groupRef.current.quaternion.copy(composed);
    } else {
      // Lock-in: slerp from current spin pose to target.
      const lockT = (t - 0.8) / 0.2;
      const eased = easeOutCubic(Math.min(1, lockT));
      // Compute the spin pose at t=0.8 to start the slerp from a continuous orientation.
      const spinSpeed = 18;
      const lockInTime = 0.8 * duration;
      const rot = spinSpeed * lockInTime;
      const tumble = new THREE.Quaternion().setFromAxisAngle(spinAxis, rot);
      const fromQuat = startQuat.clone().multiply(tumble);
      groupRef.current.quaternion.slerpQuaternions(
        fromQuat,
        targetQuat,
        eased,
      );
    }
  });

  return (
    <group ref={groupRef} position={[positionX, 2.5, 0]}>
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={FACE_COLOR} roughness={0.4} />
      </mesh>
      {(["px", "nx", "py", "ny", "pz", "nz"] as const).flatMap((axis, idx) => {
        const value = [1, 6, 2, 5, 3, 4][idx];
        return pipsFor(value, axis).map((p, i) => (
          <mesh key={`${axis}${i}`} position={p}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={PIP_COLOR} />
          </mesh>
        ));
      })}
    </group>
  );
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[10, 10]} />
      <meshStandardMaterial color="#1a2c3f" roughness={0.9} />
    </mesh>
  );
}

const ANIM_DURATION = 1.6;

export function DiceModal({
  values,
  onDone,
}: {
  values: [number, number];
  onDone: () => void;
}) {
  const [showResult, setShowResult] = useState(false);

  // Reset showResult whenever values change (new roll).
  useEffect(() => {
    setShowResult(false);
    const showT = setTimeout(() => setShowResult(true), ANIM_DURATION * 1000);
    const closeT = setTimeout(
      () => onDone(),
      ANIM_DURATION * 1000 + 1100,
    );
    return () => {
      clearTimeout(showT);
      clearTimeout(closeT);
    };
  }, [values, onDone]);

  const total = values[0] + values[1];

  // Stable per-roll seeds so re-renders during the animation don't reshuffle the spin.
  const seeds = useMemo(
    () => [Math.random(), Math.random()] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values[0], values[1]],
  );

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="h-64 w-64 sm:h-80 sm:w-80">
        <Canvas
          camera={{ position: [0, 4.5, 4.5], fov: 45 }}
          style={{ width: "100%", height: "100%" }}
        >
          <color attach="background" args={["#0e1a2b"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 8, 4]} intensity={1.2} />
          <directionalLight position={[-3, 6, -2]} intensity={0.5} />
          <Floor />
          <AnimatedDie
            finalValue={values[0]}
            positionX={-0.9}
            spinSeed={seeds[0]}
            duration={ANIM_DURATION}
          />
          <AnimatedDie
            finalValue={values[1]}
            positionX={0.9}
            spinSeed={seeds[1]}
            duration={ANIM_DURATION}
          />
        </Canvas>
      </div>
      <div className="mt-4 text-center">
        <div className="text-xs uppercase tracking-wider text-white/50">
          Sonuç
        </div>
        <div
          className={`mt-1 text-5xl font-bold transition-opacity duration-300 ${
            showResult ? "text-amber-200 opacity-100" : "opacity-0"
          }`}
        >
          {values[0]} + {values[1]} = {total}
        </div>
        {showResult && total === 7 && (
          <div className="mt-2 text-sm text-rose-300">Hırsız geliyor!</div>
        )}
      </div>
    </div>
  );
}
