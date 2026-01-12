import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const API_PORT = Number(process.env.API_PORT || process.env.PORT || config.port || 3000);
const API_URL = process.env.API_URL || `http://localhost:${API_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || config.jwtSecret;

type WsMsg =
  | { type: 'stream_frame'; ts: number; jpegBase64: string }
  | { type: 'final_report'; ts: number; ok: boolean; summary: string }
  | { type: string; [k: string]: any };

async function main() {
  const sessionId = `e2e-${Date.now()}`;
  const token = jwt.sign({ sub: 'test-user', role: 'OWNER' }, JWT_SECRET);

  const wsUrl = `ws://localhost:${API_PORT}/ws/browser?sessionId=${encodeURIComponent(sessionId)}`;
  const ws = new WebSocket(wsUrl);

  let frames = 0;
  let final: { ok: boolean; summary: string } | null = null;

  const wsReady = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws_connect_timeout')), 8000);
    ws.on('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });

  ws.on('message', (data) => {
    let msg: WsMsg | null = null;
    try {
      msg = JSON.parse(String(data || ''));
    } catch {
      msg = null;
    }
    if (!msg) return;
    if (msg.type === 'stream_frame') frames += 1;
    if (msg.type === 'final_report') final = { ok: Boolean((msg as any).ok), summary: String((msg as any).summary || '') };
  });

  await wsReady;

  const res = await fetch(`${API_URL}/api/browser/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sessionId,
      actions: [
        { type: 'goto', url: 'https://example.com' },
        { type: 'assert', text: 'Example Domain' },
      ],
    }),
  });

  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`HTTP failed: ${res.status} ${raw}`);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    if (final) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  try { ws.close(); } catch {}

  if (!final) throw new Error(`No final_report received (frames=${frames})`);
  const finalReport = final as { ok: boolean; summary: string };

  if (!finalReport.ok) throw new Error(`final_report not ok (frames=${frames}) summary=${finalReport.summary}`);
  if (frames < 1) throw new Error('No frames received');

  console.log('✅ Browser HTTP+WS OK', { frames, summary: finalReport.summary });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
