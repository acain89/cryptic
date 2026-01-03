// backend/src/ws/ws.js
import { WebSocketServer } from "ws";

export function initWs({ server, getPublicState }) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  function wsBroadcast(obj) {
    const msg = JSON.stringify(obj);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  }

  function pushState() {
    wsBroadcast({ type: "STATE", payload: getPublicState() });
  }

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "STATE", payload: getPublicState() }));
  });

  return { wss, wsBroadcast, pushState };
}
