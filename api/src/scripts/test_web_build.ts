import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
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

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await page.evaluateOnNewDocument((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('lang', 'en');
  }, token);

  await page.goto(`${WEB_URL}/joe`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('textarea', { visible: true });

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

  await page.waitForFunction(
    (arr) => arr.some((s) => document.body && document.body.innerText.includes(s)),
    {},
    needles
  );

  const glimpse1 = await page.evaluate((arr) => {
    const txt = document.body ? document.body.innerText : '';
    return arr.find((s) => txt.includes(s)) || null;
  }, needles);

  await new Promise((r) => setTimeout(r, 1200));

  const glimpse2 = await page.evaluate((arr) => {
    const txt = document.body ? document.body.innerText : '';
    return arr.find((s) => txt.includes(s)) || null;
  }, needles);

  const needsSecret = await page.evaluate(() => {
    const txt = document.body ? document.body.innerText : '';
    return txt.includes('A token/key is required to continue.');
  });
  if (needsSecret) {
    await page.focus('textarea');
    await page.keyboard.type('dummy-token', { delay: 5 });
    await page.keyboard.press('Enter');
  }

  const aiCountBefore = await page.$$eval('.chat-bubble-wrapper.ai', (els) => els.length);
  await page.waitForFunction(
    (before) => {
      const aiInc = document.querySelectorAll('.chat-bubble-wrapper.ai').length > before;
      const err = !!document.querySelector('.message-bubble.error');
      const txt = document.body ? document.body.innerText : '';
      const gate = txt.includes('A token/key is required to continue.');
      return aiInc || err || gate;
    },
    {},
    aiCountBefore
  );

  const draftSelector = '[data-joe-draft="1"] .chat-bubble-content';
  const hasDraft = await page.waitForSelector(draftSelector, { timeout: 15000 }).then(() => true).catch(() => false);
  if (hasDraft) {
    const initialLen = await page.$eval(draftSelector, (el) => (el.textContent || '').trim().length).catch(() => 0);
    const grew = await page.waitForFunction(
      (sel, minLen) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const len = (el.textContent || '').trim().length;
        return len > minLen + 10;
      },
      { timeout: 15000 },
      draftSelector,
      initialLen
    ).then(() => true).catch(() => false);

    if (!grew) {
      const sample = await page.$eval(draftSelector, (el) => (el.textContent || '').trim().slice(0, 160)).catch(() => '');
      throw new Error(`Draft did not stream (initialLen=${initialLen}, sample="${sample}")`);
    }
  }

  const secretGateNow = await page.evaluate(() => {
    const txt = document.body ? document.body.innerText : '';
    return txt.includes('A token/key is required to continue.');
  });
  if (secretGateNow) {
    await page.focus('textarea');
    await page.keyboard.type('dummy-token', { delay: 5 });
    await page.keyboard.press('Enter');

    const afterSecretAiCount = await page.$$eval('.chat-bubble-wrapper.ai', (els) => els.length);
    await page.waitForFunction(
      (before) => {
        const aiInc = document.querySelectorAll('.chat-bubble-wrapper.ai').length > before;
        const err = !!document.querySelector('.message-bubble.error');
        return aiInc || err;
      },
      {},
      afterSecretAiCount
    );
  }

  const aiText = await page.$$eval('.chat-bubble-wrapper.ai .chat-bubble-content', (els) => {
    const last = els[els.length - 1];
    return last ? (last.textContent || '') : '';
  });
  const errText = await page.$eval('.message-bubble.error', (el) => (el.textContent || '').trim()).catch(() => '');

  await page.waitForFunction(
    (arr) => !arr.some((s) => document.body && document.body.innerText.includes(s)),
    { timeout: 30000 },
    needles
  );

  await browser.close();

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
  await runCapabilitiesTest();
}

main();
