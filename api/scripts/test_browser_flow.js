
const WORKER_URL = process.env.BROWSER_WORKER_URL || 'http://localhost:7070';
const API_KEY = process.env.BROWSER_WORKER_KEY || 'change-me';

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

    console.log('🚀 Test Passed Successfully!');

  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  }
}

runTest();
