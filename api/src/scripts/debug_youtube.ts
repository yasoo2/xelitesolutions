
import { chromium } from 'playwright';

async function debugYoutube() {
    console.log('Connecting to Browser Worker...');
    try {
        const browser = await chromium.connect('ws://localhost:5050/ws', {
            headers: { 'x-worker-key': 'joe_secret_browser_key' }
        });
        const page = await browser.newPage();
        console.log('Navigating to YouTube...');
        await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded' });

        console.log('Waiting for network idle (simulating user wait)...');
        await page.waitForTimeout(3000); // YouTube is heavy

        console.log('Attempting to find "Sign in" button...');

        // Common selectors for YouTube Sign In
        const selectors = [
            'a[href*="accounts.google.com"]',
            '[aria-label="Sign in"]',
            '#buttons ytd-button-renderer a',
            'text="Sign in"',
            'text="تسجيل الدخول"'
        ];

        for (const sel of selectors) {
            try {
                const el = await page.$(sel);
                if (el) {
                    const isVisible = await el.isVisible();
                    console.log(`Selector "${sel}": Found? YES, Visible? ${isVisible}`);
                    if (isVisible) {
                        console.log('✅ Found a visible Login button!');
                        // await el.click(); // Don't actually click, just verify
                    }
                } else {
                    console.log(`Selector "${sel}": Not found`);
                }
            } catch (e) {
                console.log(`Selector "${sel}": Error - ${e.message}`);
            }
        }

        await browser.close();

    } catch (e) {
        console.error('Debug Failed:', e);
    }
}

debugYoutube();
