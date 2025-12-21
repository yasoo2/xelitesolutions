import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import { config } from '../config';

const API = process.env.API_URL || 'http://localhost:8080';

async function assertUnauthorized(url: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (res.status !== 401) {
    const t = await res.text().catch(() => '');
    throw new Error(`Expected 401 without JWT, got ${res.status} ${t}`);
  }
}

async function waitForBrowserFrames(wsUrl: string, timeoutMs: number) {
  const ws = new WebSocket(wsUrl);
  return await new Promise<{ frames: number }>((resolve, reject) => {
    const startedAt = Date.now();
    let frames = 0;
    const timer = setInterval(() => {
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        try { ws.close(); } catch {}
        reject(new Error(`Timed out waiting for frames. frames=${frames}`));
      }
    }, 50);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg && msg.type === 'frame' && msg.jpegBase64) {
          frames += 1;
          if (frames >= 2) {
            clearInterval(timer);
            try { ws.close(); } catch {}
            resolve({ frames });
          }
        }
      } catch {}
    });
    ws.on('error', (e) => {
      clearInterval(timer);
      reject(e);
    });
  });
}

async function main() {
  console.log('Testing Browser Worker via Core Tools...');
  
  const token = jwt.sign({ sub: 'tester', role: 'OWNER' }, config.jwtSecret);
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  
  await assertUnauthorized(`${API}/tools/browser_open/execute`);
  console.log('✅ JWT required for /tools/:name/execute');

  const res1 = await fetch(`${API}/tools/browser_open/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url: 'https://example.com', viewport: { width: 1280, height: 800 } })
  });
  const j1 = await res1.json();
  if (!j1?.ok || !j1?.output?.sessionId || !j1?.output?.wsUrl) {
    throw new Error(`browser_open failed: ${JSON.stringify(j1)}`);
  }
  const { sessionId, wsUrl } = j1.output;
  console.log(`✅ browser_open ok sessionId=${sessionId}`);
  console.log(`✅ wsUrl=${wsUrl}`);

  const stream = await waitForBrowserFrames(String(wsUrl), 15000);
  console.log(`✅ stream ok frames=${stream.frames}`);

  const res2 = await fetch(`${API}/tools/browser_get_state/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId })
  });
  const j2 = await res2.json();
  if (!j2?.ok || !j2?.output) {
    throw new Error(`browser_get_state failed: ${JSON.stringify(j2)}`);
  }
  const domLen = String(j2.output?.dom || '').length;
  const hasA11y = !!j2.output?.a11y;
  const hasShot = !!j2.output?.screenshot;
  console.log(`✅ browser_get_state ok domLen=${domLen} a11y=${hasA11y} screenshot=${hasShot}`);

  const res3 = await fetch(`${API}/tools/browser_run/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId,
      actions: [
        { type: 'scroll', x: 0, y: 800 },
        { type: 'wait', ms: 500 },
        { type: 'screenshot', fullPage: false }
      ]
    })
  });
  const j3 = await res3.json();
  if (!j3?.ok) {
    throw new Error(`browser_run failed: ${JSON.stringify(j3)}`);
  }
  console.log('✅ browser_run ok');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
