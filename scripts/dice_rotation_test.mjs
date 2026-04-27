// Verify that targetRotationFor(value) actually places the pip-axis for that
// value's face on +y (top). We simulate the rotation manually.

// Layout: px=1, nx=6, py=2, ny=5, pz=3, nz=4
// Each face's outward normal in local space:
const FACE_NORMALS = {
  1: [1, 0, 0], // +x
  6: [-1, 0, 0], // -x
  2: [0, 1, 0], // +y
  5: [0, -1, 0], // -y
  3: [0, 0, 1], // +z
  4: [0, 0, -1], // -z
};

// Apply Euler rotations in order X, Y, Z (Three.js default).
function rotateX([x, y, z], a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}
function rotateY([x, y, z], a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}
function rotateZ([x, y, z], a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, z];
}

function applyEuler(v, [ex, ey, ez]) {
  // Three.js default order = "XYZ": rotate X first, then Y, then Z.
  let r = v;
  r = rotateX(r, ex);
  r = rotateY(r, ey);
  r = rotateZ(r, ez);
  return r;
}

// Match src/games/sunny-harbor/components/DiceModal.tsx
function targetRotationFor(value) {
  switch (value) {
    case 1: return [0, 0, Math.PI / 2];
    case 6: return [0, 0, -Math.PI / 2];
    case 2: return [0, 0, 0];
    case 5: return [Math.PI, 0, 0];
    case 3: return [-Math.PI / 2, 0, 0];
    case 4: return [Math.PI / 2, 0, 0];
    default: return [0, 0, 0];
  }
}

let pass = 0, fail = 0;
for (let v = 1; v <= 6; v++) {
  const euler = targetRotationFor(v);
  const rotated = applyEuler(FACE_NORMALS[v], euler);
  const isUp = Math.abs(rotated[1] - 1) < 0.001 &&
               Math.abs(rotated[0]) < 0.001 &&
               Math.abs(rotated[2]) < 0.001;
  if (isUp) {
    pass++;
    console.log(`✓ value=${v} face normal -> +y after rotation`);
  } else {
    fail++;
    console.log(`✗ value=${v} ended up at`, rotated.map((x) => x.toFixed(3)));
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
