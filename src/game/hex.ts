import type { AxialCoord, VertexId, EdgeId } from "./types";

export type CubeCoord = { x: number; y: number; z: number };
export type PixelCoord = { x: number; y: number };

export const HEX_DIRECTIONS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialToCube(a: AxialCoord): CubeCoord {
  return { x: a.q, z: a.r, y: -a.q - a.r };
}

export function cubeToAxial(c: CubeCoord): AxialCoord {
  return { q: c.x, r: c.z };
}

export function hexEqual(a: AxialCoord, b: AxialCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexKey(a: AxialCoord): string {
  return `${a.q},${a.r}`;
}

export function neighbor(a: AxialCoord, dir: number): AxialCoord {
  const d = HEX_DIRECTIONS[((dir % 6) + 6) % 6];
  return { q: a.q + d.q, r: a.r + d.r };
}

export function neighbors(a: AxialCoord): AxialCoord[] {
  return HEX_DIRECTIONS.map((d) => ({ q: a.q + d.q, r: a.r + d.r }));
}

export function hexDistance(a: AxialCoord, b: AxialCoord): number {
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  return (Math.abs(ac.x - bc.x) + Math.abs(ac.y - bc.y) + Math.abs(ac.z - bc.z)) / 2;
}

export function ringOf(center: AxialCoord, radius: number): AxialCoord[] {
  if (radius === 0) return [{ ...center }];
  const results: AxialCoord[] = [];
  let cur: AxialCoord = {
    q: center.q + HEX_DIRECTIONS[4].q * radius,
    r: center.r + HEX_DIRECTIONS[4].r * radius,
  };
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push(cur);
      cur = neighbor(cur, i);
    }
  }
  return results;
}

export function spiralOf(center: AxialCoord, radius: number): AxialCoord[] {
  const out: AxialCoord[] = [{ ...center }];
  for (let r = 1; r <= radius; r++) {
    out.push(...ringOf(center, r));
  }
  return out;
}

// Pointy-top orientation. Hexes have a flat TOP and BOTTOM edge facing the
// viewer (like classic Catan). Corners point straight up and down.
// Reference: https://www.redblobgames.com/grids/hexagons/
export function axialToPixel(a: AxialCoord, size: number): PixelCoord {
  const x = size * (Math.sqrt(3) * a.q + (Math.sqrt(3) / 2) * a.r);
  const y = size * ((3 / 2) * a.r);
  return { x, y };
}

export function pixelToAxial(p: PixelCoord, size: number): AxialCoord {
  const q = ((Math.sqrt(3) / 3) * p.x - (1 / 3) * p.y) / size;
  const r = ((2 / 3) * p.y) / size;
  return axialRound({ q, r });
}

export function axialRound(a: AxialCoord): AxialCoord {
  const x = a.q;
  const z = a.r;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

// Pointy-top: 6 vertices per hex starting at top, clockwise.
// Each vertex is shared by up to 3 hexes. Canonical ID = lex-min hexkey + "v" + sortedCornerIndex.
// Simpler approach: assign vertex an ID from the 3 hexes that share it.
// We'll use the offset trick: a vertex is identified by the upper-left of the 3 hexes.

export function vertexId(hex: AxialCoord, corner: number): VertexId {
  // 6 corners per hex, but each corner is shared. Canonical owner picks lowest (q+r, q).
  const owners = vertexOwners(hex, corner);
  owners.sort((a, b) => {
    const sa = a.coord.q + a.coord.r;
    const sb = b.coord.q + b.coord.r;
    if (sa !== sb) return sa - sb;
    if (a.coord.q !== b.coord.q) return a.coord.q - b.coord.q;
    return a.coord.r - b.coord.r;
  });
  const owner = owners[0];
  return `v:${owner.coord.q},${owner.coord.r}:${owner.corner}`;
}

type VertexOwner = { coord: AxialCoord; corner: number };

// For a pointy-top hex, corner 0 = north (top), then clockwise:
// 1 = NE, 2 = SE, 3 = S (bottom), 4 = SW, 5 = NW.
// Each corner is shared by 2 neighbor hexes; we list HEX_DIRECTIONS indices.
//   HEX_DIRECTIONS[0] = east neighbor       (q+1, r=0)
//   HEX_DIRECTIONS[1] = north-east neighbor (q+1, r-1)
//   HEX_DIRECTIONS[2] = north-west neighbor (q=0, r-1)
//   HEX_DIRECTIONS[3] = west neighbor       (q-1, r=0)
//   HEX_DIRECTIONS[4] = south-west neighbor (q-1, r+1)
//   HEX_DIRECTIONS[5] = south-east neighbor (q=0, r+1)
const VERTEX_NEIGHBOR_DIRS: ReadonlyArray<readonly [number, number]> = [
  [2, 1], // corner 0 (N):  NW + NE
  [1, 0], // corner 1 (NE): NE + E
  [0, 5], // corner 2 (SE): E  + SE
  [5, 4], // corner 3 (S):  SE + SW
  [4, 3], // corner 4 (SW): SW + W
  [3, 2], // corner 5 (NW): W  + NW
];

function vertexOwners(hex: AxialCoord, corner: number): VertexOwner[] {
  const c = ((corner % 6) + 6) % 6;
  const [d1, d2] = VERTEX_NEIGHBOR_DIRS[c];
  const n1 = neighbor(hex, d1);
  const n2 = neighbor(hex, d2);
  return [
    { coord: hex, corner: c },
    { coord: n1, corner: (c + 2) % 6 },
    { coord: n2, corner: (c + 4) % 6 },
  ];
}

export function edgeId(hex: AxialCoord, side: number): EdgeId {
  const s = ((side % 6) + 6) % 6;
  const n = neighbor(hex, s);
  // Canonical: lex-min hex hosts the edge.
  const ka = hexKey(hex);
  const kb = hexKey(n);
  if (ka <= kb) return `e:${ka}|${kb}`;
  return `e:${kb}|${ka}`;
}

export function hexVertexIds(hex: AxialCoord): VertexId[] {
  return [0, 1, 2, 3, 4, 5].map((c) => vertexId(hex, c));
}

export function hexEdgeIds(hex: AxialCoord): EdgeId[] {
  return [0, 1, 2, 3, 4, 5].map((s) => edgeId(hex, s));
}

// Return the 3 vertex IDs adjacent to a given vertex via its 3 outgoing edges.
// Used by the distance-2 settlement rule.
//
// Each vertex is shared by up to 3 hex-owners. From the perspective of any
// owner hex H, the vertex sits at some corner k of H. The two neighbor
// vertices on H around that corner are corners (k-1) and (k+1). Iterating
// over all 3 owner hexes and collecting their (k-1) and (k+1) corners,
// then deduplicating, yields exactly the 3 adjacent vertices (each
// neighbor is shared by exactly two of the owner hexes, so it appears
// twice — dedupe collapses 6 entries to 3).
export function vertexAdjacentVertices(
  hex: AxialCoord,
  corner: number,
): VertexId[] {
  const self = vertexId(hex, corner);
  const owners = vertexOwners(hex, corner);
  const seen = new Set<VertexId>();
  const out: VertexId[] = [];
  for (const o of owners) {
    for (const dc of [-1, 1]) {
      const k = ((o.corner + dc) % 6 + 6) % 6;
      const id = vertexId(o.coord, k);
      if (id === self) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function vertexEdges(hex: AxialCoord, corner: number): EdgeId[] {
  // The 3 edges incident to a vertex are the union of the two side-edges
  // around it on each of its (up to 3) owner hexes. Iterating all owners and
  // deduping yields exactly 3 edges (each shared edge appears twice).
  const owners = vertexOwners(hex, corner);
  const seen = new Set<EdgeId>();
  const out: EdgeId[] = [];
  for (const o of owners) {
    const sideA = (1 - o.corner + 6) % 6;
    const sideB = (2 - o.corner + 6) % 6;
    for (const s of [sideA, sideB]) {
      const id = edgeId(o.coord, s);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function edgeEndpointVertices(
  hex: AxialCoord,
  side: number,
): VertexId[] {
  // For a pointy-top hex (corners 0=N..5=NW clockwise, sides labeled by their
  // HEX_DIRECTIONS neighbor: 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE):
  //   side 0 (E):  NE (1) ↔ SE (2)
  //   side 1 (NE): N  (0) ↔ NE (1)
  //   side 2 (NW): NW (5) ↔ N  (0)
  //   side 3 (W):  SW (4) ↔ NW (5)
  //   side 4 (SW): S  (3) ↔ SW (4)
  //   side 5 (SE): SE (2) ↔ S  (3)
  // Closed form: side s → corners ((7 - s) % 6) and ((8 - s) % 6).
  const s = ((side % 6) + 6) % 6;
  return [vertexId(hex, (7 - s) % 6), vertexId(hex, (8 - s) % 6)];
}

// Pointy-top: corner 0 = north (top), then clockwise.
// Angles in screen space (with +y down): -90°, -30°, 30°, 90°, 150°, 210°.
// Corners: 0=N, 1=NE, 2=SE, 3=S, 4=SW, 5=NW.
export function hexCornersPx(center: PixelCoord, size: number): PixelCoord[] {
  const corners: PixelCoord[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    corners.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    });
  }
  return corners;
}
