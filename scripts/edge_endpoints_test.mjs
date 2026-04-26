// Verify edgeEndpointVertices: side s of hex(0,0) shares the same edge ID with
// neighbor hex's matching side, and its two vertex endpoints match.

const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function hexKey(a) { return `${a.q},${a.r}`; }

const VDIRS = [
  [2, 1], [1, 0], [0, 5], [5, 4], [4, 3], [3, 2],
];

function vertexId(hex, c) {
  const owners = [];
  const [d1, d2] = VDIRS[c];
  owners.push({ coord: hex, corner: c });
  owners.push({ coord: { q: hex.q + HEX_DIRECTIONS[d1].q, r: hex.r + HEX_DIRECTIONS[d1].r }, corner: (c + 2) % 6 });
  owners.push({ coord: { q: hex.q + HEX_DIRECTIONS[d2].q, r: hex.r + HEX_DIRECTIONS[d2].r }, corner: (c + 4) % 6 });
  owners.sort((a, b) => {
    const sa = a.coord.q + a.coord.r, sb = b.coord.q + b.coord.r;
    if (sa !== sb) return sa - sb;
    if (a.coord.q !== b.coord.q) return a.coord.q - b.coord.q;
    return a.coord.r - b.coord.r;
  });
  return `v:${owners[0].coord.q},${owners[0].coord.r}:${owners[0].corner}`;
}

function edgeEndpoints(hex, side) {
  const s = ((side % 6) + 6) % 6;
  return [vertexId(hex, (7 - s) % 6), vertexId(hex, (8 - s) % 6)];
}

let pass = 0, fail = 0;
const A = { q: 0, r: 0 };
for (let s = 0; s < 6; s++) {
  const dir = HEX_DIRECTIONS[s];
  const B = { q: A.q + dir.q, r: A.r + dir.r };
  const epA = edgeEndpoints(A, s).sort();
  // Neighbor's matching side that points back at A:
  const sB = (s + 3) % 6;
  const epB = edgeEndpoints(B, sB).sort();
  const same = epA[0] === epB[0] && epA[1] === epB[1];
  if (same) {
    pass++;
    console.log(`✓ side ${s} (toward ${dir.q},${dir.r}): endpoints match between hex (0,0) and (${B.q},${B.r})`);
    console.log(`   → ${epA.join(' ↔ ')}`);
  } else {
    fail++;
    console.log(`✗ side ${s}: A endpoints=${epA.join(',')} B endpoints=${epB.join(',')}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
