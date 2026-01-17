
import { chromium } from 'playwright';

async function verify() {
    console.log('🌐 Connecting to Browser Worker (ws://localhost:5050/ws)...');
    try {
        const browser = await chromium.connect('ws://localhost:5050/ws', {
            headers: { 'x-worker-key': 'joe_secret_browser_key' }
        });
        console.log('✅ Connected to Browser Worker!');

        const page = await browser.newPage();
        console.log('🌍 Navigating to https://google.com (DNS Test)...');

        try {
            await page.goto('https://google.com', { timeout: 15000, waitUntil: 'domcontentloaded' });
            const title = await page.title();
            console.log(`✅ Navigation Successful! Page Title: "${title}"`);
        } catch (e: any) {
            if (String(e.message).includes('ERR_NAME_NOT_RESOLVED')) {
                console.error('❌ DNS FAILED: Could not resolve google.com');
                process.exit(1);
            }
            throw e;
        }

        console.log('📜 Testing Scroll Action...');
        try {
            // Scroll down
            await page.mouse.wheel(0, 500);
            await page.waitForTimeout(500);
            const scrollY = await page.evaluate(() => window.scrollY);
            console.log(`✅ Scroll command executed. Window.scrollY: ${scrollY}`);

            if (scrollY === 0) {
                console.warn('⚠️ Warning: Page did not scroll (scrollY is 0). Might be page behavior or content size.');
            }

            console.log('📸 Testing Screenshot...');
            const buffer = await page.screenshot({ type: 'jpeg', quality: 50 });
            console.log(`✅ Screenshot captured! Size: ${buffer.length} bytes`);

        } catch (e) {
            console.error('❌ Scroll/Screenshot Failed:', e);
        }

        await browser.close();
        console.log('🎉 Verification Complete!');

    } catch (e: any) {
        if (e.message.includes('ECONNREFUSED')) {
            console.error('❌ Connection Failed: Is the browser-worker container running? (ws://localhost:5050)');
        } else {
            console.error('❌ Verification Failed:', e);
        }
        process.exit(1);
    }
}

verify();
