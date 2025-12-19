import { config } from '../config';
// import fetch from 'node-fetch'; // Assuming node-fetch is available or global fetch

const WORKER_URL = config.browserWorkerUrl;
const WORKER_KEY = config.browserWorkerKey;

async function testScenario(name: string, params: any, validationFn: (data: any) => boolean) {
  console.log(`\nStarting Scenario: ${name}`);
  console.log(`Params:`, JSON.stringify(params));

  try {
    // 1. Create Session
    const createRes = await fetch(`${WORKER_URL}/session/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-key': WORKER_KEY
      },
      body: JSON.stringify(params)
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create session: ${createRes.status} ${await createRes.text()}`);
    }

    const { sessionId } = await createRes.json();
    console.log(`Session Created: ${sessionId}`);

    // 2. Navigate to a page with viewport meta tag to ensure correct dimensions on mobile
    const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
    const dataUrl = `data:text/html,${encodeURIComponent(html)}`;
    
    await fetch(`${WORKER_URL}/session/${sessionId}/job/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-key': WORKER_KEY
      },
      body: JSON.stringify({
        actions: [{ type: 'goto', url: dataUrl }]
      })
    });

    // 3. Run Evaluate
    const evalScript = `
      ({
        width: window.innerWidth,
        height: window.innerHeight,
        userAgent: navigator.userAgent
      })
    `;

    const runRes = await fetch(`${WORKER_URL}/session/${sessionId}/job/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-key': WORKER_KEY
      },
      body: JSON.stringify({
        actions: [{ type: 'evaluate', script: evalScript }]
      })
    });

    if (!runRes.ok) {
      throw new Error(`Failed to run job: ${runRes.status} ${await runRes.text()}`);
    }

    const runJson = await runRes.json();
    const result = runJson.outputs?.[0]?.result;
    console.log(`Result:`, result);

    // 4. Validate
    if (validationFn(result)) {
      console.log(`✅ Scenario '${name}' Passed`);
    } else {
      console.error(`❌ Scenario '${name}' Failed`);
      console.error(`Expected match for scenario logic, got:`, result);
    }

    // 5. Close Session
    await fetch(`${WORKER_URL}/session/${sessionId}/close`, {
      method: 'POST',
      headers: { 'x-worker-key': WORKER_KEY }
    });
    console.log(`Session Closed`);

  } catch (error) {
    console.error(`❌ Scenario '${name}' Error:`, error);
  }
}

async function main() {
  console.log('Testing Browser Worker Scenarios...');
  
  // Scenario 1: Desktop
  await testScenario('Desktop Default (1920x1080)', {
    viewport: { width: 1920, height: 1080 }
  }, (data) => {
    return data && data.width === 1920 && data.height === 1080;
  });

  // Scenario 2: Mobile (iPhone 12 via device preset)
  // Note: Playwright's iPhone 12 width is 390
  await testScenario('Mobile iPhone 12', {
    device: 'iPhone 12'
  }, (data) => {
    // Check if UA contains iPhone and width is small
    return data && data.userAgent.includes('iPhone') && data.width === 390;
  });

  // Scenario 3: Custom User Agent
  await testScenario('Custom User Agent', {
    userAgent: 'MyCustomBot/1.0'
  }, (data) => {
    return data && data.userAgent === 'MyCustomBot/1.0';
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
