
import { tools } from '../tools/registry';
import { config } from '../config';

// Mock dependencies if needed, or run against live server
// This script assumes the API and Browser Worker are running locally.

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🚀 Starting Comprehensive Browser Verification...');

  // 1. Find the browser tools
  const browserOpen = tools.find(t => t.name === 'browser_open');
  const browserRun = tools.find(t => t.name === 'browser_run');
  const browserExtract = tools.find(t => t.name === 'browser_extract');

  if (!browserOpen?.execute || !browserRun?.execute || !browserExtract?.execute) {
    console.error('❌ Critical Error: Browser tools not found in registry!');
    process.exit(1);
  }
  const open = browserOpen.execute;
  const run = browserRun.execute;
  const extract = browserExtract.execute;

  // 2. Open Browser Session (Google)
  console.log('\nTesting: browser_open (https://www.google.com)...');
  const openResult = await open({ url: 'https://www.google.com' });
  
  if (!openResult.ok) {
    console.error('❌ browser_open failed:', openResult.error);
    process.exit(1);
  }

  const sessionId = openResult.output.sessionId;
  const wsUrl = openResult.output.wsUrl;
  console.log(`✅ Browser Opened! SessionId: ${sessionId}`);
  console.log(`✅ WebSocket URL: ${wsUrl}`);

  // 3. Navigate and Search (Interaction: Type + Click)
  console.log('\nTesting: browser_run (Type "OpenAI" and Search)...');
  const searchAction = {
    sessionId,
    actions: [
      { type: 'type', selector: 'textarea[name="q"], input[name="q"]', text: 'OpenAI' },
      { type: 'press', key: 'Enter' },
      { type: 'wait', timeoutMs: 3000 } // Wait for results
    ]
  };
  
  const searchResult = await run(searchAction);
  if (!searchResult.ok) {
    console.error('❌ browser_run (Search) failed:', searchResult.error);
  } else {
    console.log('✅ Search actions executed successfully.');
  }

  // 4. Scroll Down (Interaction: Scroll)
  console.log('\nTesting: browser_run (Scroll Down)...');
  const scrollAction = {
    sessionId,
    actions: [
      { type: 'scroll', x: 0, y: 500 },
      { type: 'wait', timeoutMs: 1000 }
    ]
  };
  const scrollResult = await run(scrollAction);
  if (!scrollResult.ok) {
    console.error('❌ browser_run (Scroll) failed:', scrollResult.error);
  } else {
    console.log('✅ Scroll action executed successfully.');
  }

  // 5. Extract Data (Analysis: Reading content)
  console.log('\nTesting: browser_extract (Reading Search Results)...');
  // Attempt to extract titles of search results
  // Schema for Google Search results (approximate)
  const schema = {
    results: {
      selector: 'div.g',
      type: 'array',
      items: {
        title: { selector: 'h3', type: 'text' },
        link: { selector: 'a', attr: 'href', type: 'text' }
      }
    }
  };

  const extractResult = await extract({
    sessionId,
    schema
  });

  if (!extractResult.ok) {
    console.error('❌ browser_extract failed:', extractResult.error);
  } else {
    console.log('✅ Extraction successful!');
    console.log('📄 Extracted Data Preview:', JSON.stringify(extractResult.output).slice(0, 200) + '...');
  }
  
  // 5b. Get State (Full Snapshot)
  const browserGetState = tools.find(t => t.name === 'browser_get_state');
  if (browserGetState?.execute) {
      console.log('\nTesting: browser_get_state (DOM & Screenshot)...');
      const stateResult = await browserGetState.execute({ sessionId });
      if (!stateResult.ok) {
          console.error('❌ browser_get_state failed:', stateResult.error);
      } else {
          console.log('✅ State capture successful!');
          console.log(`📸 Screenshot: ${stateResult.output.screenshot}`);
          console.log(`📄 DOM Length: ${stateResult.output.dom.length} chars`);
      }
  }

  // 6. Screenshot (Verification: Visual)
  console.log('\nTesting: browser_run (Screenshot)...');
  const screenshotAction = {
    sessionId,
    actions: [
      { type: 'screenshot' }
    ]
  };
  const screenshotResult = await run(screenshotAction);
  if (!screenshotResult.ok) {
    console.error('❌ browser_run (Screenshot) failed:', screenshotResult.error);
  } else {
    console.log('✅ Screenshot action executed.');
    // Check logs for screenshot artifact
    const hasScreenshot = screenshotResult.artifacts?.some((a: any) => a.kind === 'screenshot'); // Adjusted based on actual return structure
    if (hasScreenshot || screenshotResult.logs?.some((l: string) => l.includes('screenshot'))) {
        console.log('✅ Screenshot artifact confirmed.');
    } else {
        console.log('⚠️ Screenshot executed but explicit artifact check needs manual verification of logs.');
    }
  }

  console.log('\n🎉 Verification Complete!');
  process.exit(0);
}

runTest().catch(e => {
  console.error('❌ Unhandled Error:', e);
  process.exit(1);
});
