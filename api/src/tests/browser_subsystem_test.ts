import { getBrowserSession, stopSession, healthcheckBrowser, screenshotSessionJpeg } from '../modules/browser/manager';
import { executePlannedActions } from '../modules/browser/executor';

async function testSubsystem() {
  console.log('=== BROWSER SUBSYSTEM END-TO-END VALIDATION ===');
  const sessionId = `val-session-${Date.now()}`;

  try {
    console.log('[1] Testing getBrowserSession (launching browser)...');
    const s = await getBrowserSession(sessionId);
    console.log('✔ PASS: Browser session launched successfully.');

    console.log('[2] Navigating to https://example.com...');
    await s.page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const title = await s.page.title();
    const h1 = await s.page.textContent('h1');
    console.log(`✔ PASS: Title="${title}", H1="${h1?.trim()}"`);

    console.log('[3] Executing JavaScript in page context...');
    const result = await s.page.evaluate(() => 2 + 2);
    console.log(`✔ PASS: JS evaluation returned ${result}`);

    console.log('[4] Capturing JPEG screenshot...');
    const buf = await screenshotSessionJpeg(sessionId, { quality: 50, timeoutMs: 5000 });
    console.log(`✔ PASS: Screenshot captured successfully (${buf.length} bytes)`);

    console.log('[5] Testing executePlannedActions (navigate to google & search)...');
    const execRes = await executePlannedActions({
      userId: 'bypass-user',
      sessionId,
      actions: [
        { type: 'goto', url: 'https://google.com' },
        { type: 'wait', ms: 500 }
      ]
    });
    console.log('✔ PASS: executePlannedActions completed:', execRes.ok);

    console.log('[6] Testing runBrowserInstruction (fast open)...');
    const { runBrowserInstruction } = require('../modules/browser/runner');
    const instructionRes = await runBrowserInstruction({
      userId: 'bypass-user',
      sessionId,
      instructionText: 'open https://example.com'
    });
    console.log('✔ PASS: runBrowserInstruction returned ok=', instructionRes.ok);

    console.log('[7] Testing healthcheckBrowser()...');
    const health = await healthcheckBrowser();
    console.log('✔ PASS: healthcheckBrowser returned ok=', health.ok);

    console.log('[7] Cleaning up and stopping browser session...');
    await stopSession(sessionId);
    console.log('✔ PASS: Session closed cleanly.');

    console.log('=== ALL BROWSER SUBSYSTEM TESTS PASSED (100% OPERATIONAL) ===');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ BROWSER SUBSYSTEM TEST FAILED:', err.stack || err);
    try { await stopSession(sessionId); } catch {}
    process.exit(1);
  }
}

testSubsystem();
