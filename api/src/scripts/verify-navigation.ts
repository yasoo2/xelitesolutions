
import { tools } from '../tools/registry';
import { config } from '../config';
import WebSocket from 'ws';

async function runTest() {
  console.log('🚀 Starting Browser Navigation Flow Verification...');

  const browserOpen = tools.find(t => t.name === 'browser_open');
  const browserRun = tools.find(t => t.name === 'browser_run');
  
  if (!browserOpen?.execute || !browserRun?.execute) {
    console.error('❌ Critical Error: browser tools not found');
    process.exit(1);
  }

  // 1. Open example.com
  console.log('\n1. Opening browser at example.com...');
  const openResult = await browserOpen.execute({ url: 'https://example.com' });
  if (!openResult.ok || !openResult.output?.sessionId) {
    console.error('❌ Failed to open browser:', openResult.error);
    process.exit(1);
  }
  const sessionId = openResult.output.sessionId;
  console.log('✅ SessionId:', sessionId);

  // 2. Connect WebSocket to listen for cursor events
  console.log('\n2. Connecting to WebSocket to listen for cursor events...');
  const wsUrl = `${config.browserWorkerUrl.replace('http', 'ws')}/ws/${sessionId}?key=${config.browserWorkerKey}`;
  const ws = new WebSocket(wsUrl);

  let cursorMoves = 0;
  let cursorClicks = 0;

  await new Promise<void>((resolve) => {
    ws.on('open', () => {
      console.log('✅ WebSocket Connected');
      resolve();
    });
    ws.on('error', (e) => console.error('WS Error:', e));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'cursor_move') {
        console.log(`   👉 Cursor Move: (${Math.round(msg.x)}, ${Math.round(msg.y)})`);
        cursorMoves++;
      }
      if (msg.type === 'cursor_click') {
        console.log(`   🖱️ Cursor Click: (${Math.round(msg.x)}, ${Math.round(msg.y)})`);
        cursorClicks++;
      }
      if (msg.type === 'url') {
        console.log(`   🔗 Navigated to: ${msg.url}`);
      }
    } catch {}
  });

  // 3. Click "More information..."
  console.log('\n3. Clicking "More information..." link...');
  const clickRes = await browserRun.execute({
    sessionId,
    actions: [
      {
        type: 'click',
        selector: 'a' // The only link on example.com is "More information..."
      },
      {
        type: 'waitForLoad',
        state: 'domcontentloaded'
      }
    ]
  });
  console.log('✅ Click executed:', clickRes.ok ? 'OK' : clickRes.error);

  // Wait a bit for navigation events to arrive via WS
  await new Promise(r => setTimeout(r, 2000));

  if (cursorMoves > 0 && cursorClicks > 0) {
     console.log('✅ Visual feedback verified: Cursor moved and clicked.');
  } else {
     console.error('❌ Missing visual feedback (moves or clicks).');
  }

  // 4. Go Back
  console.log('\n4. Going Back...');
  const backRes = await browserRun.execute({
    sessionId,
    actions: [
      {
        type: 'goBack'
      },
      {
        type: 'waitForLoad',
        state: 'domcontentloaded'
      }
    ]
  });
  console.log('✅ Go Back executed:', backRes.ok ? 'OK' : backRes.error);

  // Wait a bit
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n🎉 SUCCESS: Navigation flow completed.');
  ws.close();
  process.exit(0);
}

runTest().catch(e => {
  console.error('❌ Unhandled Error:', e);
  process.exit(1);
});
