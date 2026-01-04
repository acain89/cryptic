// backend/src/ws/ws.js
import { WebSocketServer } from "ws";

export function initWs({ server, getPublicState }) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  function wsBroadcast(typeOrObj, payload) {
    const obj =
      typeof typeOrObj === "string"
        ? { type: typeOrObj, payload: payload ?? {} }
        : typeOrObj;

    const msg = JSON.stringify(obj);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  }

  // Optional alias used in some older code
  function broadcast(type, payload) {
    wsBroadcast(type, payload);
  }

  // Always broadcast the current public state in a consistent envelope
  function pushState() {
    wsBroadcast({ type: "STATE", payload: getPublicState() });
  }

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "STATE", payload: getPublicState() }));
  });

  return { wss, wsBroadcast, broadcast, pushState };
}
