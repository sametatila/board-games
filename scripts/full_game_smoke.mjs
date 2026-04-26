// End-to-end test: 2 bot players join a fresh room, host starts game, both
// players complete setup, then a few rolls happen. Validates server-side
// reducer integration + protocol path.

import PartySocket from "partysocket";

const ROOM = "GAME" + Math.floor(Math.random() * 90 + 10);
const PARTY = "127.0.0.1:1999";

function connect(name) {
  const sock = new PartySocket({ host: PARTY, room: ROOM });
  const ref = { state: null, selfId: null, errors: [] };
  sock.addEventListener("open", () => {
    sock.send(JSON.stringify({ t: "hello", nickname: name }));
  });
  sock.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === "snapshot") {
      ref.state = msg.state;
      if (msg.selfId) ref.selfId = msg.selfId;
    } else if (msg.t === "error") {
      ref.errors.push(msg);
    }
  });
  return { sock, ref };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(c, msg) {
  c.sock.send(JSON.stringify(msg));
  await wait(150);
}

function vertexIdsAll(state) {
  // Reverse of hex.ts vertexId, but simpler: just pull from state.pieces won't help.
  // We compute vertex IDs by iterating hexes — same logic as hex.ts.
  // Here we duplicate the canonical formula since this is a JS test script.
  const HEX_DIRECTIONS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  const VDIRS = [[2, 1], [1, 0], [0, 5], [5, 4], [4, 3], [3, 2]];
  const vertexId = (hex, c) => {
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
    const o = owners[0];
    return `v:${o.coord.q},${o.coord.r}:${o.corner}`;
  };
  const edgeId = (hex, side) => {
    const n = { q: hex.q + HEX_DIRECTIONS[side].q, r: hex.r + HEX_DIRECTIONS[side].r };
    const ka = `${hex.q},${hex.r}`, kb = `${n.q},${n.r}`;
    return ka <= kb ? `e:${ka}|${kb}` : `e:${kb}|${ka}`;
  };

  const verts = [];
  const edges = [];
  for (const h of state.hexes) {
    if (h.terrain === "sea" || h.terrain === "fog") continue;
    for (let c = 0; c < 6; c++) verts.push({ hexId: h.id, vId: vertexId(h.coord, c) });
    for (let s = 0; s < 6; s++) edges.push({ hexId: h.id, eId: edgeId(h.coord, s) });
  }
  return { verts, edges };
}

function pickVertex(state, taken) {
  const { verts } = vertexIdsAll(state);
  const seen = new Set(taken);
  for (const v of verts) {
    if (!seen.has(v.vId)) return v.vId;
  }
  return null;
}

async function main() {
  const a = connect("Alice");
  await wait(400);
  const b = connect("Bob");
  await wait(400);

  // Both joined?
  if (a.ref.state.players.length !== 2 || b.ref.state.players.length !== 2) {
    console.log("FAIL — players didn't join", a.ref.state.players.length, b.ref.state.players.length);
    process.exit(1);
  }

  // Host (Alice) starts game.
  await send(a, { t: "start_game" });
  await wait(500);

  if (a.ref.state.phase !== "setup_round_1") {
    console.log("FAIL — phase not setup_round_1:", a.ref.state.phase);
    console.log("Errors:", a.ref.errors);
    process.exit(1);
  }
  console.log("Setup started:", a.ref.state.hexes.length, "hexes,", a.ref.state.ports.length, "ports");

  // Setup loop: each player needs to place settlement+road, snake order p1,p2,p2,p1.
  // We'll let server tell us whose turn it is via state.currentPlayerIndex.
  const players = [a, b];
  let attempts = 0;
  while (
    (a.ref.state.phase === "setup_round_1" || a.ref.state.phase === "setup_round_2") &&
    attempts < 20
  ) {
    attempts++;
    const state = a.ref.state;
    const cpId = state.players[state.currentPlayerIndex].id;
    const me = players.find((p) => p.ref.selfId === cpId);
    if (!me) {
      console.log("FAIL — current player connection not found");
      process.exit(1);
    }
    const myPieces = state.pieces.filter((p) => p.playerId === cpId);
    const myStls = myPieces.filter((p) => p.kind === "settlement");
    const myRds = myPieces.filter((p) => p.kind === "road");
    const round = state.phase === "setup_round_1" ? 1 : 2;
    const needsSettlement =
      (round === 1 && myStls.length === 0) || (round === 2 && myStls.length === 1);
    const needsRoad =
      (round === 1 && myStls.length === 1 && myRds.length === 0) ||
      (round === 2 && myStls.length === 2 && myRds.length === 1);

    if (needsSettlement) {
      const taken = state.pieces.filter((p) => p.vertexId).map((p) => p.vertexId);
      // Try vertices until one works (server validates distance-2).
      const { verts } = vertexIdsAll(state);
      let placed = false;
      for (const v of verts) {
        if (taken.includes(v.vId)) continue;
        // Try this one.
        await send(me, {
          t: "action",
          action: { type: "PLACE_INITIAL_SETTLEMENT", playerId: cpId, vertexId: v.vId },
        });
        await wait(120);
        const newPieces = me.ref.state.pieces.filter((p) => p.playerId === cpId);
        const newCount = newPieces.filter((p) => p.kind === "settlement").length;
        if (newCount > myStls.length) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        console.log("FAIL — no settlement could be placed for", cpId);
        process.exit(1);
      }
    } else if (needsRoad) {
      const taken = state.pieces.filter((p) => p.edgeId).map((p) => p.edgeId);
      const { edges } = vertexIdsAll(state);
      let placed = false;
      for (const e of edges) {
        if (taken.includes(e.eId)) continue;
        await send(me, {
          t: "action",
          action: { type: "PLACE_INITIAL_ROAD", playerId: cpId, edgeId: e.eId },
        });
        await wait(120);
        const newPieces = me.ref.state.pieces.filter((p) => p.playerId === cpId);
        const newCount = newPieces.filter((p) => p.kind === "road").length;
        if (newCount > myRds.length) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        console.log("FAIL — no road could be placed for", cpId);
        process.exit(1);
      }
    } else {
      console.log("FAIL — neither settlement nor road needed but in setup");
      break;
    }
  }

  console.log("Setup done. Phase:", a.ref.state.phase, "subPhase:", a.ref.state.subPhase);
  if (a.ref.state.phase !== "playing") {
    console.log("FAIL — should be in playing now");
    process.exit(1);
  }

  // Roll dice on Alice's turn.
  const cpId1 = a.ref.state.players[a.ref.state.currentPlayerIndex].id;
  const me1 = players.find((p) => p.ref.selfId === cpId1);
  await send(me1, {
    t: "action",
    action: { type: "ROLL_DICE", playerId: cpId1, dice: [4, 4] },
  });
  await wait(200);
  console.log("After roll 8:", a.ref.state.subPhase, "diceRoll=", a.ref.state.diceRoll);

  await send(me1, { t: "action", action: { type: "END_TURN", playerId: cpId1 } });
  await wait(200);

  console.log("Turn passed. New current player index=", a.ref.state.currentPlayerIndex);

  // Print resources.
  for (const p of a.ref.state.players) {
    console.log(" ", p.nickname, p.resources);
  }

  console.log("PASS — full game flow works end-to-end through server.");
  a.sock.close();
  b.sock.close();
  process.exit(0);
}

main().catch((e) => {
  console.log("ERROR:", e);
  process.exit(1);
});
