// Verifies vertexEdges(hex, corner): the 3 edges incident to that vertex.
// Ground truth: an edge (h, side) is incident to vertex V iff
// edgeEndpointVertices(h, side) contains V.

import {
  vertexId,
  edgeId,
  hexEdgeIds,
  edgeEndpointVertices,
  vertexEdges,
  spiralOf,
} from "../src/games/sunny-harbor/hex";

const groundHexes = spiralOf({ q: 0, r: 0 }, 4);
const hexes = spiralOf({ q: 0, r: 0 }, 2);

// Build ground-truth: vertex -> Set<edgeId>.
const incident = new Map<string, Set<string>>();
for (const h of groundHexes) {
  for (let s = 0; s < 6; s++) {
    const eId = edgeId(h, s);
    const [a, b] = edgeEndpointVertices(h, s);
    if (!incident.has(a)) incident.set(a, new Set());
    if (!incident.has(b)) incident.set(b, new Set());
    incident.get(a)!.add(eId);
    incident.get(b)!.add(eId);
  }
}

let fails = 0;
let checks = 0;
for (const h of hexes) {
  for (let c = 0; c < 6; c++) {
    const v = vertexId(h, c);
    const expected = incident.get(v) ?? new Set<string>();
    const got = new Set(vertexEdges(h, c));
    checks++;
    let mismatch = got.size !== expected.size;
    for (const e of got) if (!expected.has(e)) mismatch = true;
    if (mismatch) {
      fails++;
      if (fails <= 8) {
        console.log(
          `FAIL hex=(${h.q},${h.r}) corner=${c} v=${v}\n  expected: ${[...expected].join(", ")}\n  got:      ${[...got].join(", ")}`,
        );
      }
    }
  }
}
console.log(`\nChecked ${checks}; ${fails} mismatches.`);
process.exit(fails === 0 ? 0 : 1);
