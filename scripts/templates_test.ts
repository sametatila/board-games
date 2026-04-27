import { generateBoard } from "../src/games/sunny-harbor/board";
import { MAP_TEMPLATES } from "../src/games/sunny-harbor/mapTemplates";
import type { MapTemplateId } from "../src/games/sunny-harbor/types";

const ids = Object.keys(MAP_TEMPLATES) as MapTemplateId[];
let pass = 0;
let fail = 0;

for (const id of ids) {
  for (const players of [3, 5, 7]) {
    try {
      const board = generateBoard({
        playerCount: players,
        mapTemplateId: id,
        candidates: 5,
      });
      const land = board.hexes.filter(
        (h) => h.terrain !== "sea" && h.terrain !== "fog",
      ).length;
      const sea = board.hexes.filter((h) => h.terrain === "sea").length;
      const fog = board.hexes.filter((h) => h.terrain === "fog").length;
      const gold = board.hexes.filter((h) => h.terrain === "gold").length;
      const desert = board.hexes.filter((h) => h.terrain === "desert").length;
      const tokens = board.hexes.filter((h) => h.numberToken !== null).length;
      const islandsSet = new Set(
        board.hexes
          .filter((h) => h.terrain !== "sea" && h.terrain !== "fog")
          .map((h) => h.islandId ?? "?"),
      );
      console.log(
        `✓ ${id} ${players}p: hex=${board.hexes.length} land=${land} sea=${sea} fog=${fog} gold=${gold} desert=${desert} tokens=${tokens} ports=${board.ports.length} islands=${[...islandsSet].join(",")}`,
      );
      pass++;
    } catch (e) {
      console.log(`✗ ${id} ${players}p: ${(e as Error).message}`);
      fail++;
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
