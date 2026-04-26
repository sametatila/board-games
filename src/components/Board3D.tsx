"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import {
  Billboard,
  ContactShadows,
  Environment,
  OrbitControls,
  Text,
  useGLTF,
  useTexture,
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
// Vertical offset of the *top face* of the dirt base hex in world space.
// dirt.glb authored y_max = 0.10; with our √3 uniform scale that lands
// the top face at y ≈ 0.173. Settlement/road/ship anchors rest at this
// height so they sit on the surface; the painted sprite sits on top of
// it (with a tiny bias to avoid z-fighting).
const HEX_HEIGHT_LAND = 0.1 * Math.sqrt(3);
const HEX_HEIGHT_DESERT = 0.1 * Math.sqrt(3);
const HEX_HEIGHT_SEA = 0.05;

// Kenney Hexagon Kit (CC0). All visual pieces — hex tiles, settlements,
// cities, ships, roads, ports, decor — come from this pack so the board
// looks like a real game instead of placeholder primitives. Models share
// a single colormap.png atlas and are pre-baked at hex unit ≈ 1 world
// unit, which lines up perfectly with our HEX_SIZE.
const KIT = "/assets/hexagon-kit/Models/GLB%20format";
const ASSET = {
  // Flat 3D base under every painted hex sprite for genuine depth.
  hex_base_dirt: `${KIT}/dirt.glb`,
  // Sea hex tile — plain Kenney water with the kit's painted waves.
  hex_water: `${KIT}/water.glb`,
  // Player pieces — Kenney 3D models tinted to player colours.
  unit_house: `${KIT}/unit-house.glb`,
  unit_mansion: `${KIT}/unit-mansion.glb`,
  unit_ship: `${KIT}/unit-ship.glb`,
  unit_ship_large: `${KIT}/unit-ship-large.glb`,
  // Roads and port structures.
  path_straight: `${KIT}/path-straight.glb`,
  building_dock: `${KIT}/building-dock.glb`,
  building_tower: `${KIT}/building-tower.glb`,
} as const;

// Painted 2D sprite pack — used as the top face of every hex tile, plus
// settlement / city / fortress / port / token sprites. Drawn isometric
// but we lay them flat on the hex top so they read as decoration painted
// onto the surface.
const SPRITES = {
  hex_wood: "/assets/sprites/hex-wood.png",
  hex_brick: "/assets/sprites/hex-brick.png",
  hex_wheat: "/assets/sprites/hex-weed.png",
  hex_sheep: "/assets/sprites/hex-sheep.png",
  hex_ore: "/assets/sprites/hex-rock.png",
  hex_desert: "/assets/sprites/hex-dessert.png",
  hex_gold: "/assets/sprites/hex-gold.png",
  hex_fog: "/assets/sprites/hex-fog.png",
  port_any: "/assets/sprites/10.png",
  port_wood: "/assets/sprites/port-wood.png",
  port_brick: "/assets/sprites/port-brick.png",
  port_wheat: "/assets/sprites/port-weed.png",
  port_sheep: "/assets/sprites/port-sheep.png",
  port_ore: "/assets/sprites/port-rock.png",
  pirate_castle: "/assets/sprites/pirate-castle.png",
  thief: "/assets/sprites/thief.png",
} as const;

// Every sea-style tile uses the plain water mesh. The hex id argument
// stays around in case we want to add scenic variants back later.
function seaTileForHex(_hexId: string): string {
  return ASSET.hex_water;
}

function spriteForTerrain(terrain: HexTerrain): string | null {
  switch (terrain) {
    case "wood": return SPRITES.hex_wood;
    case "brick": return SPRITES.hex_brick;
    case "wheat": return SPRITES.hex_wheat;
    case "sheep": return SPRITES.hex_sheep;
    case "ore": return SPRITES.hex_ore;
    case "desert": return SPRITES.hex_desert;
    case "gold": return SPRITES.hex_gold;
    case "fog": return SPRITES.hex_fog;
    // Sea hexes use the kit's 3D water tile, not a flat sprite.
    case "sea": return null;
  }
}

function spriteForPortKind(kind: string): string {
  switch (kind) {
    case "wood": return SPRITES.port_wood;
    case "brick": return SPRITES.port_brick;
    case "wheat": return SPRITES.port_wheat;
    case "sheep": return SPRITES.port_sheep;
    case "ore": return SPRITES.port_ore;
    default: return SPRITES.port_any;
  }
}

// Pre-warm GLB and sprite caches so the first time each asset appears
// on screen it doesn't suspend mid-frame and disappear briefly.
Object.values(ASSET).forEach((path) => useGLTF.preload(path));
Object.values(SPRITES).forEach((path) => useTexture.preload(path));

// (hexTileForTerrain / decorTopForTerrain / isBuildingTile removed —
// hex tile rendering is now sprite-based on top of a flat dirt base.)

// Loads a GLB and returns a *cloned* scene with its materials cloned so
// per-instance tinting (player colours, gold sheen) doesn't leak across
// other meshes that share the same atlas material. Returns the cloned
// object and its local-space bounding box (untransformed) so callers can
// reason about size and grounding.
function useKenneyClone(
  path: string,
  tintColor?: string,
): { object: THREE.Object3D; bbox: THREE.Box3 } {
  const { scene } = useGLTF(path) as unknown as { scene: THREE.Group };
  return useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat =
        Array.isArray(obj.material)
          ? obj.material.map((m) => m.clone())
          : (obj.material as THREE.Material).clone();
      obj.material = mat;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (tintColor) {
        const apply = (m: THREE.Material) => {
          const std = m as THREE.MeshStandardMaterial;
          if (std.color) std.color.set(tintColor);
        };
        if (Array.isArray(mat)) mat.forEach(apply);
        else apply(mat);
      }
    });
    root.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(root);
    return { object: root, bbox };
  }, [scene, tintColor]);
}

function KenneyModel({
  path,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  tintColor,
  // When set, scale the model uniformly so its widest horizontal extent
  // (max of x/z size in local space, AFTER `rotation`) matches `fitWidth`
  // world units. This is the "fit to footprint" mode used to drop
  // arbitrary Kenney pieces onto the hex grid without guessing scale
  // factors. The rotation is applied to the bbox before measuring so a
  // 30° flat→pointy-top rotation, for example, doesn't undersize the
  // tile.
  fitWidth,
  // When true, lift the model so its lowest point sits exactly at y=0
  // of the parent group, AFTER `rotation` and scale. Combined with
  // positioning the parent at the hex top, this guarantees pieces rest
  // on the surface instead of floating or sinking.
  groundOnFloor = false,
}: {
  path: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  tintColor?: string;
  fitWidth?: number;
  groundOnFloor?: boolean;
}) {
  const { object, bbox } = useKenneyClone(path, tintColor);

  // Bounding box AFTER applying `rotation` (still in local units, scale=1).
  // We need the rotated bbox for both fit-to-width and grounding so a
  // tile rotated 30° around Y measures with its rotated footprint, not
  // its authored footprint.
  const rotatedBbox = useMemo(() => {
    if (!bbox || bbox.isEmpty()) return null;
    const m = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"),
    );
    return bbox.clone().applyMatrix4(m);
  }, [bbox, rotation[0], rotation[1], rotation[2]]);

  let effectiveScale: [number, number, number];
  if (typeof fitWidth === "number" && rotatedBbox) {
    const sx = rotatedBbox.max.x - rotatedBbox.min.x;
    const sz = rotatedBbox.max.z - rotatedBbox.min.z;
    const widest = Math.max(sx, sz) || 1;
    const factor = fitWidth / widest;
    effectiveScale = [factor, factor, factor];
  } else {
    effectiveScale =
      typeof scale === "number" ? [scale, scale, scale] : scale;
  }

  // Vertical offset = -minY of rotated bbox, scaled by Y scale, so the
  // model's lowest point lands exactly at y=0 in the parent group.
  const groundLift = groundOnFloor && rotatedBbox
    ? -rotatedBbox.min.y * effectiveScale[1]
    : 0;

  return (
    <group position={[position[0], position[1] + groundLift, position[2]]}>
      <group rotation={rotation} scale={effectiveScale}>
        <primitive object={object} />
      </group>
    </group>
  );
}

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

// Hex tile: a flat 3D dirt slab (Kenney) for thickness, a painted sprite
// laid across its top face for the visual, and overlays (token, robber,
// highlight) above. Sea hexes get *only* the click-catcher and the
// procedural ocean plane underneath shows through. The sprite is on a
// square plane sized to fit the hex's bounding rectangle; transparent
// pixels around the painted hexagon shape vanish thanks to alphaTest.
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
  const isSea = hex.terrain === "sea";
  const spritePath = spriteForTerrain(hex.terrain);
  const TILE_TOP_Y = HEX_HEIGHT_LAND; // dirt top ≈ 0.173
  // Sprite sits a small but real distance above the dirt slab. Anything
  // smaller than ~0.005 produces depth-buffer fighting at our camera
  // distances and the sprite vanishes.
  const SPRITE_Y = TILE_TOP_Y + 0.008;
  // Token/robber/highlight stack just above the sprite — kept very
  // close so the token reads as resting on the painted hex face.
  const TOKEN_Y = SPRITE_Y + 0.003;

  // The painted hex sprites are isometric drawings whose hexagonal
  // silhouette fills *most* of a square frame. The hex's pointy-top
  // height (corner-to-corner) in world units is 2 * HEX_SIZE; we scale
  // the plane to that value so the painted hex fills the tile exactly.
  // A tiny overlap (1.02) hides any pixel-level gap between neighbours.
  const SPRITE_SIZE = 2 * HEX_SIZE * 1.05;

  return (
    <group position={[pos[0], pos[1], pos[2]]}>
      {/* Click-catcher disk covers the hex footprint (slightly inset so
          it doesn't overlap neighbours). Always present so sea hexes can
          still be picked for pirate placement / ship moves. */}
      <mesh
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onClick}
        visible={false}
      >
        <circleGeometry args={[HEX_SIZE * 0.97, 6]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Flat 3D base under the painted top.
          - Land hexes sit on a dirt slab.
          - Sea hexes sit on Kenney's water tile (with two rare scenic
            variants — water-island and water-rocks — sprinkled in for
            visual variety). The variant choice is deterministic (seeded
            by hex id) so it stays stable across re-renders and clients. */}
      {!isSea && (
        <Suspense fallback={null}>
          <KenneyModel
            path={ASSET.hex_base_dirt}
            position={[0, 0, 0]}
            scale={Math.sqrt(3) * HEX_SIZE * 1.01}
            groundOnFloor
          />
        </Suspense>
      )}
      {isSea && (
        <Suspense fallback={null}>
          <KenneyModel
            path={seaTileForHex(hex.id)}
            position={[0, -0.1, 0]}
            scale={Math.sqrt(3) * HEX_SIZE * 1.01}
            groundOnFloor
          />
        </Suspense>
      )}

      {/* Painted hex face — a flat plane laid horizontally on top of the
          base. Sea hexes don't get a sprite anymore; the kit's water
          tile mesh is the visual. */}
      {!isSea && spritePath && (
        <Suspense fallback={null}>
          <HexSprite
            path={spritePath}
            y={SPRITE_Y}
            size={SPRITE_SIZE}
          />
        </Suspense>
      )}

      {isLand && hex.numberToken !== null && (
        <NumberTokenMesh number={hex.numberToken} y={TOKEN_Y} />
      )}
      {hex.terrain === "fog" && (
        <Text
          position={[0, TOKEN_Y + 0.04, 0]}
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
      {hasRobber && <RobberMesh y={TOKEN_Y} />}
      {isHighlighted && (
        <mesh position={[0, TOKEN_Y + 0.005, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[HEX_SIZE * 0.95, HEX_SIZE * 0.95, 0.01, 6]} />
          <meshBasicMaterial color="#ffe066" transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

// Lays a painted PNG flat on the XZ plane at the given Y. Uses
// alphaTest so the transparent corners of the hex sprite don't z-fight
// with neighbouring tiles.
function HexSprite({
  path,
  y,
  size,
}: {
  path: string;
  y: number;
  size: number;
}) {
  const tex = useTexture(path);
  // Setup once: nearest-friendly sampling, sRGB so the painted colours
  // don't get gamma-shifted, and a flag that lets useTexture refresh
  // when the cache reuses the texture across hexes.
  useMemo(() => {
    if (!tex) return;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  }, [tex]);
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        map={tex}
        transparent
        alphaTest={0.5}
        roughness={0.85}
        metalness={0}
        // Polygon offset pushes the sprite a hair closer to the camera
        // in the depth buffer so it always wins z-fighting against the
        // dirt slab underneath, even when both meshes share the same Y.
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

// (HexBorder removed — Kenney hex tiles already have visible bevels and
// distinct colours, so the dark seam line isn't needed any more.)

// (seedRand removed — used only by the deleted TerrainDecor.)

// (TerrainDecor removed — Kenney hex tiles ship with their own decor:
// grass-forest already has trees, stone-mountain already has peaks,
// grass-hill already has the hill bump, sand already has dunes. We don't
// need a parallel hand-modelled decor layer any more.)

// Layered Y-heights on top of a hex tile. Bigger Y = closer to camera (above).
// Hex top sits at `y` (passed in by the caller). All overlays are stacked above:
//   y + 0.00..0.06  : token disc (cylinder of height 0.06, centered at y+0.03)
//   y + 0.061       : pip dots (just above disc face)
//   y + 0.062       : number text (just above disc face, slightly higher than dots
//                     so glyph never z-fights with dots)
const TOKEN_DISC_HEIGHT = 0.06;
const TOKEN_TOP_Y = TOKEN_DISC_HEIGHT; // local y at the top face of the disc
const TEXT_Y = TOKEN_TOP_Y + 0.005;
const PIP_Y = TOKEN_TOP_Y + 0.004;
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
  // Plain 3D wooden disc — a stubby cylinder with cream-coloured top
  // and side. The number text sits on the top face directly. No sprite
  // texture, no painted scallop, just clean geometry.
  const radius = 0.32;
  const height = 0.06;
  return (
    <group position={[0, y, 0]}>
      <mesh
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[radius, radius, height, 48]} />
        <meshStandardMaterial
          color="#f3e7c6"
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
      <Text
        position={[0, height + 0.012, NUMBER_Z_OFFSET]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color={isHot ? "#b20a1c" : "#111111"}
        anchorX="center"
        anchorY="middle"
        fontWeight={700}
      >
        {String(number)}
      </Text>
      <PipDots count={pipFor(number)} color={pipColor} y={height + 0.011} />
    </group>
  );
}

function PipDots({
  count,
  color,
  y,
}: {
  count: number;
  color: string;
  y?: number;
}) {
  const dots = [];
  const spacing = 0.05;
  const dotY = y ?? PIP_Y;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    dots.push(
      <mesh
        key={i}
        position={[x, dotY, PIPS_Z_OFFSET]}
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
  // Painted thief sprite — billboard so it always faces the camera as
  // the player orbits the board. The PNG has a small empty band at the
  // bottom around the figure's feet, so we sink the sprite a touch
  // further than half its size for the boots to actually touch the
  // hex face.
  const SIZE = 0.805; // 0.7 × 1.15
  return (
    <group position={[0, y, 0]}>
      <Suspense fallback={null}>
        <BillboardSprite path={SPRITES.thief} size={SIZE} y={SIZE / 2 - 0.08} />
      </Suspense>
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
  // Kenney unit-house tinted to the player colour. The kit authors
  // these models with the front facade pointing along -x, so we yaw
  // them by +π/2 so it faces +z (the camera). Sized down 30% from the
  // earlier 0.55 width for a more proportional silhouette.
  return (
    <PopInGroup position={position}>
      <PlayerRing color={color} radius={0.123} />
      <Suspense fallback={null}>
        <KenneyModel
          path={ASSET.unit_house}
          position={[0, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
          fitWidth={0.295}
          groundOnFloor
          tintColor={color}
        />
      </Suspense>
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
  // Kenney unit-mansion: same yaw correction as the settlement so the
  // facade greets the camera, and 30% smaller than the previous 0.8
  // footprint to match the new settlement proportions.
  return (
    <PopInGroup position={position}>
      <PlayerRing color={color} radius={0.168} />
      <Suspense fallback={null}>
        <KenneyModel
          path={ASSET.unit_mansion}
          position={[0, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
          fitWidth={0.428}
          groundOnFloor
          tintColor={color}
        />
      </Suspense>
    </PopInGroup>
  );
}

// Small ring drawn flat on the floor under the player's piece, in the
// player's colour. Sprite assets are colour-baked so we put identity
// underneath instead of trying to recolour the painted PNGs.
function PlayerRing({ color, radius }: { color: string; radius: number }) {
  return (
    <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.7, radius, 24]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} />
    </mesh>
  );
}

// A sprite that always faces the camera (like Three.js's built-in
// Sprite) but with controllable size and y-offset above the anchor.
function BillboardSprite({
  path,
  size,
  y = 0,
}: {
  path: string;
  size: number;
  y?: number;
}) {
  const tex = useTexture(path);
  useMemo(() => {
    if (!tex) return;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  }, [tex]);
  // Drei's <Billboard> turned out to be more reliable than the bare
  // three.js <sprite> for our PNGs — sprites occasionally rendered
  // fully transparent during the first few frames after texture load.
  return (
    <Billboard position={[0, y, 0]}>
      <mesh>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          map={tex}
          transparent
          alphaTest={0.1}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
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
  // path-straight is modelled along its local +x axis (bbox x ∈ [-0.5,0.5]),
  // same as the harbour boardwalks. Yaw is taken so +x rotates into the
  // edge direction.
  const yaw = -Math.atan2(dir.z, dir.x);
  // Sit a hair above the dirt slab top — close enough to read as
  // resting on the tile, but with enough bias to avoid z-fighting.
  const y = HEX_HEIGHT_LAND + 0.003;
  return (
    <PopInGroup position={[mid.x, y, mid.z]}>
      <Suspense fallback={null}>
        <KenneyModel
          path={ASSET.path_straight}
          rotation={[0, yaw, 0]}
          fitWidth={length * 0.92}
          groundOnFloor
          tintColor={color}
        />
      </Suspense>
    </PopInGroup>
  );
}

// Player ship — Kenney's unit-ship for normal ships, unit-ship-large for
// warships. Tinted to the player colour and oriented along the edge.
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
  return (
    <PopInGroup position={[mid.x, HEX_HEIGHT_SEA, mid.z]}>
      <Suspense fallback={null}>
        <KenneyModel
          path={isWarship ? ASSET.unit_ship_large : ASSET.unit_ship}
          rotation={[0, angle, 0]}
          fitWidth={length * 0.85}
          groundOnFloor
          tintColor={color}
        />
      </Suspense>
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

  return (
    <>
      {ports.map((port) => {
        const e = edgePos.get(port.edgeId);
        if (!e) return null;
        const land = edgeToLandHex.get(port.edgeId);
        if (!land) return null;

        const mid = e.v1.clone().add(e.v2).multiplyScalar(0.5);
        const [hx, , hz] = hexToWorld(land.coord);
        const outward = new THREE.Vector3(mid.x - hx, 0, mid.z - hz);
        if (outward.lengthSq() > 0) outward.normalize();

        // Push the dock head outward enough that the model sits clearly off
        // the land tile's footprint.
        const dockOffset = 0.55;
        const dockCenter = new THREE.Vector3(
          mid.x + outward.x * dockOffset,
          HEX_HEIGHT_SEA,
          mid.z + outward.z * dockOffset,
        );
        const dockYaw = Math.atan2(outward.x, outward.z);

        // 2:1 ports already paint their resource cargo onto the dock
        // sprite, so the extra "2:1" tag would be redundant. Only the
        // generic 3:1 needs a label. 2:1 sprites are 30% smaller so
        // they don't dominate next to land. Y offset is tuned so the
        // sprite's painted base sits just above the sea, not floating.
        const isGeneric = port.kind === "any";
        const portSize = isGeneric ? 0.69 : 0.483;
        const portY = portSize / 2;

        // Two boardwalks — one from each shore corner of the edge out to
        // the dock. Together they form a triangular pier that visually
        // ties the dock back to the hexagon.
        function plank(corner: THREE.Vector3, key: string) {
          const from = new THREE.Vector3(corner.x, HEX_HEIGHT_LAND, corner.z);
          const to = new THREE.Vector3(
            dockCenter.x,
            HEX_HEIGHT_SEA + 0.04,
            dockCenter.z,
          );
          // Slightly trim the dock side so the two planks don't bury into
          // the dock sprite — they should converge AT the dock, not pass
          // through it.
          const trimmed = from.clone().lerp(to, 0.95);
          const center = from.clone().add(trimmed).multiplyScalar(0.5);
          const len = from.distanceTo(trimmed);
          // path-straight is modelled along its local +x axis (bbox
          // x ∈ [-0.5, 0.5]). Yaw is taken so that +x rotates into the
          // (to - from) direction in the XZ plane.
          const dx = trimmed.x - from.x;
          const dz = trimmed.z - from.z;
          const yaw = Math.atan2(dz, dx);
          return (
            <Suspense fallback={null} key={key}>
              <KenneyModel
                path={ASSET.path_straight}
                position={[center.x, center.y, center.z]}
                rotation={[0, -yaw, 0]}
                fitWidth={len * 1.02}
                groundOnFloor
                tintColor="#a37844"
              />
            </Suspense>
          );
        }

        return (
          <group key={port.edgeId}>
            {plank(e.v1, "p1")}
            {plank(e.v2, "p2")}
            <Suspense fallback={null}>
              <group position={[dockCenter.x, HEX_HEIGHT_SEA, dockCenter.z]}>
                <BillboardSprite
                  path={spriteForPortKind(port.kind)}
                  size={portSize}
                  y={portSize * 0.42}
                />
              </group>
            </Suspense>

            <Billboard
              position={[dockCenter.x, HEX_HEIGHT_SEA + portSize * 0.95, dockCenter.z]}
            >
              <mesh>
                <planeGeometry args={[0.32, 0.18]} />
                <meshBasicMaterial
                  color="#0f172a"
                  transparent
                  opacity={0.82}
                  depthWrite={false}
                />
              </mesh>
              <Text
                position={[0, 0, 0.001]}
                fontSize={0.12}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                fontWeight={700}
              >
                {isGeneric ? "3:1" : "2:1"}
              </Text>
            </Billboard>
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
      // Cap pixel ratio to 1.6 (was 2). On retina/4K screens this halves
      // the fragment shader load with virtually no perceived sharpness loss.
      dpr={[1, 1.6]}
      // R3F adaptive throttling: when the frame rate dips, automatically
      // drop quality (fewer samples, lower DPR) until it recovers. Comes
      // back to full quality on idle.
      performance={{ min: 0.5 }}
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

        {/* Decorative water backdrop — Kenney water tiles tiled in a
            wide hex spiral around the actual board so the dirt slabs
            don't sit in a void. The deco tiles aren't part of game
            state (no clicks, no production), they exist only to make
            the camera feel like it's looking at an island in a sea.
            water-island and water-rocks variants are sprinkled in via
            the same per-hex hash used by sea hexes. */}
        <WaterBackdrop hexes={props.hexes} />

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

        {/* Pirate Islands fortresses — painted pirate-castle sprite with
            an owner-colour ring at the base when captured. HP cubes float
            above to show remaining hits. */}
        {(props.fortresses ?? []).map((f) => {
          const hex = props.hexes.find((h) => h.id === f.hexId);
          if (!hex) return null;
          const [x, , z] = hexToWorld(hex.coord);
          const owner = f.ownerId
            ? props.players.find((p) => p.id === f.ownerId)
            : null;
          const ringColor = owner ? PLAYER_COLORS[owner.color] : "#7a6f5e";
          return (
            <group key={f.hexId} position={[x, HEX_HEIGHT_DESERT, z]}>
              <PlayerRing color={ringColor} radius={0.55} />
              <Suspense fallback={null}>
                <BillboardSprite
                  path={SPRITES.pirate_castle}
                  size={1.2}
                  y={0.6}
                />
              </Suspense>
              {Array.from({ length: f.hpRemaining }).map((_, i) => (
                <mesh
                  key={`hp${i}`}
                  position={[(i - (f.hpRemaining - 1) / 2) * 0.09, 0.95, 0]}
                  castShadow
                >
                  <boxGeometry args={[0.06, 0.06, 0.06]} />
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

// Build a ring of decorative water hexes around the actual board.
// Strategy: take every (q, r) in a wide rectangular bounding box around
// the existing hexes, skip the cells that the real board already
// occupies, and render plain water (or a rare island/rocks variant)
// for the rest. The radius is generous enough that even at full zoom
// out the camera doesn't see the edge.
function WaterBackdrop({ hexes }: { hexes: Hex[] }) {
  const decoHexes = useMemo(() => {
    if (hexes.length === 0) return [];
    const occupied = new Set<string>();
    let minQ = Infinity,
      maxQ = -Infinity,
      minR = Infinity,
      maxR = -Infinity;
    for (const h of hexes) {
      occupied.add(`${h.coord.q},${h.coord.r}`);
      if (h.coord.q < minQ) minQ = h.coord.q;
      if (h.coord.q > maxQ) maxQ = h.coord.q;
      if (h.coord.r < minR) minR = h.coord.r;
      if (h.coord.r > maxR) maxR = h.coord.r;
    }
    // Pad outwards. Camera maxDistance is 42 world units; padding 10
    // hex rings (≈ 17 world units in any direction) gives the player
    // a healthy water margin without exploding the draw call count.
    const PAD = 10;
    const result: { q: number; r: number; id: string }[] = [];
    for (let q = minQ - PAD; q <= maxQ + PAD; q++) {
      for (let r = minR - PAD; r <= maxR + PAD; r++) {
        const key = `${q},${r}`;
        if (occupied.has(key)) continue;
        result.push({ q, r, id: `bg:${key}` });
      }
    }
    return result;
  }, [hexes]);

  const scale = Math.sqrt(3) * HEX_SIZE * 1.01;
  return (
    <>
      {decoHexes.map((h) => {
        const px = axialToPixel(h, HEX_SIZE);
        return (
          <Suspense fallback={null} key={h.id}>
            <KenneyModel
              path={seaTileForHex(h.id)}
              position={[px.x, -0.1, px.y]}
              scale={scale}
              groundOnFloor
            />
          </Suspense>
        );
      })}
    </>
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

