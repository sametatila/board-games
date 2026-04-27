// Verifies that vertexAdjacentVertices(hex, corner) returns EXACTLY the
// 3 vertices that share an edge with (hex, corner) — no more, no less.
//
// Strategy: build adjacency from edges (ground truth). For each hex+corner,
// compare against vertexAdjacentVertices output.

import {
  vertexId,
  hexVertexIds,
  hexEdgeIds,
  edgeEndpointVertices,
  vertexAdjacentVertices,
  spiralOf,
} from "../src/games/sunny-harbor/hex";

const center = { q: 0, r: 0 };
// Use a slightly larger board for ground-truth, but only check vertices that
// exist on the inner board so every ground-truth adjacency is reachable.
const groundHexes = spiralOf(center, 4);
const hexes = spiralOf(center, 2);

// Ground-truth adjacency: vertex -> Set<vertex> via edges.
const adj = new Map<string, Set<string>>();
for (const h of groundHexes) {
  for (let s = 0; s < 6; s++) {
    const [a, b] = edgeEndpointVertices(h, s);
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
}

let fails = 0;
let checks = 0;
for (const h of hexes) {
  for (let c = 0; c < 6; c++) {
    const v = vertexId(h, c);
    const expected = adj.get(v) ?? new Set<string>();
    const got = new Set(vertexAdjacentVertices(h, c));
    checks++;
    // Expected size from interior vertex = 3, edge of board can be < 3.
    // Check: got ⊆ expected AND |got ∩ expected| matches.
    let mismatch = false;
    if (got.size !== expected.size) mismatch = true;
    for (const x of got) if (!expected.has(x)) mismatch = true;
    if (mismatch) {
      fails++;
      if (fails <= 10) {
        console.log(
          `FAIL hex=(${h.q},${h.r}) corner=${c} v=${v}\n  expected: ${[...expected].join(", ")}\n  got:      ${[...got].join(", ")}`,
        );
      }
    }
  }
}

console.log(`\nChecked ${checks} (hex,corner) pairs; ${fails} mismatches.`);
process.exit(fails === 0 ? 0 : 1);
