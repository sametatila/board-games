// Pointy-top: hex(0,0).corner[1] (NE) should equal hex(1,0).corner[5] (NW),
// and hex(0,0).corner[2] (SE) should equal hex(1,0).corner[4] (SW).
// (They share the east-facing edge between them.)

const SIZE = 1;

function axialToPixel(q, r) {
  return {
    x: SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
    y: SIZE * (3 / 2) * r,
  };
}

function corners(cx, cy) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    out.push({ x: cx + SIZE * Math.cos(a), y: cy + SIZE * Math.sin(a) });
  }
  return out;
}

const A = axialToPixel(0, 0);
const B = axialToPixel(1, 0);

console.log("Hex (0,0) center:", A);
console.log("Hex (1,0) center:", B, "distance:", Math.hypot(B.x - A.x, B.y - A.y).toFixed(4));
console.log("Expected center distance for pointy-top sharing an edge:", Math.sqrt(3).toFixed(4));

const c0 = corners(A.x, A.y);
const c1 = corners(B.x, B.y);

console.log("\n(0,0).corner[1] (NE):", c0[1], "  (1,0).corner[5] (NW):", c1[5]);
const m1 = Math.abs(c0[1].x - c1[5].x) < 0.001 && Math.abs(c0[1].y - c1[5].y) < 0.001;
console.log("Match?", m1);

console.log("\n(0,0).corner[2] (SE):", c0[2], "  (1,0).corner[4] (SW):", c1[4]);
const m2 = Math.abs(c0[2].x - c1[4].x) < 0.001 && Math.abs(c0[2].y - c1[4].y) < 0.001;
console.log("Match?", m2);

console.log("\nCorner 0 (N) should be straight above center: x≈0, y≈-1");
console.log("(0,0).corner[0]:", c0[0]);

process.exit(m1 && m2 ? 0 : 1);
