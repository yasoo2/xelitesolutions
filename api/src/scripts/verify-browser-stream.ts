
import { tools } from '../tools/registry';
import { config } from '../config';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

async function runTest() {
  console.log('🚀 Starting Browser Stream Verification...');

  const browserOpen = tools.find(t => t.name === 'browser_open');
  if (!browserOpen || !browserOpen.execute) {
    console.error('❌ Critical Error: browser_open tool not found or executable!');
    process.exit(1);
  }

  // 1. Open Browser Session
  console.log('\nTesting: browser_open (https://www.google.com)...');
  const openResult = await browserOpen.execute({ url: 'https://www.google.com' });
  
  if (!openResult.ok) {
    console.error('❌ browser_open failed:', openResult.error);
    process.exit(1);
  }

  const sessionId = openResult.output?.sessionId;
  const wsUrlPath = openResult.output?.wsUrl; // This is a relative path /browser/ws/...

  if (!sessionId || !wsUrlPath) {
    console.error('❌ Failed to get sessionId or wsUrl from browser_open output');
    process.exit(1);
  }

  console.log(`✅ Browser Opened! SessionId: ${sessionId}`);
  console.log(`✅ WebSocket Path: ${wsUrlPath}`);

  // 2. Generate Token
  const token = jwt.sign({ sub: 'test-user', role: 'admin' }, config.jwtSecret, { expiresIn: '1h' });
  
  // 3. Construct Absolute WebSocket URL
  // Assuming API is running on localhost at config.port
  const port = config.port;
  const fullWsUrl = `ws://localhost:${port}${wsUrlPath}?token=${token}`;
  
  console.log(`✅ Full WebSocket URL: ${fullWsUrl}`);

  // 4. Connect to WebSocket
  console.log('\nConnecting to WebSocket...');
  
  const ws = new WebSocket(fullWsUrl);

  const timeout = setTimeout(() => {
    console.error('❌ Timeout waiting for stream messages');
    ws.terminate();
    process.exit(1);
  }, 10000);

  let gotStreamStart = false;
  let gotFrame = false;

  ws.on('open', () => {
    console.log('✅ WebSocket Connected');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // console.log('Received message type:', msg.type);

      if (msg.type === 'stream_start' || msg.type === 'state') {
        if (!gotStreamStart) {
            console.log('✅ Received stream_start/state');
            gotStreamStart = true;
        }
      }

      if (msg.type === 'frame' && msg.jpegBase64) {
        if (!gotFrame) {
            console.log('✅ Received frame with jpegBase64');
            gotFrame = true;
        }
      }

      if (gotStreamStart && gotFrame) {
        console.log('\n🎉 Stream Verification Successful!');
        clearTimeout(timeout);
        ws.close();
        process.exit(0);
      }

    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket Error:', err);
    clearTimeout(timeout);
    process.exit(1);
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket closed: ${code} ${reason}`);
    if (!gotStreamStart || !gotFrame) {
        console.error('❌ WebSocket closed before verification complete');
        process.exit(1);
    }
  });
}

runTest().catch(e => {
  console.error('❌ Unhandled Error:', e);
  process.exit(1);
});
