
const WebSocket = require('ws');

const WORKER_URL = process.env.BROWSER_WORKER_URL || 'http://localhost:7070';
const API_KEY = process.env.BROWSER_WORKER_KEY || 'change-me';

function buildWsUrl(workerBase, workerWsUrl, key) {
  const u = new URL(String(workerWsUrl), workerBase);
  if (!u.searchParams.get('key')) u.searchParams.set('key', key);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}

async function waitForFrames(wsUrl, timeoutMs) {
  const ws = new WebSocket(wsUrl);
  return await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let frames = 0;
    let lastFrameAt = 0;

    const t = setInterval(() => {
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(t);
        try { ws.close(); } catch {}
        reject(new Error(`Timed out waiting for frames. frames=${frames}`));
      }
    }, 50);

    ws.on('open', () => {});
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg && msg.type === 'frame' && msg.jpegBase64) {
          frames += 1;
          lastFrameAt = Date.now();
          if (frames >= 2) {
            clearInterval(t);
            try { ws.close(); } catch {}
            resolve({ frames, lastFrameAt });
          }
        }
      } catch {}
    });
    ws.on('error', (err) => {
      clearInterval(t);
      reject(err);
    });
  });
}

async function runTest() {
  console.log('🚀 Starting Deep Browser Test...');
  console.log(`Connecting to worker at ${WORKER_URL}...`);

  try {
    // 1. Create Session
    console.log('1. Creating Session...');
    const createRes = await fetch(`${WORKER_URL}/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-key': API_KEY },
      body: JSON.stringify({ viewport: { width: 1280, height: 800 } })
    });
    
    if (!createRes.ok) {
        const txt = await createRes.text();
        throw new Error(`Failed to create session: ${createRes.status} - ${txt}`);
    }

    const sessionData = await createRes.json();
    const sessionId = sessionData.sessionId;
    const wsUrl = sessionData.wsUrl;
    console.log(`✅ Session Created: ${sessionId}`);
    console.log(`✅ WS URL: ${wsUrl}`);

    // 1b. Verify WebSocket stream produces frames
    console.log('1b. Verifying WebSocket stream...');
    const fullWsUrl = buildWsUrl(WORKER_URL, wsUrl, API_KEY);
    console.log(`WS Connect: ${fullWsUrl}`);
    const streamRes = await waitForFrames(fullWsUrl, 10000);
    console.log(`✅ Stream OK. frames=${streamRes.frames}`);

    // 2. Run Actions (Google Search Flow)
    console.log('2. Running Actions (Google Search)...');
    const actions = [
      { type: 'goto', url: 'https://www.google.com', waitUntil: 'domcontentloaded' },
      { type: 'type', text: 'XELITE Solutions', delay: 100 },
      { type: 'press', key: 'Enter' },
      { type: 'screenshot', fullPage: false }
    ];

    const runRes = await fetch(`${WORKER_URL}/session/${sessionId}/job/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-key': API_KEY },
      body: JSON.stringify({ actions })
    });

    if (!runRes.ok) {
        const txt = await runRes.text();
        throw new Error(`Failed to run actions: ${runRes.status} - ${txt}`);
    }
    
    const runData = await runRes.json();
    console.log('✅ Actions completed.');
    console.log('Result:', JSON.stringify(runData, null, 2));

    // 3. Snapshot
    console.log('3. Capturing snapshot...');
    const snapRes = await fetch(`${WORKER_URL}/session/${sessionId}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-key': API_KEY }
    });
    if (!snapRes.ok) {
      const txt = await snapRes.text();
      throw new Error(`Failed to snapshot: ${snapRes.status} - ${txt}`);
    }
    const snap = await snapRes.json();
    const domLen = String(snap?.dom || '').length;
    const hasA11y = !!snap?.a11y;
    const hasShot = !!snap?.screenshot;
    console.log(`✅ Snapshot OK. domLen=${domLen} a11y=${hasA11y} screenshot=${hasShot}`);

    console.log('🚀 Test Passed Successfully!');

  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  }
}

runTest();
