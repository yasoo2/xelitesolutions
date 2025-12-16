"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachWebSocket = attachWebSocket;
exports.broadcast = broadcast;
const ws_1 = require("ws");
let wssRef = null;
function attachWebSocket(server) {
    const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
    wssRef = wss;
    wss.on('connection', (socket) => {
        socket.send(JSON.stringify({ type: 'hello', data: { ts: Date.now() } }));
        socket.on('message', (msg) => {
            try {
                const data = JSON.parse(msg.toString());
                // Echo back for now to verify streaming path
                socket.send(JSON.stringify({ type: 'step_progress', data: { echo: data, ts: Date.now() } }));
            }
            catch {
                socket.send(JSON.stringify({ type: 'step_failed', data: { reason: 'invalid_json' } }));
            }
        });
    });
    return wss;
}
function broadcast(event) {
    if (!wssRef)
        return;
    const payload = JSON.stringify(event);
    wssRef.clients.forEach((client) => {
        try {
            client.send(payload);
        }
        catch { }
    });
}
