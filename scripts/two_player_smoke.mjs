import PartySocket from "partysocket";

const ROOM = "DEMO" + Math.floor(Math.random() * 90 + 10);

function connect(name) {
  const sock = new PartySocket({ host: "127.0.0.1:1999", room: ROOM });
  const ref = { lastSnapshot: null };
  sock.addEventListener("open", () => {
    sock.send(JSON.stringify({ t: "hello", nickname: name }));
  });
  sock.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === "snapshot") ref.lastSnapshot = msg.state;
  });
  return { sock, ref };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const a = connect("Alice");
await wait(400);
const b = connect("Bob");
await wait(800);

const aView = a.ref.lastSnapshot;
const bView = b.ref.lastSnapshot;

const fmt = (v) =>
  v?.players.map((p) => `${p.nickname}${p.isHost ? "(host)" : ""}`).join(", ") ??
  "(none)";

console.log("Room:", ROOM);
console.log("Alice sees:", fmt(aView));
console.log("Bob sees:", fmt(bView));

const ok =
  aView?.players.length === 2 &&
  bView?.players.length === 2 &&
  aView.players[0].nickname === "Alice" &&
  aView.players[0].isHost === true &&
  aView.players[1].nickname === "Bob" &&
  aView.players[1].isHost === false;

console.log(ok ? "PASS" : "FAIL");
a.sock.close();
b.sock.close();
process.exit(ok ? 0 : 1);
