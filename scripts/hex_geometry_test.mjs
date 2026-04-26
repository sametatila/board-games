// Quick geometry sanity tests for hex.ts
// Run: node --experimental-strip-types scripts/hex_geometry_test.mjs
// Or compile first; but we'll inline the JS port of hex.ts to avoid TS deps.

// We re-export tested logic via dynamic import of the compiled tsc output if available,
// but the easiest is to use ts-node-style compiled. For Faz 3 we'll just import via tsx if installed.

// Simple pure-JS port of the relevant bits — kept in sync manually.

const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function neighbor(a, dir) {
  const d = HEX_DIRECTIONS[((dir % 6) + 6) % 6];
  return { q: a.q + d.q, r: a.r + d.r };
}

function hexKey(a) {
  return `${a.q},${a.r}`;
}

const VDIRS = [
  [2, 1],
  [1, 0],
  [0, 5],
  [5, 4],
  [4, 3],
  [3, 2],
];

function vertexOwners(hex, corner) {
  const c = ((corner % 6) + 6) % 6;
  const [d1, d2] = VDIRS[c];
  return [
    { coord: hex, corner: c },
    { coord: neighbor(hex, d1), corner: (c + 2) % 6 },
    { coord: neighbor(hex, d2), corner: (c + 4) % 6 },
  ];
}

function vertexId(hex, corner) {
  const owners = vertexOwners(hex, corner);
  owners.sort((a, b) => {
    const sa = a.coord.q + a.coord.r;
    const sb = b.coord.q + b.coord.r;
    if (sa !== sb) return sa - sb;
    if (a.coord.q !== b.coord.q) return a.coord.q - b.coord.q;
    return a.coord.r - b.coord.r;
  });
  const o = owners[0];
  return `v:${o.coord.q},${o.coord.r}:${o.corner}`;
}

function edgeId(hex, side) {
  const s = ((side % 6) + 6) % 6;
  const n = neighbor(hex, s);
  const ka = hexKey(hex);
  const kb = hexKey(n);
  return ka <= kb ? `e:${ka}|${kb}` : `e:${kb}|${ka}`;
}

let passed = 0;
let failed = 0;
function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}  ${detail}`);
  }
}

// Test 1: Each vertex shared by 3 hexes maps to the same canonical ID
console.log("Test: vertex canonical sharing");
{
  const center = { q: 0, r: 0 };
  for (let c = 0; c < 6; c++) {
    const owners = vertexOwners(center, c);
    const ids = owners.map((o) => vertexId(o.coord, o.corner));
    const allEqual = ids.every((id) => id === ids[0]);
    assert(`corner ${c} shared id`, allEqual, JSON.stringify(ids));
  }
}

// Test 2: Edge canonical
console.log("Test: edge canonical sharing");
{
  const center = { q: 0, r: 0 };
  for (let s = 0; s < 6; s++) {
    const idA = edgeId(center, s);
    const nb = neighbor(center, s);
    const idB = edgeId(nb, (s + 3) % 6);
    assert(`side ${s}`, idA === idB, `${idA} vs ${idB}`);
  }
}

// Test 3: Each hex has exactly 6 distinct vertices
console.log("Test: hex has 6 distinct vertices");
{
  const center = { q: 0, r: 0 };
  const ids = new Set();
  for (let c = 0; c < 6; c++) ids.add(vertexId(center, c));
  assert("6 distinct", ids.size === 6, `got ${ids.size}`);
}

// Test 4: Each hex has exactly 6 distinct edges
console.log("Test: hex has 6 distinct edges");
{
  const center = { q: 0, r: 0 };
  const ids = new Set();
  for (let s = 0; s < 6; s++) ids.add(edgeId(center, s));
  assert("6 distinct", ids.size === 6, `got ${ids.size}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
