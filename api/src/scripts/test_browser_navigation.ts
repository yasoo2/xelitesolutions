
import { tools } from '../tools/registry';
import { config } from '../config';
import WebSocket from 'ws';

async function testBrowser() {
  console.log('🚀 Testing Browser Navigation...');

  const browserOpen = tools.find(t => t.name === 'browser_open');
  const browserRun = tools.find(t => t.name === 'browser_run');

  if (!browserOpen?.execute || !browserRun?.execute) {
    console.error('❌ Browser tools not found or missing execute method');
    return;
  }

  // 1. Open Browser
  console.log('1. Opening browser...');
  const openRes = await browserOpen.execute({ url: 'about:blank' });
  if (!openRes.ok) {
    console.error('❌ browser_open failed:', openRes.error);
    return;
  }
  const { sessionId, wsUrl } = openRes.output;
  console.log(`✅ Session created: ${sessionId}`);
  console.log(`   WS URL: ${wsUrl}`);

  // 2. Connect WS
  console.log('2. Connecting WebSocket...');
  const fullWsUrl = `${config.browserWorkerUrl.replace('http', 'ws')}/ws/${sessionId}?key=${config.browserWorkerKey}`;
  const ws = new WebSocket(fullWsUrl);
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS Connection Timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('✅ WebSocket Connected');
      resolve();
    });
    ws.on('error', (err) => reject(err));
  });

  // 3. Navigate via HTTP (browser_run)
  console.log('3. Navigating to google.com via browser_run...');
  const navRes = await browserRun.execute({
    sessionId,
    actions: [{ type: 'goto', url: 'https://www.google.com', waitUntil: 'domcontentloaded' }]
  });
  
  if (!navRes.ok) {
    console.error('❌ browser_run navigation failed:', navRes.error);
  } else {
    console.log('✅ Navigation successful');
  }

  // 4. Cleanup
  ws.close();
  console.log('Done.');
}

testBrowser().catch(e => console.error('❌ Test Failed:', e));
