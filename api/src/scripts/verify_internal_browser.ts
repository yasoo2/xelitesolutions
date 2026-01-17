
import { getBrowserSession, stopSession } from '../browser/manager';

// Set env before imports if possible, or right at start
process.env.BROWSER_WS_ENDPOINT = 'ws://localhost:5050/ws';
process.env.BROWSER_HEADLESS = 'true';
// Ensure no display errors
process.env.BROWSER_ARGS = '--no-sandbox --disable-setuid-sandbox';

async function verifyInternal() {
    console.log('🕵️ Internal Verification: Testing manager.ts -> Browser Worker');
    const sid = 'verify-internal-' + Date.now();

    try {
        console.log('🚀 Calling getBrowserSession...');
        const session = await getBrowserSession(sid);
        console.log('✅ Session acquired!');

        const page = session.page;
        console.log('🌍 Navigating to Google...');
        await page.goto('https://www.google.com', { timeout: 15000, waitUntil: 'domcontentloaded' });

        const title = await page.title();
        console.log(`✅ Page Title: "${title}"`);

        await stopSession(sid);
        console.log('🎉 Verification PASSED: manager.ts compatible with Worker.');
        process.exit(0);
    } catch (e: any) {
        console.error('❌ Verification FAILED:', e);
        console.error('Suggestion: Ensure browser-worker is running and rebuilt.');
        process.exit(1);
    }
}

verifyInternal();
