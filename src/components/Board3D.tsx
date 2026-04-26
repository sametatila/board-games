"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Line,
  OrbitControls,
  Text,
} from "@react-three/drei";
import * as THREE from "three";
import {
  axialToPixel,
  edgeEndpointVertices,
  hexEdgeIds,
  hexVertexIds,
} from "@/game/hex";
import type {
  BuiltPiece,
  Hex,
  HexTerrain,
  Player,
  Port,
} from "@/game/types";

export type PlacementMode =
  | null
  | "settlement"
  | "road"
  | "city"
  | "robber"
  | "knight_robber"
  | "road_building"
  | "ship"
  | "pirate"
  /** Step 1 of move-ship: pick one of the player's existing ships. */
  | "move_ship_select"
  /** Step 2 of move-ship: pick the destination sea edge. */
  | "move_ship_target"
  /** Knight-on-ship → upgrade to warship; click an existing ship edge. */
  | "warship_upgrade";

export type Board3DProps = {
  hexes: Hex[];
  pieces: BuiltPiece[];
  ports: Port[];
  robberHexId: string | null;
  pirateHexId?: string | null;
  fortresses?: { hexId: string; ownerId: string | null; hpRemaining: number }[];
  players: Player[];
  placementMode: PlacementMode;
  /** If provided, only these vertex IDs are shown as clickable in vertex picker. */
  validVertexIds?: string[];
  /** If provided, only these edge IDs are shown as clickable in edge picker. */
  validEdgeIds?: string[];
  /** If provided, only these hex IDs are shown as clickable in hex picker. */
  validHexIds?: string[];
  onVertexClick?: (vertexId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  onHexClick?: (hexId: string) => void;
};

const HEX_SIZE = 1; // world units (radius of hexagon, point-to-center)
const HEX_HEIGHT_LAND = 0.25;
const HEX_HEIGHT_DESERT = 0.18;
const HEX_HEIGHT_SEA = 0.05;

const TERRAIN_COLORS: Record<HexTerrain, string> = {
  wood: "#2f6b2a",
  brick: "#b55a2a",
  wheat: "#e8c84a",
  sheep: "#9bd16a",
  ore: "#6e7d8c",
  desert: "#d9c79a",
  sea: "#1f5078",
  fog: "#6c6c80",
  gold: "#e6b94a",
};

const PLAYER_COLORS: Record<string, string> = {
  red: "#e23b3b",
  blue: "#2a76d6",
  orange: "#f08a2c",
  white: "#eeeeee",
  green: "#2da14a",
  brown: "#8b5a2b",
  purple: "#9d3fc4",
  cyan: "#33c4d8",
};

// Pointy-top hex world position (q,r) -> (x, z) in 3D plane.
function hexToWorld(coord: { q: number; r: number }): [number, number, number] {
  const px = axialToPixel(coord, HEX_SIZE);
  return [px.x, 0, px.y];
}

// Compute corner world positions of a hex's top face (pointy-top).
// Corner 0 = north (top of the screen, -z in world), then clockwise.
function hexCornersWorld(
  coord: { q: number; r: number },
  topY: number,
): THREE.Vector3[] {
  const [cx, , cz] = hexToWorld(coord);
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    corners.push(
      new THREE.Vector3(cx + HEX_SIZE * Math.cos(angle), topY, cz + HEX_SIZE * Math.sin(angle)),
    );
  }
  return corners;
}

// Hexes render as 6-sided Three.js cylinders. The cylinder's default vertex
// placement gives flat top/bottom corners pointing away from / toward the
// camera (pointy-top). No rotation needed.
function HexTile({
  hex,
  onClick,
  isHighlighted,
  hasRobber,
}: {
  hex: Hex;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  isHighlighted?: boolean;
  hasRobber?: boolean;
}) {
  const [pos] = useState(() => hexToWorld(hex.coord));
  const isLand = hex.terrain !== "sea" && hex.terrain !== "fog";
  const height = !isLand
    ? HEX_HEIGHT_SEA
    : hex.terrain === "desert"
    ? HEX_HEIGHT_DESERT
    : HEX_HEIGHT_LAND;
  const color = TERRAIN_COLORS[hex.terrain];
  // Gold hexes shimmer; fog hexes are matte/grey; sea is glossy water; the
  // rest get the default natural-terrain look.
  const roughness =
    hex.terrain === "gold"
      ? 0.32
      : hex.terrain === "sea"
      ? 0.42
      : hex.terrain === "fog"
      ? 0.95
      : 0.78;
  const metalness =
    hex.terrain === "gold"
      ? 0.65
      : hex.terrain === "sea"
      ? 0.18
      : 0.05;

  // Sea tiles don't render a body — the procedural ocean plane below shows
  // through. We still keep the group + position so vertex/edge picking
  // (ports, ships) maps to the right world coords.
  const renderBody = hex.terrain !== "sea";
  return (
    <group position={[pos[0], pos[1], pos[2]]}>
      {renderBody && (
        <mesh
          position={[0, height / 2, 0]}
          rotation={[0, 0, 0]}
          onPointerDown={onClick}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[HEX_SIZE, HEX_SIZE, height, 6]} />
          <meshStandardMaterial
            color={color}
            roughness={roughness}
            metalness={metalness}
            flatShading
          />
        </mesh>
      )}
      {/* Invisible click-catcher for sea tiles (pirate placement, ship moves). */}
      {!renderBody && (
        <mesh
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={onClick}
          visible={false}
        >
          <circleGeometry args={[HEX_SIZE, 6]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
      {/* Hex border: dark line tracing the top-face perimeter so adjacent
          same-color hexes still show a clear seam between them. */}
      {isLand && <HexBorder y={height + 0.001} />}
      {/* Decor renders for land hexes (trees/sheep/ore/etc.) and also for
          fog/gold hexes which use the same component to draw wisps/sparkles. */}
      {(isLand || hex.terrain === "fog") && (
        <TerrainDecor terrain={hex.terrain} y={height} hexId={hex.id} />
      )}
      {isLand && hex.numberToken !== null && (
        <NumberTokenMesh number={hex.numberToken} y={height + 0.02} />
      )}
      {/* Fog hex marker — a question mark on the surface so players know it's
          unexplored. */}
      {hex.terrain === "fog" && (
        <Text
          position={[0, height + 0.06, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.6}
          color="#1a1a1a"
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
        >
          ?
        </Text>
      )}
      {hasRobber && <RobberMesh y={height + 0.02} />}
      {isHighlighted && (
        <mesh
          position={[0, height + 0.02, 0]}
          rotation={[0, 0, 0]}
        >
          <cylinderGeometry args={[HEX_SIZE * 0.95, HEX_SIZE * 0.95, 0.01, 6]} />
          <meshBasicMaterial color="#ffe066" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// Hex border: a thin closed line tracing the perimeter of the top face.
// Used to give adjacent same-terrain hexes a visible seam between them.
function HexBorder({ y }: { y: number }) {
  const points = useMemo(() => {
    const out: [number, number, number][] = [];
    // CylinderGeometry default first vertex sits at angle 0 in (sin, cos),
    // i.e. local (0, +radius) on the XZ plane. We follow that convention so
    // the line lines up with the cylinder's actual edges.
    for (let i = 0; i <= 6; i++) {
      const a = (i * Math.PI) / 3;
      out.push([Math.sin(a) * HEX_SIZE, 0, Math.cos(a) * HEX_SIZE]);
    }
    return out;
  }, []);
  return (
    <Line
      points={points}
      position={[0, y, 0]}
      color="#0e1a2b"
      lineWidth={1.5}
      transparent
      opacity={0.6}
    />
  );
}

// Deterministic pseudo-random in [0,1) from a string seed.
function seedRand(seed: string, salt: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= salt;
  h = Math.imul(h, 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

// Procedural decorations on top of a land hex. Object positions are seeded by
// hex id so they are stable across renders / clients (the same hex always looks
// the same). Decor placed in an annular ring outside the number token disc
// (radius 0.42..0.85 from hex center) to avoid overlapping the token.
function TerrainDecor({
  terrain,
  y,
  hexId,
}: {
  terrain: HexTerrain;
  y: number;
  hexId: string;
}) {
  // Place objects in an annular ring around the hex center, evenly spread
  // around the perimeter so they never overlap the number-token disc and
  // never spill past the hex edge.
  //   inner radius 0.50  → safely outside the token (radius 0.32 + buffer)
  //   outer radius 0.78  → keeps decor inside the hex (hex outer radius = 1)
  function placements(count: number, salt: number) {
    const out: { x: number; z: number; r: number; angle: number }[] = [];
    const baseAngle = seedRand(hexId, salt) * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      // Spread uniformly around the ring, with a small random jitter per slot
      // so things don't look like they're on a perfect circle.
      const jitter = (seedRand(hexId, salt + i * 7 + 1) - 0.5) * 0.4;
      const angle = baseAngle + (i / count) * Math.PI * 2 + jitter;
      const rFrac = seedRand(hexId, salt + i * 7 + 2);
      const radius = 0.5 + rFrac * 0.28;
      out.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        r: rFrac,
        angle,
      });
    }
    return out;
  }

  if (terrain === "wood") {
    const trees = placements(6, 1);
    return (
      <>
        {trees.map((p, i) => {
          const scale = 0.6 + p.r * 0.3;
          return (
            <group key={i} position={[p.x, y, p.z]}>
              {/* Trunk */}
              <mesh position={[0, 0.06 * scale, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.025, 0.035, 0.12 * scale, 12]} />
                <meshStandardMaterial color="#5a3a1f" roughness={0.85} />
              </mesh>
              {/* Foliage cluster — 3 stacked cones for fuller silhouette */}
              <mesh position={[0, 0.18 * scale, 0]} castShadow receiveShadow>
                <coneGeometry args={[0.14 * scale, 0.18 * scale, 16]} />
                <meshStandardMaterial color="#2a5d24" roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.26 * scale, 0]} castShadow receiveShadow>
                <coneGeometry args={[0.115 * scale, 0.16 * scale, 16]} />
                <meshStandardMaterial color="#1f4d1c" roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.34 * scale, 0]} castShadow receiveShadow>
                <coneGeometry args={[0.085 * scale, 0.13 * scale, 16]} />
                <meshStandardMaterial color="#173d15" roughness={0.7} />
              </mesh>
            </group>
          );
        })}
      </>
    );
  }

  if (terrain === "wheat") {
    const tufts = placements(10, 2);
    return (
      <>
        {tufts.map((p, i) => {
          const scale = 0.7 + p.r * 0.5;
          return (
            <group key={i} position={[p.x, y, p.z]} rotation={[0, p.angle, 0]}>
              {/* Sheaf body */}
              <mesh position={[0, 0.05 * scale, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.02, 0.04, 0.1 * scale, 8]} />
                <meshStandardMaterial color="#d8a93a" roughness={0.8} />
              </mesh>
              {/* Wheat head */}
              <mesh position={[0, 0.13 * scale, 0]} castShadow receiveShadow>
                <coneGeometry args={[0.035, 0.07 * scale, 8]} />
                <meshStandardMaterial color="#f0c14f" roughness={0.7} />
              </mesh>
            </group>
          );
        })}
      </>
    );
  }

  if (terrain === "sheep") {
    const sheep = placements(5, 3);
    return (
      <>
        {sheep.map((p, i) => {
          const scale = 0.9 + p.r * 0.3;
          return (
            <group key={i} position={[p.x, y, p.z]} rotation={[0, p.angle, 0]}>
              {/* Body — fuller, smoother sphere */}
              <mesh position={[0, 0.07 * scale, 0]} castShadow receiveShadow>
                <sphereGeometry args={[0.085 * scale, 24, 20]} />
                <meshStandardMaterial
                  color="#f5f3eb"
                  roughness={0.95}
                  metalness={0}
                />
              </mesh>
              {/* Head */}
              <mesh
                position={[0.085 * scale, 0.085 * scale, 0]}
                castShadow
                receiveShadow
              >
                <sphereGeometry args={[0.045 * scale, 16, 14]} />
                <meshStandardMaterial color="#3a2a20" roughness={0.85} />
              </mesh>
              {/* Ears */}
              <mesh
                position={[0.105 * scale, 0.115 * scale, 0.025 * scale]}
                rotation={[0, 0, 0.4]}
                castShadow
              >
                <sphereGeometry args={[0.012 * scale, 8, 6]} />
                <meshStandardMaterial color="#3a2a20" />
              </mesh>
            </group>
          );
        })}
      </>
    );
  }

  if (terrain === "brick") {
    const stacks = placements(4, 4);
    return (
      <>
        {stacks.map((p, i) => (
          <group key={i} position={[p.x, y, p.z]} rotation={[0, p.angle, 0]}>
            <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.14, 0.04, 0.07]} />
              <meshStandardMaterial color="#8a3a1c" roughness={0.85} />
            </mesh>
            <mesh position={[0.015, 0.06, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.14, 0.04, 0.07]} />
              <meshStandardMaterial color="#9c4222" roughness={0.85} />
            </mesh>
            <mesh position={[-0.01, 0.1, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.14, 0.04, 0.07]} />
              <meshStandardMaterial color="#7e3216" roughness={0.85} />
            </mesh>
          </group>
        ))}
      </>
    );
  }

  if (terrain === "ore") {
    const rocks = placements(5, 5);
    return (
      <>
        {rocks.map((p, i) => {
          const scale = 0.7 + p.r * 0.5;
          return (
            <mesh
              key={i}
              position={[p.x, y + 0.06 * scale, p.z]}
              rotation={[p.r * 0.4, p.angle, p.r * 0.3]}
              castShadow
              receiveShadow
            >
              <icosahedronGeometry args={[0.1 * scale, 1]} />
              <meshStandardMaterial
                color="#525a6b"
                roughness={0.7}
                metalness={0.15}
                flatShading
              />
            </mesh>
          );
        })}
      </>
    );
  }

  if (terrain === "desert") {
    const cacti = placements(3, 6);
    const rocks = placements(3, 7);
    return (
      <>
        {cacti.map((p, i) => (
          <group key={`c${i}`} position={[p.x, y, p.z]}>
            <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.04, 0.05, 0.2, 12]} />
              <meshStandardMaterial color="#3d6a2c" roughness={0.85} />
            </mesh>
            <mesh position={[0.06, 0.13, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.025, 0.025, 0.08, 12]} />
              <meshStandardMaterial color="#3d6a2c" roughness={0.85} />
            </mesh>
            {/* Rounded cap on top */}
            <mesh position={[0, 0.2, 0]} castShadow>
              <sphereGeometry args={[0.04, 12, 10]} />
              <meshStandardMaterial color="#3d6a2c" roughness={0.85} />
            </mesh>
          </group>
        ))}
        {rocks.map((p, i) => (
          <mesh
            key={`r${i}`}
            position={[p.x, y + 0.03, p.z]}
            rotation={[p.r * 0.3, p.angle, 0]}
            castShadow
            receiveShadow
          >
            <icosahedronGeometry args={[0.05, 1]} />
            <meshStandardMaterial
              color="#a18860"
              roughness={0.85}
              flatShading
            />
          </mesh>
        ))}
      </>
    );
  }

  if (terrain === "gold") {
    // Sparkly gold nuggets — small icosahedrons with high metalness, plus a
    // few tiny "shine" spheres for visible glints.
    const nuggets = placements(5, 8);
    const sparkles = placements(7, 9);
    return (
      <>
        {nuggets.map((p, i) => {
          const scale = 0.7 + p.r * 0.5;
          return (
            <mesh
              key={`g${i}`}
              position={[p.x, y + 0.05 * scale, p.z]}
              rotation={[p.r * 0.4, p.angle, p.r * 0.3]}
              castShadow
              receiveShadow
            >
              <icosahedronGeometry args={[0.07 * scale, 0]} />
              <meshStandardMaterial
                color="#fcd34d"
                roughness={0.25}
                metalness={0.9}
                flatShading
              />
            </mesh>
          );
        })}
        {sparkles.map((p, i) => (
          <mesh key={`gs${i}`} position={[p.x, y + 0.04, p.z]}>
            <sphereGeometry args={[0.012, 6, 6]} />
            <meshBasicMaterial color="#fff8c4" />
          </mesh>
        ))}
      </>
    );
  }

  if (terrain === "fog") {
    // Wispy gray puffs that hint at hidden terrain. We don't try real volumetric
    // fog — just a few overlapping translucent spheres for the misty look.
    const puffs = placements(6, 10);
    return (
      <>
        {puffs.map((p, i) => {
          const scale = 0.7 + p.r * 0.6;
          return (
            <mesh
              key={`f${i}`}
              position={[p.x, y + 0.12 + p.r * 0.05, p.z]}
            >
              <sphereGeometry args={[0.13 * scale, 12, 10]} />
              <meshStandardMaterial
                color="#cfd0d8"
                transparent
                opacity={0.55}
                roughness={1}
              />
            </mesh>
          );
        })}
      </>
    );
  }

  return null;
}

// Layered Y-heights on top of a hex tile. Bigger Y = closer to camera (above).
// Hex top sits at `y` (passed in by the caller). All overlays are stacked above:
//   y + 0.00..0.06  : token disc (cylinder of height 0.06, centered at y+0.03)
//   y + 0.061       : pip dots (just above disc face)
//   y + 0.062       : number text (just above disc face, slightly higher than dots
//                     so glyph never z-fights with dots)
const TOKEN_DISC_HEIGHT = 0.06;
const TOKEN_TOP_Y = TOKEN_DISC_HEIGHT; // local y at the top face of the disc
const TEXT_Y = TOKEN_TOP_Y + 0.002;
const PIP_Y = TOKEN_TOP_Y + 0.001;
// On a flat-top hex viewed from camera at (0, 11, 9), looking in -z:
//   -z = "north" (further from camera, top of the screen)
//   +z = "south" (closer to camera, bottom of the screen)
// Number reads upright, glyph top points north (-z), so we offset the number
// slightly NORTH to leave room for pips to its SOUTH below it.
const NUMBER_Z_OFFSET = -0.04;
const PIPS_Z_OFFSET = 0.13;

function NumberTokenMesh({ number, y }: { number: number; y: number }) {
  const isHot = number === 6 || number === 8;
  const pipColor = isHot ? "#b20a1c" : "#111111";
  return (
    <group position={[0, y, 0]}>
      {/* Token disc: cylinder default axis = +y, so caps already face up/down. */}
      <mesh castShadow receiveShadow position={[0, TOKEN_DISC_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.32, 0.32, TOKEN_DISC_HEIGHT, 48]} />
        <meshStandardMaterial color="#f3e7c6" roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Number sits in the upper half of the disc, glyph readable from camera. */}
      <Text
        position={[0, TEXT_Y, NUMBER_Z_OFFSET]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color={isHot ? "#b20a1c" : "#111111"}
        anchorX="center"
        anchorY="middle"
        fontWeight={700}
      >
        {String(number)}
      </Text>
      <PipDots count={pipFor(number)} color={pipColor} />
    </group>
  );
}

function PipDots({ count, color }: { count: number; color: string }) {
  const dots = [];
  const spacing = 0.05;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    dots.push(
      <mesh
        key={i}
        position={[x, PIP_Y, PIPS_Z_OFFSET]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.018, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>,
    );
  }
  return <>{dots}</>;
}

function pipFor(n: number): number {
  const m: Record<number, number> = {
    2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
    8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
  };
  return m[n] ?? 0;
}

function RobberMesh({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <coneGeometry args={[0.18, 0.45, 32]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.13, 32, 24]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.55} metalness={0.1} />
      </mesh>
    </group>
  );
}

function PopInGroup({
  children,
  position,
}: {
  children: React.ReactNode;
  position: [number, number, number];
}) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef<number>(performance.now());
  useFrame(() => {
    if (!ref.current) return;
    const elapsed = (performance.now() - start.current) / 350;
    if (elapsed >= 1) {
      ref.current.scale.set(1, 1, 1);
      return;
    }
    // Ease-out-back spring
    const t = elapsed;
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const eased = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    ref.current.scale.set(eased, eased, eased);
  });
  return (
    <group ref={ref} position={position} scale={[0.001, 0.001, 0.001]}>
      {children}
    </group>
  );
}

function SettlementMesh({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <PopInGroup position={position}>
      <mesh castShadow receiveShadow position={[0, 0.07, 0]}>
        <boxGeometry args={[0.22, 0.14, 0.22]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
        <coneGeometry args={[0.18, 0.14, 4]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
      </mesh>
    </PopInGroup>
  );
}

function CityMesh({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <PopInGroup position={position}>
      <mesh castShadow receiveShadow position={[0, 0.1, 0]}>
        <boxGeometry args={[0.34, 0.2, 0.34]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.3, 0.07]}>
        <boxGeometry args={[0.18, 0.2, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.43, 0.07]}>
        <coneGeometry args={[0.13, 0.12, 4]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
      </mesh>
    </PopInGroup>
  );
}

function RoadMesh({
  v1,
  v2,
  color,
}: {
  v1: THREE.Vector3;
  v2: THREE.Vector3;
  color: string;
}) {
  const mid = v1.clone().add(v2).multiplyScalar(0.5);
  const dir = v2.clone().sub(v1);
  const length = dir.length();
  const angle = Math.atan2(dir.x, dir.z);
  return (
    <PopInGroup position={[mid.x, mid.y + 0.06, mid.z]}>
      <mesh rotation={[0, angle, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.08, length * 0.85]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
      </mesh>
    </PopInGroup>
  );
}

// Tiny sailboat: pointed brown hull + white triangular sail. The piece sits
// flat on the water (y close to sea height) so it doesn't float in the sky.
function ShipMesh({
  v1,
  v2,
  color,
  isWarship,
}: {
  v1: THREE.Vector3;
  v2: THREE.Vector3;
  color: string;
  isWarship?: boolean;
}) {
  const mid = v1.clone().add(v2).multiplyScalar(0.5);
  const dir = v2.clone().sub(v1);
  const length = dir.length();
  const angle = Math.atan2(dir.x, dir.z);
  const baseY = HEX_HEIGHT_SEA + 0.04;
  const hullLen = length * 0.62;
  // Triangular sail geometry — a real triangle so the silhouette reads
  // as a sailboat from any angle, not a tiny brick on a stick.
  const sailShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0, 0.22);
    s.lineTo(hullLen * 0.42, 0);
    s.lineTo(0, 0);
    return s;
  }, [hullLen]);
  return (
    <PopInGroup position={[mid.x, baseY, mid.z]}>
      <group rotation={[0, angle, 0]}>
        {/* Hull — tapered prow using a stretched cylinder rotated on its side */}
        <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.045, hullLen, 12]} />
          <meshStandardMaterial color="#5a3a1f" roughness={0.85} />
        </mesh>
        {/* Deck plank — slightly lighter wood */}
        <mesh position={[0, 0.025, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.085, 0.005, hullLen * 0.95]} />
          <meshStandardMaterial color="#7d5832" roughness={0.9} />
        </mesh>
        {/* Player-color stripe band around the hull */}
        <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.13, 0.014, hullLen * 0.95]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
        </mesh>
        {/* Bow tip — small wedge in front */}
        <mesh
          position={[0, 0.01, hullLen * 0.5 + 0.02]}
          rotation={[0, Math.PI / 4, 0]}
          castShadow
        >
          <boxGeometry args={[0.045, 0.05, 0.045]} />
          <meshStandardMaterial color="#5a3a1f" roughness={0.85} />
        </mesh>
        {/* Mast */}
        <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.013, 0.013, 0.26, 10]} />
          <meshStandardMaterial color="#2a1a08" roughness={0.85} />
        </mesh>
        {/* Boom */}
        <mesh position={[0, 0.05, hullLen * 0.05]} castShadow>
          <boxGeometry args={[0.012, 0.012, hullLen * 0.4]} />
          <meshStandardMaterial color="#2a1a08" roughness={0.85} />
        </mesh>
        {/* Sail — actual triangle facing crosswise */}
        <mesh position={[0, 0.05, 0]} castShadow>
          <shapeGeometry args={[sailShape]} />
          <meshStandardMaterial
            color={isWarship ? "#a02a2a" : "#f5f3eb"}
            roughness={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Warship: red flag + cannon notches */}
        {isWarship && (
          <>
            <mesh position={[0.04, 0.28, 0]} castShadow>
              <boxGeometry args={[0.07, 0.045, 0.006]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh
              position={[0.07, 0.012, hullLen * 0.15]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.012, 0.012, 0.06, 8]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.6} />
            </mesh>
            <mesh
              position={[-0.07, 0.012, hullLen * 0.15]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.012, 0.012, 0.06, 8]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.6} />
            </mesh>
          </>
        )}
      </group>
    </PopInGroup>
  );
}

// Tall black sail used for the pirate. Stands up over a sea hex.
function PirateMesh({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <coneGeometry args={[0.16, 0.42, 16]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.6} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.42, 0]}>
        <sphereGeometry args={[0.07, 16, 12]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.6} />
      </mesh>
      {/* Crossbones plate (just a square) */}
      <mesh position={[0, 0.34, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.1, 0.1]} />
        <meshStandardMaterial color="#f0eee5" />
      </mesh>
    </group>
  );
}

// Procedural ocean: stacked Gerstner-style wave trains for displacement,
// analytical normals for specular sun glints, dual-layer foam, fresnel
// reflection. The plane sits flat in world space (rotated -90°) but the
// shader works on a local x/y where x = world-x, y = world-z.
function OceanPlane() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color("#3a82b8") },
      uDeep: { value: new THREE.Color("#031a2e") },
      uSky: { value: new THREE.Color("#aac6dc") },
      uFoam: { value: new THREE.Color("#e8f4ff") },
      uSunDir: { value: new THREE.Vector3(0.6, 0.7, 0.4).normalize() },
    }),
    [],
  );
  useFrame((_, delta) => {
    if (matRef.current) {
      uniforms.uTime.value += delta;
    }
  });
  const vertexShader = /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vCrest;
    varying vec2 vUv;
    uniform float uTime;

    // Gerstner-ish: each wave displaces along its direction (steepness)
    // and vertically (height). We accumulate displacement and analytic
    // tangent/bitangent so the fragment shader can reconstruct a normal.
    void gerstner(
      inout vec3 p,
      inout vec3 tx,
      inout vec3 tz,
      vec2 dir, float wavelength, float steepness, float speed
    ) {
      float k = 6.2831853 / wavelength;          // wave number
      float c = sqrt(9.81 / k);                  // phase speed (deep water)
      vec2 d = normalize(dir);
      float f = k * (dot(d, p.xy) - c * uTime * speed);
      float a = steepness / k;
      p.x += d.x * a * cos(f);
      p.y += d.y * a * cos(f);
      p.z += a * sin(f);
      // Partial derivatives for normal recovery.
      tx.x += -d.x * d.x * steepness * sin(f);
      tx.y += -d.x * d.y * steepness * sin(f);
      tx.z +=  d.x * steepness * cos(f);
      tz.x += -d.y * d.x * steepness * sin(f);
      tz.y += -d.y * d.y * steepness * sin(f);
      tz.z +=  d.y * steepness * cos(f);
    }

    void main() {
      vUv = uv;
      vec3 p = position;
      vec3 tx = vec3(1.0, 0.0, 0.0);
      vec3 tz = vec3(0.0, 1.0, 0.0);

      // Steepness kept low (max 0.05) so the wave crests never punch up
      // through the hex tiles. The mesh sits well below world y=0; the
      // displacement adds at most ~0.1 world units on top of that.
      gerstner(p, tx, tz, vec2( 1.0,  0.35), 6.0,  0.050, 0.85);
      gerstner(p, tx, tz, vec2(-0.30, 1.0 ), 4.2,  0.040, 1.05);
      gerstner(p, tx, tz, vec2( 0.62, 0.78), 2.6,  0.030, 1.35);
      gerstner(p, tx, tz, vec2(-0.85, 0.52), 1.6,  0.022, 1.65);
      gerstner(p, tx, tz, vec2( 0.10, 0.99), 0.9,  0.014, 2.10);

      vec3 n = normalize(cross(tz, tx));
      vNormal = n;
      // Wave crest (height above mean) drives foam at the top of waves.
      vCrest = p.z;
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;
  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vCrest;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec3 uShallow;
    uniform vec3 uDeep;
    uniform vec3 uSky;
    uniform vec3 uFoam;
    uniform vec3 uSunDir;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p = rot * p * 2.05;
        a *= 0.5;
      }
      return v;
    }

    // Domain-warped fbm — gives the surface texture a more organic,
    // less repeating look than plain fbm.
    float wfbm(vec2 p) {
      vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
      return fbm(p + 1.5 * q);
    }

    void main() {
      // World-space normal (rotated to face up via the mesh transform).
      vec3 baseN = normalize(vNormal);
      // High-frequency normal perturbation — two scrolling layers of
      // ripple texture that we encode as small slope vectors and add to
      // the base Gerstner normal. This is what makes the surface read as
      // "real" water instead of slow plastic waves.
      vec2 rp1 = vWorldPos.xz * 4.0 + vec2(uTime * 0.18, uTime * 0.12);
      vec2 rp2 = vWorldPos.xz * 9.0 - vec2(uTime * 0.10, uTime * 0.08);
      float h1x = fbm(rp1 + vec2(0.05, 0.0)) - fbm(rp1 - vec2(0.05, 0.0));
      float h1y = fbm(rp1 + vec2(0.0, 0.05)) - fbm(rp1 - vec2(0.0, 0.05));
      float h2x = fbm(rp2 + vec2(0.03, 0.0)) - fbm(rp2 - vec2(0.03, 0.0));
      float h2y = fbm(rp2 + vec2(0.0, 0.03)) - fbm(rp2 - vec2(0.0, 0.03));
      vec3 ripple = vec3(h1x * 1.6 + h2x * 0.9, 0.0, h1y * 1.6 + h2y * 0.9);
      vec3 N = normalize(baseN + ripple);

      // Camera direction.
      vec3 V = normalize(cameraPosition - vWorldPos);
      vec3 L = normalize(uSunDir);
      vec3 H = normalize(L + V);

      // Fresnel (Schlick) — water reflects much more at glancing angles.
      float f0 = 0.02;
      float fres = f0 + (1.0 - f0) * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);

      // Depth gradient. Distance from board centre fakes shallow→deep falloff.
      float dist = length(vWorldPos.xz) / 18.0;
      vec3 deepWater = mix(uShallow, uDeep, smoothstep(0.0, 1.0, dist));

      // Cyan tint at wave peaks (subsurface scatter through the crest).
      float sss = clamp(vCrest * 8.0 + 0.2, 0.0, 1.0);
      vec3 water = mix(deepWater, uShallow * vec3(1.05, 1.15, 1.20), sss * 0.45);

      // Domain-warped colour variation so big "tide pools" show up — keeps
      // the surface from looking uniform under a wide camera.
      float warp = wfbm(vWorldPos.xz * 0.18 + uTime * 0.015);
      water *= mix(0.92, 1.10, warp);

      // Hemispheric ambient: sky tint from above, water tint from below.
      float upDot = clamp(N.y, 0.0, 1.0);
      vec3 ambient = mix(uDeep * 0.6, uSky * 0.55, upDot);
      water = mix(ambient, water, 0.78);

      // Sun specular — Blinn-Phong with two lobes (one tight, one wide).
      float specTight = pow(clamp(dot(N, H), 0.0, 1.0), 180.0);
      float specWide  = pow(clamp(dot(N, H), 0.0, 1.0), 28.0);
      float sparkle = pow(
        smoothstep(0.55, 1.0, wfbm(vWorldPos.xz * 1.8 + uTime * 0.5)),
        2.0
      );
      vec3 specular = vec3(1.0, 0.97, 0.85)
        * (specTight * 1.6 + specWide * 0.35 + sparkle * 0.75);

      // Reflected sky colour — fresnel-blended on top of the water.
      vec3 reflCol = mix(uSky * 0.55, uSky * 1.05, clamp(L.y, 0.0, 1.0));
      vec3 col = mix(water, reflCol, fres * 0.82);
      col += specular;

      // Foam: low-freq drifting fbm + high-freq lacy detail + crest foam.
      float drift1 = wfbm(vWorldPos.xz * 0.55 + vec2(uTime * 0.04, uTime * 0.02));
      float drift2 = fbm(vWorldPos.xz * 3.0 - vec2(uTime * 0.05, uTime * 0.03));
      float foam = smoothstep(0.64, 0.86, drift1) * 0.45
                 + smoothstep(0.72, 0.94, drift2) * 0.20;
      float crest = smoothstep(0.022, 0.06, vCrest) * 0.65;
      foam = clamp(foam + crest, 0.0, 1.0);
      // Foam is brightest where its own little FBM peaks — gives it a
      // lacy texture instead of milky blobs.
      float foamLace = smoothstep(0.5, 0.8, fbm(vWorldPos.xz * 12.0 + uTime * 0.4));
      col = mix(col, uFoam, foam * mix(0.45, 0.85, foamLace));

      // Slight horizon haze — very far rings get blue-grey ambient.
      float horizon = smoothstep(0.85, 1.05, dist);
      col = mix(col, uDeep * 0.85, horizon * 0.7);

      gl_FragColor = vec4(col, 1.0);
    }
  `;
  return (
    <mesh
      receiveShadow
      // Sit well below the sea-hex floor (HEX_HEIGHT_SEA = 0.05) so the
      // wave tops never punch up through the actual hex tiles. Combined
      // with the small-amplitude Gerstner stack, the highest crest peaks
      // around y ≈ -0.16 — comfortably under the sea hex top.
      position={[0, -0.35, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      {/* Big plane with lots of vertices so Gerstner waves stay sharp.
          The board's max camera distance is 42, so the plane needs to
          extend beyond that or you can see the edge when zoomed out. */}
      <planeGeometry args={[120, 120, 256, 256]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}

// Map vertexId -> world position by scanning all hexes and picking the corner index.
function buildVertexPosMap(hexes: Hex[]): Map<string, THREE.Vector3> {
  const map = new Map<string, THREE.Vector3>();
  for (const h of hexes) {
    const ids = hexVertexIds(h.coord);
    const isLand = h.terrain !== "sea" && h.terrain !== "fog";
    const top =
      !isLand
        ? HEX_HEIGHT_SEA
        : h.terrain === "desert"
        ? HEX_HEIGHT_DESERT
        : HEX_HEIGHT_LAND;
    const corners = hexCornersWorld(h.coord, top);
    for (let i = 0; i < 6; i++) {
      if (!map.has(ids[i])) {
        map.set(ids[i], corners[i].clone());
      }
    }
  }
  return map;
}

function buildEdgePosMap(
  hexes: Hex[],
): Map<string, { v1: THREE.Vector3; v2: THREE.Vector3 }> {
  const map = new Map<string, { v1: THREE.Vector3; v2: THREE.Vector3 }>();
  const vertices = buildVertexPosMap(hexes);
  for (const h of hexes) {
    const ids = hexEdgeIds(h.coord);
    for (let s = 0; s < 6; s++) {
      const eId = ids[s];
      if (map.has(eId)) continue;
      const verts = edgeEndpointVertices(h.coord, s);
      const v1 = vertices.get(verts[0]);
      const v2 = vertices.get(verts[1]);
      if (v1 && v2) map.set(eId, { v1, v2 });
    }
  }
  return map;
}

function VertexPicker({
  hexes,
  pieces,
  validIds,
  onClick,
}: {
  hexes: Hex[];
  pieces: BuiltPiece[];
  validIds?: string[];
  onClick: (id: string) => void;
}) {
  const vertexPos = useMemo(() => buildVertexPosMap(hexes), [hexes]);
  const allowed = validIds ? new Set(validIds) : null;
  const occupied = new Set(
    pieces
      .filter(
        (p): p is Extract<BuiltPiece, { kind: "settlement" | "city" }> =>
          p.kind === "settlement" || p.kind === "city",
      )
      .map((p) => p.vertexId),
  );
  const items = [];
  for (const [id, pos] of vertexPos) {
    if (occupied.has(id)) continue;
    if (allowed && !allowed.has(id)) continue;
    items.push(
      <mesh
        key={id}
        position={[pos.x, pos.y + 0.12, pos.z]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick(id);
        }}
      >
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial
          color="#ffe066"
          emissive="#ffaa00"
          emissiveIntensity={0.4}
          transparent
          opacity={0.85}
        />
      </mesh>,
    );
  }
  return <>{items}</>;
}

function EdgePicker({
  hexes,
  pieces,
  validIds,
  allowOccupied = false,
  onClick,
}: {
  hexes: Hex[];
  pieces: BuiltPiece[];
  validIds?: string[];
  /** When true, an edge that's occupied by a piece is still clickable —
   *  used by move-ship/warship-upgrade pickers that need to target an
   *  existing piece. */
  allowOccupied?: boolean;
  onClick: (id: string) => void;
}) {
  const edgePos = useMemo(() => buildEdgePosMap(hexes), [hexes]);
  const allowed = validIds ? new Set(validIds) : null;
  const occupied = new Set(
    pieces
      .filter(
        (p): p is Extract<BuiltPiece, { kind: "road" | "ship" | "warship" }> =>
          p.kind === "road" || p.kind === "ship" || p.kind === "warship",
      )
      .map((p) => p.edgeId),
  );
  const items = [];
  for (const [id, { v1, v2 }] of edgePos) {
    if (!allowOccupied && occupied.has(id)) continue;
    if (allowed && !allowed.has(id)) continue;
    const mid = v1.clone().add(v2).multiplyScalar(0.5);
    const dir = v2.clone().sub(v1);
    const len = dir.length();
    const angle = Math.atan2(dir.x, dir.z);
    items.push(
      <mesh
        key={id}
        position={[mid.x, mid.y + 0.1, mid.z]}
        rotation={[0, angle, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick(id);
        }}
      >
        <boxGeometry args={[0.12, 0.08, len * 0.7]} />
        <meshStandardMaterial
          color="#ffe066"
          emissive="#ffaa00"
          emissiveIntensity={0.35}
          transparent
          opacity={0.75}
        />
      </mesh>,
    );
  }
  return <>{items}</>;
}

function PortMarkers({ hexes, ports }: { hexes: Hex[]; ports: Port[] }) {
  const edgePos = useMemo(() => buildEdgePosMap(hexes), [hexes]);
  // For each edge id, remember the land hex that owns it (for outward normal).
  const edgeToLandHex = useMemo(() => {
    const map = new Map<string, Hex>();
    for (const h of hexes) {
      if (h.terrain === "sea" || h.terrain === "fog") continue;
      for (const eId of hexEdgeIds(h.coord)) {
        if (!map.has(eId)) map.set(eId, h);
      }
    }
    return map;
  }, [hexes]);

  // Port sits floating ABOVE the land tile's top so it stays visible from
  // the standard top-down camera angle and never gets occluded by hex bodies.
  const PORT_DISC_HEIGHT = 0.04;
  const PORT_BASE_Y = HEX_HEIGHT_LAND - 0.02;
  const PLANK_Y = PORT_BASE_Y + 0.005;

  return (
    <>
      {ports.map((port) => {
        const e = edgePos.get(port.edgeId);
        if (!e) return null;
        const land = edgeToLandHex.get(port.edgeId);
        if (!land) return null;

        const mid = e.v1.clone().add(e.v2).multiplyScalar(0.5);
        // Outward = direction from the land hex CENTER toward this edge mid,
        // projected on the XZ plane. This is the true "out to sea" direction.
        const [hx, , hz] = hexToWorld(land.coord);
        const outward = new THREE.Vector3(mid.x - hx, 0, mid.z - hz);
        if (outward.lengthSq() > 0) outward.normalize();

        // Push the dock head outward enough that the disc sits clearly off the
        // land hex's footprint (hex pointy-corner reach is 1.0 in world units).
        const dockOffset = 0.7;
        const dockMid = new THREE.Vector3(
          mid.x + outward.x * dockOffset,
          PORT_BASE_Y,
          mid.z + outward.z * dockOffset,
        );

        const color =
          port.kind === "any" ? "#d4d4d4" : TERRAIN_COLORS[port.kind];
        const label = port.kind === "any" ? "3:1" : "2:1";

        // Plank endpoints: at the two shore corners of this edge, lifted up
        // to the same Y as the dock head so the planks lie flat on top of
        // the hex/sea instead of diving down into it.
        const v1 = new THREE.Vector3(e.v1.x, PLANK_Y, e.v1.z);
        const v2 = new THREE.Vector3(e.v2.x, PLANK_Y, e.v2.z);
        const dockMidPlank = new THREE.Vector3(
          dockMid.x,
          PLANK_Y,
          dockMid.z,
        );

        function plank(a: THREE.Vector3, b: THREE.Vector3, key: string) {
          const center = a.clone().add(b).multiplyScalar(0.5);
          const dir = b.clone().sub(a);
          const len = dir.length();
          // Angle of the plank in the XZ plane (ignore Y for orientation).
          const angle = Math.atan2(dir.x, dir.z);
          // Tilt: how much the plank slopes along its length (from shore down to sea).
          const horizLen = Math.hypot(dir.x, dir.z);
          const tilt = -Math.atan2(dir.y, horizLen);
          return (
            <mesh
              key={key}
              position={[center.x, center.y, center.z]}
              rotation={[tilt, angle, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.05, 0.03, len]} />
              <meshStandardMaterial color="#7a4f2a" roughness={0.85} />
            </mesh>
          );
        }

        const portDiscCenterY = dockMid.y + PORT_DISC_HEIGHT / 2;
        const portDiscTopY = dockMid.y + PORT_DISC_HEIGHT;
        const portLabelY = portDiscTopY + 0.002;

        return (
          <group key={port.edgeId}>
            {plank(v1, dockMidPlank, "p1")}
            {plank(v2, dockMidPlank, "p2")}
            <mesh
              position={[dockMid.x, portDiscCenterY, dockMid.z]}
              castShadow
              receiveShadow
            >
              <cylinderGeometry args={[0.22, 0.22, PORT_DISC_HEIGHT, 36]} />
              <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
            </mesh>
            <Text
              position={[dockMid.x, portLabelY, dockMid.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.13}
              color="#111111"
              anchorX="center"
              anchorY="middle"
              fontWeight={700}
            >
              {label}
            </Text>
          </group>
        );
      })}
    </>
  );
}

export function Board3D(props: Board3DProps) {
  const vertexPos = useMemo(() => buildVertexPosMap(props.hexes), [props.hexes]);
  const edgePos = useMemo(() => buildEdgePosMap(props.hexes), [props.hexes]);

  const playerColor = (id: string) => {
    const p = props.players.find((pl) => pl.id === id);
    return p ? PLAYER_COLORS[p.color] ?? "#ffffff" : "#ffffff";
  };

  return (
    <Canvas
      shadows="soft"
      camera={{ position: [0, 11, 9], fov: 45, near: 0.1, far: 100 }}
      style={{ width: "100%", height: "100%" }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      dpr={[1, 2]}
    >
      <Suspense fallback={null}>
        <color attach="background" args={["#0e1a2b"]} />
        <fog attach="fog" args={["#0e1a2b", 18, 35]} />

        {/* IBL — gives subtle reflections and warmer ambient than a flat color. */}
        <Environment preset="sunset" background={false} environmentIntensity={0.55} />

        <ambientLight intensity={0.35} color="#fff5e6" />
        <directionalLight
          position={[6, 14, 4]}
          intensity={1.6}
          color="#fff2d6"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-camera-near={0.1}
          shadow-camera-far={40}
          shadow-bias={-0.0005}
          shadow-normalBias={0.04}
        />
        <directionalLight
          position={[-6, 10, -4]}
          intensity={0.35}
          color="#9bbcff"
        />

        {/* Sea plane underneath the board — animated procedural water */}
        <OceanPlane />
        {/* Soft contact shadow under the board to ground the geometry. */}
        <ContactShadows
          position={[0, 0.04, 0]}
          opacity={0.45}
          blur={2.4}
          scale={14}
          far={2.5}
          resolution={1024}
          color="#000000"
        />

        {/* Hex tiles */}
        {props.hexes.map((hex) => {
          const robberMode =
            props.placementMode === "robber" ||
            props.placementMode === "knight_robber" ||
            props.placementMode === "pirate";
          const isValidRobberTarget =
            !props.validHexIds || props.validHexIds.includes(hex.id);
          const handleClick =
            robberMode && isValidRobberTarget
              ? () => props.onHexClick?.(hex.id)
              : undefined;
          return (
            <HexTile
              key={hex.id}
              hex={hex}
              hasRobber={props.robberHexId === hex.id}
              onClick={handleClick}
            />
          );
        })}

        <PortMarkers hexes={props.hexes} ports={props.ports} />

        {/* Roads */}
        {props.pieces.map((p, i) => {
          if (p.kind !== "road") return null;
          const e = edgePos.get(p.edgeId);
          if (!e) return null;
          return (
            <RoadMesh
              key={`r${i}`}
              v1={e.v1}
              v2={e.v2}
              color={playerColor(p.playerId)}
            />
          );
        })}

        {/* Ships + Warships */}
        {props.pieces.map((p, i) => {
          if (p.kind !== "ship" && p.kind !== "warship") return null;
          const e = edgePos.get(p.edgeId);
          if (!e) return null;
          return (
            <ShipMesh
              key={`sh${i}`}
              v1={e.v1}
              v2={e.v2}
              color={playerColor(p.playerId)}
              isWarship={p.kind === "warship"}
            />
          );
        })}

        {/* Pirate (sea robber) */}
        {props.pirateHexId && (() => {
          const hex = props.hexes.find((h) => h.id === props.pirateHexId);
          if (!hex) return null;
          const [x, , z] = hexToWorld(hex.coord);
          return (
            <group position={[x, 0, z]}>
              <PirateMesh y={HEX_HEIGHT_SEA + 0.05} />
            </group>
          );
        })()}

        {/* Pirate Islands fortresses */}
        {(props.fortresses ?? []).map((f) => {
          const hex = props.hexes.find((h) => h.id === f.hexId);
          if (!hex) return null;
          const [x, , z] = hexToWorld(hex.coord);
          const owner = f.ownerId
            ? props.players.find((p) => p.id === f.ownerId)
            : null;
          const wallColor = owner ? PLAYER_COLORS[owner.color] : "#3a3a3a";
          return (
            <group key={f.hexId} position={[x, HEX_HEIGHT_DESERT, z]}>
              {/* Fortress base */}
              <mesh castShadow receiveShadow position={[0, 0.1, 0]}>
                <boxGeometry args={[0.6, 0.2, 0.6]} />
                <meshStandardMaterial color={wallColor} roughness={0.8} />
              </mesh>
              {/* Four corner towers */}
              {[
                [-0.25, -0.25],
                [0.25, -0.25],
                [-0.25, 0.25],
                [0.25, 0.25],
              ].map(([tx, tz], i) => (
                <mesh
                  key={i}
                  castShadow
                  receiveShadow
                  position={[tx, 0.25, tz]}
                >
                  <cylinderGeometry args={[0.07, 0.08, 0.32, 8]} />
                  <meshStandardMaterial color={wallColor} roughness={0.75} />
                </mesh>
              ))}
              {/* HP indicator: tiny cubes at the top, one per remaining hp */}
              {Array.from({ length: f.hpRemaining }).map((_, i) => (
                <mesh
                  key={`hp${i}`}
                  position={[(i - (f.hpRemaining - 1) / 2) * 0.08, 0.5, 0]}
                  castShadow
                >
                  <boxGeometry args={[0.05, 0.05, 0.05]} />
                  <meshStandardMaterial
                    color={owner ? "#fff8c4" : "#a02a2a"}
                    emissive={owner ? "#aa8a40" : "#7a1818"}
                    emissiveIntensity={0.4}
                  />
                </mesh>
              ))}
            </group>
          );
        })}

        {/* Settlements + Cities */}
        {props.pieces.map((p, i) => {
          if (p.kind !== "settlement" && p.kind !== "city") return null;
          const v = vertexPos.get(p.vertexId);
          if (!v) return null;
          const color = playerColor(p.playerId);
          if (p.kind === "settlement") {
            return (
              <SettlementMesh key={`s${i}`} position={[v.x, v.y, v.z]} color={color} />
            );
          }
          return (
            <CityMesh key={`c${i}`} position={[v.x, v.y, v.z]} color={color} />
          );
        })}

        {/* Pickers */}
        {(props.placementMode === "settlement" ||
          props.placementMode === "city") && (
          <VertexPicker
            hexes={props.hexes}
            pieces={props.pieces}
            validIds={props.validVertexIds}
            onClick={props.onVertexClick ?? (() => {})}
          />
        )}
        {(props.placementMode === "road" ||
          props.placementMode === "road_building" ||
          props.placementMode === "ship" ||
          props.placementMode === "move_ship_select" ||
          props.placementMode === "move_ship_target" ||
          props.placementMode === "warship_upgrade") && (
          <EdgePicker
            hexes={props.hexes}
            pieces={props.pieces}
            validIds={props.validEdgeIds}
            allowOccupied={
              props.placementMode === "move_ship_select" ||
              props.placementMode === "warship_upgrade"
            }
            onClick={props.onEdgeClick ?? (() => {})}
          />
        )}
        {(props.placementMode === "robber" ||
          props.placementMode === "knight_robber" ||
          props.placementMode === "pirate") && (
          <HexHighlights
            hexes={props.hexes}
            validIds={props.validHexIds}
          />
        )}

        <OrbitControls
          enablePan
          // Right-mouse / two-finger drag pans; tweak speed so it feels close
          // to a colonist.io style camera.
          panSpeed={1.0}
          screenSpacePanning
          // Left-mouse drag rotates, right-mouse drag pans, wheel zooms.
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          // Touch: 1 finger rotate, 2 fingers pan/dolly.
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
          // Arrow keys pan (Three.js OrbitControls default keymap).
          keyPanSpeed={20}
          minDistance={5}
          maxDistance={42}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 0, 0]}
        />
      </Suspense>
    </Canvas>
  );
}

function HexHighlights({
  hexes,
  validIds,
}: {
  hexes: Hex[];
  validIds?: string[];
}) {
  const allowed = validIds ? new Set(validIds) : null;
  return (
    <>
      {hexes
        // Highlight any hex that is in the validIds set (the caller decides
        // which hex types are eligible). Excluding sea/fog by default would
        // break the pirate picker which needs to highlight sea hexes.
        .filter((h) => (allowed ? allowed.has(h.id) : h.terrain !== "sea" && h.terrain !== "fog"))
        .map((hex) => {
          const [x, , z] = hexToWorld(hex.coord);
          const top =
            hex.terrain === "sea" || hex.terrain === "fog"
              ? HEX_HEIGHT_SEA
              : hex.terrain === "desert"
              ? HEX_HEIGHT_DESERT
              : HEX_HEIGHT_LAND;
          return (
            <mesh
              key={`hl${hex.id}`}
              position={[x, top + 0.03, z]}
              rotation={[0, 0, 0]}
            >
              <cylinderGeometry args={[HEX_SIZE * 0.95, HEX_SIZE * 0.95, 0.01, 6]} />
              <meshBasicMaterial color="#ffe066" transparent opacity={0.4} />
            </mesh>
          );
        })}
    </>
  );
}

