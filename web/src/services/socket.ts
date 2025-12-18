import { WS_URL } from '../config';

let socket: WebSocket | null = null;
const listeners: Set<(data: any) => void> = new Set();
let pendingQueue: string[] = [];

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  console.log('Connecting to WS:', WS_URL);
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log('WS Connected');
    // Flush pending
    while (pendingQueue.length > 0) {
      const msg = pendingQueue.shift();
      if (msg) socket?.send(msg);
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      listeners.forEach(l => l(data));
    } catch (e) {
      console.error('WS Parse Error', e);
    }
  };

  socket.onclose = () => {
    console.log('WS Closed, retrying in 3s...');
    socket = null;
    setTimeout(connect, 3000);
  };

  socket.onerror = (err) => {
    console.error('WS Error', err);
  };
}

export const SocketService = {
  connect,
  send(data: any) {
    const msg = JSON.stringify(data);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
    } else {
      pendingQueue.push(msg);
      if (!socket) connect();
    }
  },
  subscribe(cb: (data: any) => void) {
    listeners.add(cb);
    if (!socket) connect();
    return () => listeners.delete(cb);
  }
};
