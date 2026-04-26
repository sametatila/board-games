import PartySocket from "partysocket";

const socket = new PartySocket({
  host: "127.0.0.1:1999",
  room: "TEST01",
});

let snapshotsSeen = 0;

socket.addEventListener("open", () => {
  console.log("[client] open");
  socket.send(JSON.stringify({ t: "hello", nickname: "Tester" }));
});

socket.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.t === "snapshot") {
    snapshotsSeen += 1;
    console.log(
      `[client] snapshot #${snapshotsSeen}: ${msg.state.players.length} players, phase=${msg.state.phase}, selfId=${msg.selfId || "(broadcast)"}`,
    );
    if (snapshotsSeen >= 2) {
      console.log("[client] PASS — hello flow worked end-to-end");
      socket.close();
      process.exit(0);
    }
  } else if (msg.t === "patch") {
    console.log("[client] patch:", JSON.stringify(msg.events));
  } else if (msg.t === "error") {
    console.log("[client] server error:", msg.code, msg.message);
  }
});

socket.addEventListener("error", (e) => {
  console.log("[client] socket error:", e?.message ?? "(no message)");
});

setTimeout(() => {
  console.log("[client] FAIL — timeout, snapshotsSeen=" + snapshotsSeen);
  process.exit(2);
}, 8000);
