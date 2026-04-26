import { generateBoard } from "../src/game/board";

const sizes = [
  { players: 2, expectedHex: 19 },
  { players: 3, expectedHex: 19 },
  { players: 4, expectedHex: 19 },
  { players: 5, expectedHex: 30 },
  { players: 6, expectedHex: 30 },
  { players: 7, expectedHex: 44 },
  { players: 8, expectedHex: 44 },
];

let pass = 0,
  fail = 0;
for (const { players, expectedHex } of sizes) {
  const board = generateBoard({ playerCount: players, candidates: 5 });
  const ok = board.hexes.length === expectedHex;
  const desertCount = board.hexes.filter((h) => h.terrain === "desert").length;
  const tokenCount = board.hexes.filter((h) => h.numberToken !== null).length;
  const ports = board.ports.length;
  console.log(
    `${ok ? "✓" : "✗"} ${players}p: hexes=${board.hexes.length}/${expectedHex}, desert=${desertCount}, tokens=${tokenCount}, ports=${ports}`,
  );
  if (ok) pass++;
  else fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
