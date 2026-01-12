import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { config } from '../config';

const API_PORT = Number(process.env.API_PORT || process.env.PORT || config.port || 3000);
const API_URL = process.env.API_URL || `http://localhost:${API_PORT}`;
const WS_URL = process.env.WS_URL || `ws://localhost:${API_PORT}/ws`;
const JWT_SECRET = process.env.JWT_SECRET || config.jwtSecret;
const WEB_URL = process.env.WEB_URL || 'http://127.0.0.1:5173';

const token = jwt.sign({ sub: 'test-user', role: 'OWNER' }, JWT_SECRET);
const authHeaders = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

async function runUiE2e() {
  console.log('\n🧪 Starting UI E2E Test (Thinking Glimpse + Draft)...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  let browserWs: WebSocket | null = null;

  try {
    await page.addInitScript((cfg: any) => {
      const t = String(cfg?.token || '');
      const apiUrl = String(cfg?.apiUrl || '');
      const wsUrl = String(cfg?.wsUrl || '');
      localStorage.setItem('token', t);
      localStorage.setItem('lang', 'en');
      (window as any).JOE_CONFIG = { API_URL: apiUrl, WS_URL: wsUrl };
      (window as any).__wsSends = [];
      (window as any).__fetches = [];
      try {
        const WS = (window as any).WebSocket;
        const origSend = WS?.prototype?.send;
        if (!origSend) throw new Error('no_ws_send');
        WS.prototype.send = function (data: any) {
          try { (window as any).__wsSends.push(String(data)); } catch {}
          return origSend.apply(this, [data]);
        };
      } catch {}
      try {
        const origFetch = window.fetch.bind(window);
        window.fetch = (async (...args: any[]) => {
          try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            (window as any).__fetches.push({
              url: String(url || ''),
              init: args[1] || null,
            });
          } catch {}
          return await (origFetch as any).apply(window, args as any);
        }) as any;
      } catch {}
    }, { token, apiUrl: API_URL, wsUrl: WS_URL });

    await page.goto(`${WEB_URL}/joe`, { waitUntil: 'networkidle' });
    await page.waitForSelector('textarea', { state: 'visible' });

    await page.evaluate(() => {
      (window as any).__joeBrowserSession = null;
      window.addEventListener('joe:browser_attached', (ev: any) => {
        try { (window as any).__joeBrowserSession = ev?.detail || null; } catch {}
      });
    });

    let glimpse1: string | null = null;
    let glimpse2: string | null = null;
    let aiText = '';
    let errText = '';
    try {
      const prompt = 'Write a 600-word overview of what npm scripts are and how they are used in modern web projects.';
      await page.focus('textarea');
      await page.keyboard.type(prompt, { delay: 5 });
      await page.keyboard.press('Enter');

      const needles = [
        'Understanding your request',
        'Planning the best approach',
        'Running:',
        'Working on it now',
        'Refining and organizing',
      ];

      await page
        .waitForFunction(
          (arr: string[]) => {
            const txt = document.body ? document.body.innerText : '';
            const hasNeedle = arr.some((s: string) => txt.includes(s));
            const hasAi = document.querySelectorAll('.chat-bubble-wrapper.ai').length > 0;
            const hasErr = !!document.querySelector('.message-bubble.error');
            return hasNeedle || hasAi || hasErr;
          },
          needles,
          { timeout: 12000 }
        )
        .catch(() => null);

      glimpse1 =
        (await page
          .evaluate((arr) => {
            const txt = document.body ? document.body.innerText : '';
            return arr.find((s) => txt.includes(s)) || null;
          }, needles)
          .catch(() => null)) || null;

      await new Promise((r) => setTimeout(r, 1200));

      glimpse2 =
        (await page
          .evaluate((arr) => {
            const txt = document.body ? document.body.innerText : '';
            return arr.find((s) => txt.includes(s)) || null;
          }, needles)
          .catch(() => null)) || null;

      const needsSecret = await page
        .evaluate(() => {
          const txt = document.body ? document.body.innerText : '';
          return txt.includes('A token/key is required to continue.');
        })
        .catch(() => false);
      if (needsSecret) {
        await page.focus('textarea');
        await page.keyboard.type('dummy-token', { delay: 5 });
        await page.keyboard.press('Enter');
      }

      const aiCountBefore = await page.$$eval('.chat-bubble-wrapper.ai', (els) => els.length).catch(() => 0);
      await page
        .waitForFunction(
          (before: number) => {
            const aiInc = document.querySelectorAll('.chat-bubble-wrapper.ai').length > before;
            const err = !!document.querySelector('.message-bubble.error');
            const txt = document.body ? document.body.innerText : '';
            const gate = txt.includes('A token/key is required to continue.');
            return aiInc || err || gate;
          },
          aiCountBefore,
          { timeout: 15000 }
        )
        .catch(() => null);

      aiText = await page
        .$$eval('.chat-bubble-wrapper.ai .chat-bubble-content', (els) => {
          const last = els[els.length - 1];
          return last ? (last.textContent || '') : '';
        })
        .catch(() => '');
      errText = await page.$eval('.message-bubble.error', (el) => (el.textContent || '').trim()).catch(() => '');
    } catch {}

    await page.click('button[title="Agent Mode"]');
    await page.waitForSelector('.agent-browser-stream canvas', { state: 'visible', timeout: 30000 });
    const canvas = await page.$('.agent-browser-stream canvas');
    if (!canvas) throw new Error('Browser canvas not found');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Browser canvas has no bounding box');
    let remoteW = 1280;
    let remoteH = 720;

    const agentTestHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>ready</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; font-family: Arial, sans-serif; background: #0b1020; color: #fff; }
          .wrap { width: 100%; height: 100%; position: relative; }
          #q { position: absolute; left: 50%; top: calc(50% - 90px); transform: translateX(-50%); width: min(960px, calc(100% - 80px)); height: 72px; font-size: 26px; padding: 0 18px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.35); color: #fff; outline: none; }
          #btn { position: absolute; left: 50%; top: calc(50% + 10px); transform: translateX(-50%); width: min(960px, calc(100% - 80px)); height: 66px; font-size: 20px; border-radius: 14px; border: none; background: #2563eb; color: #fff; cursor: pointer; }
          .hint { position: absolute; left: 50%; top: calc(50% + 92px); transform: translateX(-50%); width: min(960px, calc(100% - 80px)); opacity: 0.85; font-size: 14px; text-align: center; }
        </style>
      </head>
      <body data-ready="1">
        <div class="wrap">
          <input id="q" placeholder="type here" autocomplete="off" autofocus />
          <button id="btn">Apply</button>
          <div class="hint">Autofocus enabled. Type then click Apply.</div>
        </div>
        <script>
          const q = document.getElementById('q');
          const btn = document.getElementById('btn');
          q.addEventListener('input', () => q.setAttribute('value', q.value));
          btn.addEventListener('click', () => {
            document.body.setAttribute('data-clicked', q.value);
            document.title = 'clicked:' + q.value;
          });
        </script>
      </body>
    </html>
  `;
    const dataUrl = `data:text/html,${encodeURIComponent(agentTestHtml)}`;
    await page.evaluate((u) => {
      (window as any).__joeBrowserSession = null;
      window.dispatchEvent(new CustomEvent('joe:browser_open_request', { detail: { url: u } }));
      (window as any).__wsSends = [];
      (window as any).__fetches = [];
    }, dataUrl);

    const session = await page
      .waitForFunction(() => {
        const s = (window as any).__joeBrowserSession;
        const sid = s?.sessionId;
        return typeof sid === 'string' && sid.trim() ? s : null;
      }, { timeout: 30000 })
      .then((h) => h.jsonValue() as any);

    const sessionId = String(session?.sessionId || '').trim();
    if (!sessionId) throw new Error('Missing sessionId from joe:browser_attached');

    const openResp = await fetch(`${API_URL}/tools/browser_open/execute`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ sessionId, url: dataUrl }),
    });
    const openRaw = await openResp.text().catch(() => '');
    if (!openResp.ok) {
      throw new Error(`browser_open_http_${openResp.status}:${openRaw.slice(0, 240)}`);
    }

    const browserWsUrl = (() => {
      const base = API_URL.replace(/^http/i, 'ws');
      const u = new URL('/ws/browser', base);
      u.searchParams.set('sessionId', sessionId);
      return u.toString();
    })();

    browserWs = new WebSocket(browserWsUrl);
    const browserEvents: any[] = [];
    const browserWsReady = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('browser_ws_connect_timeout')), 8000);
      browserWs?.on('open', () => {
        clearTimeout(t);
        resolve();
      });
      browserWs?.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    browserWs.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data || ''));
        browserEvents.push(msg);
      } catch {}
    });

    const waitForBrowserEvent = async (pred: (m: any) => boolean, timeoutMs: number, label: string) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (browserEvents.some(pred)) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`timeout_waiting_for_${label}`);
    };

    const fetchDom = async () => {
      const res = await fetch(`${API_URL}/tools/browser_get_state/execute`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ sessionId }),
      });
      const j: any = await res.json().catch(() => null);
      return String(j?.output?.dom || '');
    };

    const loadStartedAt = Date.now();
    while (Date.now() - loadStartedAt < 15000) {
      const dom = await fetchDom();
      if (dom.includes('data-ready="1"')) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    const domReady = await fetchDom();
    if (!domReady.includes('data-ready="1"')) {
      throw new Error(`browser_page_not_ready (sessionId=${sessionId})`);
    }

    const clickViewport = async (vx: number, vy: number) => {
      const x = Math.max(0, Math.min(Math.max(1, remoteW) - 1, Math.round(vx)));
      const y = Math.max(0, Math.min(Math.max(1, remoteH) - 1, Math.round(vy)));
      const cx = box.x + box.width * (x / remoteW);
      const cy = box.y + box.height * (y / remoteH);
      await page.mouse.click(cx, cy);
    };

    await browserWsReady;

    await waitForBrowserEvent((m) => m?.type === 'stream_frame', 12000, 'stream_frame');
    const firstFrame = browserEvents.find((m) => m?.type === 'stream_frame' && Number.isFinite(m?.w) && Number.isFinite(m?.h));
    remoteW = Math.max(320, Math.min(3840, Math.floor(Number(firstFrame?.w || remoteW))));
    remoteH = Math.max(240, Math.min(2160, Math.floor(Number(firstFrame?.h || remoteH))));

    browserEvents.length = 0;
    const missRes = await fetch(`${API_URL}/tools/browser_run/execute`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sessionId,
        actions: [{ type: 'click', selector: '#__definitely_not_found__' }],
      }),
    });
    const missRaw = await missRes.text().catch(() => '');
    if (!missRes.ok) {
      throw new Error(`browser_run_missing_click_http_${missRes.status}:${missRaw.slice(0, 240)}`);
    }
    await waitForBrowserEvent((m) => m?.type === 'action_sent' && String(m?.actionType || '') === 'click', 20000, 'action_sent_click_missing');
    await waitForBrowserEvent((m) => m?.type === 'action_error' && String(m?.actionType || '') === 'click', 20000, 'action_error_click_missing');

    browserEvents.length = 0;
    await clickViewport(remoteW / 2, remoteH / 2 - 54);

    await page.waitForFunction(
    () => {
      const sends: string[] = (window as any).__wsSends || [];
      for (const s of sends) {
        try {
          const j = JSON.parse(s);
          if (j?.type === 'action' && j?.action?.type === 'click') return true;
        } catch {}
      }
      const fetches: any[] = (window as any).__fetches || [];
      for (const f of fetches) {
        const url = String(f?.url || '');
        if (!url.includes('/tools/browser_run/execute')) continue;
        const body = f?.init?.body;
        if (typeof body !== 'string') continue;
        if (body.includes('"type":"click"')) return true;
      }
      return false;
    },
    { timeout: 30000 }
    );

    const canvasFocused = await page.evaluate(() => document.activeElement?.tagName === 'CANVAS');
    if (!canvasFocused) throw new Error('Canvas did not receive focus after click');

    await waitForBrowserEvent((m) => m?.type === 'action_sent' && String(m?.actionType || '') === 'click', 12000, 'action_sent_click');
    await waitForBrowserEvent((m) => m?.type === 'action_done' && String(m?.actionType || '') === 'click', 12000, 'action_done_click');

    await page.keyboard.type('abc', { delay: 10 });
    await page.waitForFunction(
    () => {
      const sends: string[] = (window as any).__wsSends || [];
      for (const s of sends) {
        try {
          const j = JSON.parse(s);
          if (j?.type === 'action' && j?.action?.type === 'type') return true;
        } catch {}
      }
      const fetches: any[] = (window as any).__fetches || [];
      for (const f of fetches) {
        const url = String(f?.url || '');
        if (!url.includes('/tools/browser_run/execute')) continue;
        const body = f?.init?.body;
        if (typeof body !== 'string') continue;
        if (body.includes('"type":"type"')) return true;
      }
      return false;
    },
    { timeout: 30000 }
    );

    await waitForBrowserEvent((m) => m?.type === 'action_sent' && String(m?.actionType || '') === 'type', 12000, 'action_sent_type');
    await waitForBrowserEvent((m) => m?.type === 'action_done' && String(m?.actionType || '') === 'type', 12000, 'action_done_type');

    await clickViewport(remoteW / 2, remoteH / 2 + 43);
    await new Promise((r) => setTimeout(r, 600));

    const domAfter = await fetchDom();
    const hasClicked = domAfter.includes('data-clicked="abc"') || domAfter.includes("data-clicked='abc'");
    const hasValue = domAfter.includes('value="abc"') || domAfter.includes("value='abc'");
    if (!hasClicked || !hasValue) {
      throw new Error(`Agent interaction did not reflect in DOM (sessionId=${sessionId})`);
    }

    console.log('✅ UI E2E PASSED');
    console.log(
      JSON.stringify(
        {
          webUrl: WEB_URL,
          glimpse1,
          glimpse2,
          aiReplySample: String(aiText || '').trim().slice(0, 220),
          errorSample: String(errText || '').trim().slice(0, 220),
        },
        null,
        2
      )
    );
  } finally {
    try { browserWs?.close(); } catch {}
    await browser.close();
  }
}

async function runCapabilitiesTest() {
  console.log('\n🚀 Starting Joe Capabilities Test (Web Build)...\n');

  try {
    // 1. Init Session
    console.log('1️⃣  Initializing Session...');
    const startRes = await fetch(`${API_URL}/runs/start`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ text: 'init' })
    });
    
    const sessionsRes = await fetch(`${API_URL}/sessions`, { headers: authHeaders });
    const sessionsData = await sessionsRes.json();
    const session = sessionsData.sessions[0];
    const sessionId = session.id || session._id;
    console.log(`   Session ID: ${sessionId}`);

    // 2. Request Web Build
    console.log('\n2️⃣  Requesting: "Build a single-file landing page for Xelite Coffee..."');
    const ws = new WebSocket(WS_URL);
    
    await new Promise<void>((resolve, reject) => {
        // Longer timeout for generation
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for completion')), 60000);

        ws.on('open', async () => {
            console.log('   📡 WebSocket Connected');
            
            await fetch(`${API_URL}/runs/start`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ 
                    text: "Create a modern, single-file HTML landing page for 'Xelite Coffee'. It should have a dark theme, a hero section with a headline 'Code & Caffeine', a features section, and a footer. Save it as 'xelite.html'.", 
                    sessionId 
                })
            });
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === 'text') {
                console.log(`   💬 Joe says: ${msg.data.slice(0, 100).replace(/\n/g, ' ')}...`);
            }
            
            if (msg.type === 'step_started') {
                console.log(`   ➡️  Working on: ${msg.data.name}`);
            }

            if (msg.type === 'step_done') {
                if (msg.data.plan && msg.data.plan.name === 'file_write') {
                    console.log(`   ✅ File Created: ${msg.data.plan.input.filename}`);
                }
            }

            if (msg.type === 'run_completed') {
                clearTimeout(timeout);
                console.log('   🏁 Task Completed');
                resolve();
            }
        });
        
        ws.on('error', (e) => reject(e));
    });
    
    ws.close();

    // 3. Verify Artifact
    console.log('\n3️⃣  Verifying Artifact...');
    const artifactPath = '/tmp/joe-artifacts/xelite.html';
    if (fs.existsSync(artifactPath)) {
        const stats = fs.statSync(artifactPath);
        console.log(`   ✅ File found: ${artifactPath}`);
        console.log(`   📏 Size: ${stats.size} bytes`);
        console.log(`   👀 Preview content:`);
        const content = fs.readFileSync(artifactPath, 'utf-8');
        console.log(content.slice(0, 200));
        console.log('   ...');
    } else {
        console.error(`   ❌ File NOT found at ${artifactPath}`);
        process.exit(1);
    }

    console.log('\n✨ CAPABILITIES TEST PASSED ✨\n');

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

async function main() {
  if (process.env.UI_E2E === '1') {
    await runUiE2e();
    return;
  }
  if (process.env.CAPABILITIES_E2E === '1') {
    await runCapabilitiesTest();
    return;
  }
  const hasOpenAiKey = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  if (!hasOpenAiKey) {
    await runUiE2e();
    return;
  }
  await runCapabilitiesTest();
}

main();
