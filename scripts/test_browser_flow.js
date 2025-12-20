
const WebSocket = require('ws');

async function testBrowserFlow() {
  console.log('🧪 Starting Browser Flow Test...');

  const ws = new WebSocket('ws://localhost:3002');

  ws.on('open', () => {
    console.log('✅ Connected to Browser Worker');
    
    // 1. Request Browser Launch
    const launchCmd = {
      type: 'browser:launch',
      id: 'test-1',
      data: { url: 'https://example.com' }
    };
    console.log('📤 Sending launch command...');
    ws.send(JSON.stringify(launchCmd));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('Rx:', msg.type);

    if (msg.type === 'browser:update') {
      console.log('📸 Received screenshot/update');
    }
    
    if (msg.type === 'browser:ready') {
        console.log('✅ Browser Ready');
        // Close after success
        setTimeout(() => {
            console.log('🏁 Test Passed');
            ws.close();
            process.exit(0);
        }, 2000);
    }

    if (msg.type === 'error') {
        console.error('❌ Error:', msg.error);
        process.exit(1);
    }
  });

  ws.on('error', (err) => {
    console.error('❌ Connection Error:', err.message);
    process.exit(1);
  });
}

testBrowserFlow();
