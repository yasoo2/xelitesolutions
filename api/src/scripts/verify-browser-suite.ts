
import { tools } from '../tools/registry';
import { config } from '../config';
import WebSocket from 'ws';

async function runSuite() {
  console.log('🚀 Starting Unified Browser Capability Suite...');

  const browserOpen = tools.find(t => t.name === 'browser_open');
  const browserRun = tools.find(t => t.name === 'browser_run');
  const browserExtract = tools.find(t => t.name === 'browser_extract');

  if (!browserOpen?.execute || !browserRun?.execute || !browserExtract?.execute) {
    console.error('❌ Critical Error: Browser tools not found in registry!');
    process.exit(1);
  }

  const open = browserOpen.execute;
  const run = browserRun.execute;

  // --- Test 1: Navigation & Streaming ---
  console.log('\n🧪 Test 1: Navigation & Streaming (Google)');
  const openResult = await open({ url: 'https://www.google.com' });
  if (!openResult.ok) throw new Error(`browser_open failed: ${openResult.error}`);
  
  const sessionId = openResult.output.sessionId;
  const wsUrlPath = openResult.output.wsUrl;
  console.log(`   ✅ Session: ${sessionId}`);

  // Verify WebSocket connection
  const fullWsUrl = `${config.browserWorkerUrl.replace('http', 'ws')}/ws/${sessionId}?key=${config.browserWorkerKey}`;
  const ws = new WebSocket(fullWsUrl);
  
  await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject('WS Timeout'), 5000);
      ws.on('open', () => {
          clearTimeout(timer);
          console.log('   ✅ WebSocket Connected');
          resolve();
      });
      ws.on('error', reject);
  });
  ws.close();

  // --- Test 2: Interaction (Typing & Searching) ---
  console.log('\n🧪 Test 2: Interaction (Type "OpenAI")');
  const typeResult = await run({
      sessionId,
      actions: [
          { type: 'type', selector: 'textarea[name="q"], input[name="q"]', text: 'OpenAI' },
          { type: 'press', key: 'Enter' },
          { type: 'wait', ms: 2000 }
      ]
  });
  if (!typeResult.ok) throw new Error(`browser_run failed: ${typeResult.error}`);
  console.log('   ✅ Typing executed');

  // --- Test 3: Form Filling (Data URL) ---
  console.log('\n🧪 Test 3: Form Filling (Mock Page)');
  const formHtml = `
    <html><body>
      <form>
        <input type="text" id="name" name="name" />
        <input type="text" id="email" name="email" />
      </form>
    </body></html>
  `;
  const dataUrl = `data:text/html,${encodeURIComponent(formHtml)}`;
  
  const formOpen = await open({ url: dataUrl });
  if (!formOpen.ok) throw new Error('Failed to open form page');
  const formSession = formOpen.output.sessionId;

  const fillResult = await run({
      sessionId: formSession,
      actions: [
          {
            type: 'fillForm',
            fields: [
              { selector: '#name', value: 'John Doe' },
              { selector: '#email', value: 'john@example.com' }
            ]
          },
          { type: 'screenshot' }
      ]
  });
  
  if (!fillResult.ok) throw new Error(`fillForm failed: ${fillResult.error}`);
  console.log('   ✅ Form filled & Screenshot taken');
  
  const shot = fillResult.output?.outputs?.find((o: any) => o.type === 'screenshot');
  if (shot?.href) console.log(`   📸 Screenshot: ${shot.href}`);

  console.log('\n🎉 All Browser Capabilities Verified!');
}

runSuite().catch(e => {
  console.error('\n❌ Suite Failed:', e);
  process.exit(1);
});
