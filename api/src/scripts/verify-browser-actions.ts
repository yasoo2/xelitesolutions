import { tools } from '../tools/registry';
import { config } from '../config';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

async function runTest() {
  console.log('🚀 Starting Browser Action Verification (fillForm cursor check)...');

  const browserOpen = tools.find(t => t.name === 'browser_open');
  const browserRun = tools.find(t => t.name === 'browser_run');
  
  if (!browserOpen?.execute || !browserRun?.execute) {
    console.error('❌ Critical Error: browser tools not found!');
    process.exit(1);
  }

  // 1. Open Browser Session to a test form
  const formHtml = `
    <html><body>
      <form>
        <label for="name">Name:</label>
        <input type="text" id="name" name="name" />
        <br/>
        <label for="email">Email:</label>
        <input type="text" id="email" name="email" />
      </form>
    </body></html>
  `;
  const dataUrl = `data:text/html,${encodeURIComponent(formHtml)}`;
  
  console.log('\n1. Opening browser with test form...');
  const openResult = await browserOpen.execute({ url: dataUrl });
  
  if (!openResult.ok) {
    console.error('❌ browser_open failed:', openResult.error);
    process.exit(1);
  }

  const sessionId = openResult.output?.sessionId;
  const wsUrlPath = openResult.output?.wsUrl;
  console.log(`✅ SessionId: ${sessionId}`);

  // 2. Connect WebSocket
  const token = jwt.sign({ sub: 'test-user', role: 'admin' }, config.jwtSecret, { expiresIn: '1h' });
  const fullWsUrl = `ws://localhost:${config.port}${wsUrlPath}?token=${token}`;
  
  console.log('\n2. Connecting to WebSocket to listen for cursor events...');
  const ws = new WebSocket(fullWsUrl);

  let cursorMoved = false;

  ws.on('open', async () => {
    console.log('✅ WebSocket Connected');
    
    // 3. Execute fillForm
    console.log('\n3. Executing fillForm...');
    try {
      if (!browserRun || !browserRun.execute) throw new Error('browser_run missing');
      const res = await browserRun.execute({
        sessionId,
        actions: [
          {
            type: 'fillForm',
            fields: [
              { selector: '#name', value: 'John Doe' },
              { selector: '#email', value: 'john@example.com' }
            ]
          },
          {
            type: 'screenshot'
          }
        ]
      });

      console.log('✅ fillForm and screenshot executed:', res.ok ? 'OK' : res.error);
      const screenshotResult = res.output?.outputs?.find((r: any) => r.type === 'screenshot');
      
      if (screenshotResult && screenshotResult.href) {
         console.log('✅ Screenshot captured successfully. URL:', screenshotResult.href);
         
         // Verify we can fetch it
         const imageUrl = `${config.browserWorkerUrl}${screenshotResult.href}`;
         try {
           const imgRes = await fetch(imageUrl);
           if (imgRes.ok) {
             console.log(`✅ Screenshot verified accessible at ${imageUrl} (${imgRes.status} ${imgRes.statusText})`);
             const blob = await imgRes.blob();
             console.log(`   Size: ${blob.size} bytes`);
           } else {
             console.error(`❌ Failed to fetch screenshot at ${imageUrl}: ${imgRes.status} ${imgRes.statusText}`);
           }
         } catch (err) {
            console.error(`❌ Network error fetching screenshot at ${imageUrl}:`, err);
         }

      } else {
         console.error('❌ Screenshot missing in output or no href');
         console.log('Output results:', JSON.stringify(res.output?.outputs, null, 2));
      }
    } catch (e) {
      console.error('❌ fillForm execution error:', e);
    }
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'cursor_move') {
        console.log(`✅ Received cursor_move: (${msg.x}, ${msg.y})`);
        cursorMoved = true;
      }
    } catch {}
  });

  // Wait 5 seconds
  setTimeout(() => {
    ws.close();
    if (cursorMoved) {
      console.log('\n🎉 SUCCESS: Cursor movement detected during fillForm!');
      process.exit(0);
    } else {
      console.error('\n❌ FAILURE: No cursor movement detected during fillForm.');
      process.exit(1);
    }
  }, 5000);
}

runTest().catch(e => {
  console.error('❌ Unhandled Error:', e);
  process.exit(1);
});
