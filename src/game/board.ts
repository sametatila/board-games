import {
  spiralOf,
  hexKey,
  hexEdgeIds,
  axialToPixel,
  edgeEndpointVertices,
} from "./hex";
import { getMapTemplate } from "./mapTemplates";
import type {
  AxialCoord,
  Hex,
  HexTerrain,
  Port,
  PortKind,
  Resource,
} from "./types";

// Resource and token distributions are now derived from the requested hex
// count so 19 / 30 / 44-hex boards each get a balanced set without hand
// curation per board size.

// Pip count: chance dots on each token (the more pips, the higher the probability).
const PIPS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
  8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};

// Build a resource pool of the requested length, preserving classic Catan
// proportions: 4/4/4/3/3/1 (wood/wheat/sheep/brick/ore/desert) per 19 hexes.
function buildResourcePool(count: number): HexTerrain[] {
  // Classic 19-hex base ratios:
  //   wood 4/19  wheat 4/19  sheep 4/19  brick 3/19  ore 3/19  desert 1/19
  const ratios: Array<[HexTerrain, number]> = [
    ["wood", 4 / 19],
    ["wheat", 4 / 19],
    ["sheep", 4 / 19],
    ["brick", 3 / 19],
    ["ore", 3 / 19],
    ["desert", 1 / 19],
  ];
  const out: HexTerrain[] = [];
  // First pass: floor of each ratio so we don't overshoot.
  let placed = 0;
  const fractions: Array<{ kind: HexTerrain; frac: number }> = [];
  for (const [kind, ratio] of ratios) {
    const want = ratio * count;
    const n = Math.floor(want);
    fractions.push({ kind, frac: want - n });
    for (let i = 0; i < n; i++) out.push(kind);
    placed += n;
  }
  // Distribute remaining slots to the kinds with highest leftover fraction.
  fractions.sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (placed < count) {
    out.push(fractions[i % fractions.length].kind);
    placed += 1;
    i += 1;
  }
  return out;
}

// Build a number-token pool of the requested length, scaled from the classic
// 18-token distribution so each board still feels like Catan.
function buildTokenPool(count: number): number[] {
  // Base distribution per 18 tokens:
  //   2:1, 3:2, 4:2, 5:2, 6:2, 8:2, 9:2, 10:2, 11:2, 12:1
  const base: Array<[number, number]> = [
    [2, 1], [3, 2], [4, 2], [5, 2], [6, 2],
    [8, 2], [9, 2], [10, 2], [11, 2], [12, 1],
  ];
  const baseTotal = 18;
  const out: number[] = [];
  let placed = 0;
  const fractions: Array<{ value: number; frac: number }> = [];
  for (const [value, baseCount] of base) {
    const want = (baseCount / baseTotal) * count;
    const n = Math.floor(want);
    fractions.push({ value, frac: want - n });
    for (let i = 0; i < n; i++) out.push(value);
    placed += n;
  }
  fractions.sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (placed < count) {
    out.push(fractions[i % fractions.length].value);
    placed += 1;
    i += 1;
  }
  return out;
}

export type GeneratedBoard = {
  hexes: Hex[];
  ports: Port[];
  robberHexId: string;
};

export type GenerateOptions = {
  playerCount: number;
  seed?: number;
  candidates?: number;
  /** Map template id. Defaults to "classic". */
  mapTemplateId?: import("./types").MapTemplateId;
};

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickCoords(playerCount: number): AxialCoord[] {
  if (playerCount <= 4) return spiralOf({ q: 0, r: 0 }, 2); // 19 hex
  if (playerCount <= 6) return classicExtensionLayout(); // 30 hex
  return largeBoardLayout(); // 44 hex
}

// 5-6 player Catan extension layout: a 3-4-5-6-5-4-3 stretched hexagon = 30 hex.
// Rows are r = -3..3, with row width determined by axial parallelogram bounds.
function classicExtensionLayout(): AxialCoord[] {
  // Row widths from top (r=-3) to bottom (r=3).
  // We want: r=-3 → 3 hex, r=-2 → 4, r=-1 → 5, r=0 → 6, r=1 → 5, r=2 → 4, r=3 → 3.
  const rowsBelowZero = [3, 4, 5];   // r=-3, r=-2, r=-1
  const rowAtZero = 6;                // r=0
  const rowsAboveZero = [5, 4, 3];   // r=1, r=2, r=3
  const out: AxialCoord[] = [];
  // r=-3 .. r=3, computing q range that centers each row roughly on q=0.
  const allRows: { r: number; w: number }[] = [];
  for (let i = 0; i < rowsBelowZero.length; i++) {
    allRows.push({ r: -(rowsBelowZero.length - i), w: rowsBelowZero[i] });
  }
  allRows.push({ r: 0, w: rowAtZero });
  for (let i = 0; i < rowsAboveZero.length; i++) {
    allRows.push({ r: i + 1, w: rowsAboveZero[i] });
  }
  for (const { r, w } of allRows) {
    // Center the row on the axis-corrected center. For pointy-top axial, hex
    // (q, r) sits at world x = sqrt(3) * (q + r/2). We want the row centered
    // around world x=0, so we offset q by -r/2 - (w-1)/2.
    const qStart = -Math.floor((w - 1) / 2) - Math.floor(r / 2);
    for (let i = 0; i < w; i++) {
      out.push({ q: qStart + i, r });
    }
  }
  return out;
}

// 7-8 player layout: ring 2 (19) + ring 3 (18) + extra ring-4 hexes to reach
// 44, kept symmetric so the board stays roughly hexagonal.
function largeBoardLayout(): AxialCoord[] {
  const out: AxialCoord[] = [];
  // Use a 3-4-5-6-7-6-5-4-3 hexagon = 43, then add the center to make 44? No,
  // sum 3+4+5+6+7+6+5+4+3 = 43. We'll widen the middle row by one to 7+1=8
  // to land at 44.
  const widths = [3, 4, 5, 6, 8, 6, 5, 4, 3]; // sum = 44
  const numRows = widths.length;
  const startR = -Math.floor(numRows / 2);
  for (let i = 0; i < numRows; i++) {
    const r = startR + i;
    const w = widths[i];
    const qStart = -Math.floor((w - 1) / 2) - Math.floor(r / 2);
    for (let j = 0; j < w; j++) {
      out.push({ q: qStart + j, r });
    }
  }
  return out;
}

function pickResources(hexCount: number): HexTerrain[] {
  return buildResourcePool(hexCount);
}

function pickTokens(hexCount: number): number[] {
  // One token per non-desert hex. Desert ratio is ~1/19, so subtract estimate.
  const desertEstimate = Math.max(1, Math.round(hexCount / 19));
  return buildTokenPool(hexCount - desertEstimate);
}

// Generate one candidate board: shuffled resources placed on the open land
// slots, shuffled tokens on producing hexes. Forced-terrain slots (sea, fog,
// desert, gold) keep their forced terrain.
function generateCandidate(
  slots: import("./mapTemplates").HexSlot[],
  resources: HexTerrain[],
  tokens: number[],
  rng: () => number,
): Hex[] {
  // Open slots = land slots without a forced terrain AND not hidden under
  // fog. Hidden slots will be revealed later — their terrain is determined
  // at reveal time so we don't bake it in here. Open slots get random
  // resources from the pool.
  const openSlots = slots.filter((s) => !s.forced && !s.hidden);
  const shuffledResources = shuffle(
    resources.slice(0, openSlots.length),
    rng,
  );
  // Pad if we don't have enough.
  while (shuffledResources.length < openSlots.length)
    shuffledResources.push("desert");

  // Ensure the main island gets at least one desert: if the resource pool
  // contains a desert but the random shuffle put it on a non-main slot, swap
  // it onto a main-island slot. The robber starts on the desert by Catan
  // convention; if a multi-island map's only desert lands on a tiny outer
  // isle, the robber would spawn far from where players actually start.
  const mainOpenIndices: number[] = [];
  openSlots.forEach((s, i) => {
    if ((s.islandId ?? "main") === "main") mainOpenIndices.push(i);
  });
  if (mainOpenIndices.length > 0) {
    const mainHasDesert = mainOpenIndices.some(
      (i) => shuffledResources[i] === "desert",
    );
    if (!mainHasDesert) {
      const desertIdx = shuffledResources.findIndex((r) => r === "desert");
      if (desertIdx >= 0) {
        // Swap the off-island desert onto a random main slot.
        const targetIdx =
          mainOpenIndices[Math.floor(rng() * mainOpenIndices.length)];
        const tmp = shuffledResources[targetIdx];
        shuffledResources[targetIdx] = "desert";
        shuffledResources[desertIdx] = tmp;
      }
    }
  }

  const hexes: Hex[] = [];
  // Also gather all "producing" hexes (need a token). That includes both
  // open slots that got resource (not desert), and gold-forced slots, and
  // hidden fog slots once revealed (we still pre-assign tokens so reveal is
  // deterministic). Sea/fog (visible)/desert get no token.
  const producingHexIndices: number[] = [];
  let openIdx = 0;
  let i = 0;
  for (const slot of slots) {
    let terrain: HexTerrain;
    if (slot.hidden) {
      // Visible terrain is "fog" until revealed. The actual underlying
      // terrain is decided at reveal time.
      terrain = "fog";
    } else if (slot.forced) {
      terrain = slot.forced;
    } else {
      terrain = shuffledResources[openIdx++];
    }
    const id = `h:${hexKey(slot.coord)}`;
    const hex: Hex = {
      id,
      coord: slot.coord,
      terrain,
      numberToken: null,
      hidden: slot.hidden,
      islandId: slot.islandId,
    };
    hexes.push(hex);
    if (terrain !== "desert" && terrain !== "sea" && terrain !== "fog") {
      producingHexIndices.push(i);
    }
    i += 1;
  }

  const shuffledTokens = shuffle(tokens, rng);
  let tokenIdx = 0;
  for (const idx of producingHexIndices) {
    if (tokenIdx >= shuffledTokens.length) break;
    hexes[idx].numberToken = shuffledTokens[tokenIdx++];
  }
  return hexes;
}

// Score a candidate: lower = worse. We use weighted penalties.
// Vandevelde-style criteria:
// 1. Same resource adjacent: penalty
// 2. 6/8 adjacent: heavy penalty
// 3. Vertex pip sum > 11: penalty per offending vertex
// 4. Low-pip clustering: penalty
function scoreBoard(hexes: Hex[]): number {
  const byKey = new Map(hexes.map((h) => [hexKey(h.coord), h]));
  let penalty = 0;

  // 1 & 2: hex-adjacency penalties
  for (const h of hexes) {
    for (let dir = 0; dir < 6; dir++) {
      const nbCoord = {
        q: h.coord.q + [1, 1, 0, -1, -1, 0][dir],
        r: h.coord.r + [0, -1, -1, 0, 1, 1][dir],
      };
      const nb = byKey.get(hexKey(nbCoord));
      if (!nb) continue;
      // Only count once per pair
      if (h.id >= nb.id) continue;
      if (h.terrain === nb.terrain && h.terrain !== "sea") penalty += 3;
      const a = h.numberToken;
      const b = nb.numberToken;
      if ((a === 6 || a === 8) && (b === 6 || b === 8)) penalty += 20;
    }
  }

  // 3: vertex pip sum (each vertex shared by 3 hexes; sum pips of those 3)
  // We approximate by iterating over each hex's 6 corners and considering the trio of hexes via owners.
  // Use spiral neighbor lookup.
  const seen = new Set<string>();
  for (const h of hexes) {
    for (let c = 0; c < 6; c++) {
      const dirs: ReadonlyArray<readonly [number, number]> = [
        [2, 1], [1, 0], [0, 5], [5, 4], [4, 3], [3, 2],
      ];
      const [d1, d2] = dirs[c];
      const o = h.coord;
      const trio = [
        o,
        { q: o.q + [1, 1, 0, -1, -1, 0][d1], r: o.r + [0, -1, -1, 0, 1, 1][d1] },
        { q: o.q + [1, 1, 0, -1, -1, 0][d2], r: o.r + [0, -1, -1, 0, 1, 1][d2] },
      ];
      const trioHexes = trio.map((c2) => byKey.get(hexKey(c2))).filter(Boolean) as Hex[];
      if (trioHexes.length < 2) continue; // edge of board
      const key = trioHexes.map((t) => t.id).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const pipSum = trioHexes.reduce(
        (acc, t) => acc + (t.numberToken !== null ? PIPS[t.numberToken] ?? 0 : 0),
        0,
      );
      if (pipSum > 11) penalty += (pipSum - 11) * 4;
    }
  }

  // 4: low-pip clustering (penalize many low-pip tokens adjacent)
  for (const h of hexes) {
    if (h.numberToken === null || PIPS[h.numberToken] > 2) continue;
    for (let dir = 0; dir < 6; dir++) {
      const nbCoord = {
        q: h.coord.q + [1, 1, 0, -1, -1, 0][dir],
        r: h.coord.r + [0, -1, -1, 0, 1, 1][dir],
      };
      const nb = byKey.get(hexKey(nbCoord));
      if (!nb || nb.numberToken === null) continue;
      if (h.id >= nb.id) continue;
      if (PIPS[nb.numberToken] <= 2) penalty += 2;
    }
  }

  return -penalty;
}

function generatePorts(hexes: Hex[], rng: () => number): Port[] {
  // Multi-island maps need per-island port distribution. A single global
  // polar sort around the board centroid puts edges from different islands
  // on similar angles, which makes ports collide on shared vertices.
  // Group land hexes by their islandId, run the perimeter walk per island,
  // then merge the picks. Vertices are tracked across islands so two
  // adjacent islands can never publish ports that share a corner.
  const hexByKey = new Map(hexes.map((h) => [hexKey(h.coord), h] as const));

  // Bucket hexes by island. We treat undefined islandId as "main" so legacy
  // single-island templates keep their old behavior.
  const byIsland: Map<string, Hex[]> = new Map();
  for (const h of hexes) {
    if (h.terrain === "sea" || h.terrain === "fog") continue;
    const id = h.islandId ?? "main";
    if (id.startsWith("fortress_")) continue; // no ports on enemy fortresses
    const list = byIsland.get(id) ?? [];
    list.push(h);
    byIsland.set(id, list);
  }
  if (byIsland.size === 0) return [];

  // Total port budget — same scaling as before but we'll split it across
  // islands proportionally to land area, with a minimum of 1 port per island
  // larger than 2 hexes (tiny 1-2 hex isles get none, they're flavor only).
  const portCount =
    hexes.length <= 19 ? 9 : hexes.length <= 30 ? 11 : 13;

  // Reserve 1 port per eligible island first, then divvy the remainder by
  // land-hex share. This keeps small outer islands ported without starving
  // the main island.
  const eligibleIslands: { id: string; size: number }[] = [];
  for (const [id, list] of byIsland) {
    if (list.length >= 2) eligibleIslands.push({ id, size: list.length });
  }
  if (eligibleIslands.length === 0) return [];

  const totalLand = eligibleIslands.reduce((acc, x) => acc + x.size, 0);
  const allocations = new Map<string, number>();
  let assigned = 0;
  for (const isl of eligibleIslands) {
    allocations.set(isl.id, 1);
    assigned += 1;
  }
  // Distribute the remainder by share.
  const remaining = Math.max(0, portCount - assigned);
  for (const isl of eligibleIslands) {
    const extra = Math.round((remaining * isl.size) / totalLand);
    allocations.set(isl.id, (allocations.get(isl.id) ?? 0) + extra);
  }

  // Vertices already used by any port — shared across islands so two
  // islands sitting close together can't put ports on the same corner.
  const usedVertices = new Set<string>();
  const allEdges: { edgeId: string }[] = [];

  for (const isl of eligibleIslands) {
    const islandHexes = byIsland.get(isl.id)!;
    const islandHexIds = new Set(islandHexes.map((h) => h.id));
    const target = allocations.get(isl.id) ?? 0;
    if (target <= 0) continue;

    // Centroid of THIS island only — gives stable polar ordering for its
    // perimeter even when other islands sit nearby.
    let cx = 0, cz = 0;
    for (const h of islandHexes) {
      const px = axialToPixel(h.coord, 1);
      cx += px.x;
      cz += px.y;
    }
    cx /= islandHexes.length;
    cz /= islandHexes.length;

    // Coastal edges of THIS island. An edge is coastal when its outside
    // neighbor is missing or water, OR belongs to a different island.
    const boundary: {
      edgeId: string;
      angle: number;
      vertices: string[];
    }[] = [];
    for (const h of islandHexes) {
      for (let s = 0; s < 6; s++) {
        const nb = {
          q: h.coord.q + [1, 1, 0, -1, -1, 0][s],
          r: h.coord.r + [0, -1, -1, 0, 1, 1][s],
        };
        const nbHex = hexByKey.get(hexKey(nb));
        const sameIsland = nbHex && islandHexIds.has(nbHex.id);
        if (sameIsland) continue; // interior edge
        const eId = hexEdgeIds(h.coord)[s];
        const hexPx = axialToPixel(h.coord, 1);
        const nbPx = axialToPixel(nb, 1);
        const mx = (hexPx.x + nbPx.x) / 2;
        const mz = (hexPx.y + nbPx.y) / 2;
        const angle = Math.atan2(mz - cz, mx - cx);
        const vs = edgeEndpointVertices(h.coord, s);
        boundary.push({ edgeId: eId, angle, vertices: [vs[0], vs[1]] });
      }
    }
    if (boundary.length === 0) continue;
    boundary.sort((a, b) => a.angle - b.angle);

    // Even stride along this island's perimeter, with a random start
    // offset for variety. Skip an edge if either of its vertices was
    // already taken by a previous port (on this or another island).
    const want = Math.min(target, Math.floor(boundary.length / 2));
    if (want <= 0) continue;
    const baseStride = boundary.length / want;
    const startOffset = Math.floor(rng() * boundary.length);
    let placed = 0;
    let attempts = 0;
    while (placed < want && attempts < boundary.length * 2) {
      const idx =
        (startOffset + Math.round(placed * baseStride) + attempts) %
        boundary.length;
      const e = boundary[idx];
      const conflict =
        usedVertices.has(e.vertices[0]) || usedVertices.has(e.vertices[1]);
      if (!conflict) {
        usedVertices.add(e.vertices[0]);
        usedVertices.add(e.vertices[1]);
        allEdges.push({ edgeId: e.edgeId });
        placed += 1;
        attempts = 0;
      } else {
        attempts += 1;
      }
    }
  }

  if (allEdges.length === 0) return [];

  // Port kinds: 4-5 generic 3:1, plus 1 of each resource 2:1, scaled up.
  const kinds: PortKind[] = [
    "wood", "brick", "wheat", "sheep", "ore",
    "any", "any", "any", "any",
  ];
  while (kinds.length < allEdges.length) kinds.push("any");
  const shuffled = shuffle(kinds.slice(0, allEdges.length), rng);

  return allEdges.map((p, i) => ({
    edgeId: p.edgeId,
    kind: shuffled[i],
    ratio: shuffled[i] === "any" ? 3 : 2,
  }));
}

export function generateBoard(opts: GenerateOptions): GeneratedBoard {
  const candidates = opts.candidates ?? 200;
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = makeRng(seed);

  // Pull the slot list from the requested map template, or fall back to a
  // straight classic layout if the id is unknown.
  const template = getMapTemplate(opts.mapTemplateId ?? "classic");
  const slots = template.buildSlots(opts.playerCount);

  // The number of "open" land slots (not forced sea/desert/gold/fog) decides
  // how big our resource pool needs to be. Tokens go on every land hex that
  // can produce (open + gold + fog).
  const openSlotCount = slots.filter((s) => !s.forced).length;
  const producingCount = slots.filter(
    (s) => s.forced !== "sea" && s.forced !== "desert",
  ).length;
  const resources = pickResources(openSlotCount);
  const tokens = pickTokens(producingCount + 1); // +1 buffer so we always have enough

  let best: Hex[] | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates; i++) {
    const cand = generateCandidate(slots, resources, tokens, rng);
    const score = scoreBoard(cand);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  if (!best) throw new Error("No candidate generated");

  const ports = generatePorts(best, rng);
  // Prefer a desert on the main island for the robber; fall back to any desert
  // (or, last resort, the first land hex on the main island).
  const mainDesert = best.find(
    (h) => h.terrain === "desert" && h.islandId === "main",
  );
  const anyDesert = best.find((h) => h.terrain === "desert");
  const mainLand = best.find(
    (h) =>
      h.islandId === "main" &&
      h.terrain !== "sea" &&
      h.terrain !== "fog",
  );
  const robberHexId = (mainDesert ?? anyDesert ?? mainLand ?? best[0]).id;

  return { hexes: best, ports, robberHexId };
}

export type ResourceProductionMap = Map<string, { hexId: string; resource: Resource }[]>;

// Build a lookup: vertexId -> list of (hexId, resource) producing for that vertex.
// Used during resource distribution after a dice roll.
export function buildVertexProductionIndex(
  hexes: Hex[],
  vertexIdsByHex: Map<string, string[]>,
): Map<string, { hexId: string; resource: Resource; numberToken: number }[]> {
  const idx = new Map<string, { hexId: string; resource: Resource; numberToken: number }[]>();
  for (const h of hexes) {
    if (h.numberToken === null) continue;
    const r = h.terrain;
    if (
      r === "desert" ||
      r === "sea" ||
      r === "fog" ||
      r === "gold"
    )
      continue;
    const verts = vertexIdsByHex.get(h.id) ?? [];
    for (const v of verts) {
      const list = idx.get(v) ?? [];
      list.push({ hexId: h.id, resource: r as Resource, numberToken: h.numberToken });
      idx.set(v, list);
    }
  }
  return idx;
}
