import { chromium } from 'playwright';
import path from 'path';

async function run() {
    console.log('[Playwright] Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const errors: string[] = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    try {
        console.log('[Playwright] Navigating to http://127.0.0.1:5001/login...');
        await page.goto('http://127.0.0.1:5001/login', { timeout: 30000 });
        
        console.log('[Playwright] Current URL:', page.url());

        const emailInput = await page.$('input[type="email"]');
        if (emailInput) {
            console.log('[Playwright] Login page detected. Logging in...');
            await page.fill('input[type="email"]', 'admin@joe.local');
            await page.fill('input[type="password"]', 'admin');
            await page.click('button[type="submit"]');
            console.log('[Playwright] Submit button clicked. Waiting for transition...');
            await page.waitForTimeout(5000);
        } else {
            console.log('[Playwright] Login page not detected (maybe already logged in or wrong view).');
        }

        console.log('[Playwright] Navigating to /joe...');
        await page.goto('http://127.0.0.1:5001/joe', { timeout: 30000 });
        await page.waitForTimeout(5000);
        console.log('[Playwright] Current URL after /joe navigation:', page.url());

        // Capture state
        const screenshotStart = "C:\\Users\\home\\.gemini\\antigravity\\brain\\478baa5f-47f8-4618-965b-b920ea6c9fdc\\scratch\\joe_ui_state.png";
        await page.screenshot({ path: screenshotStart });
        console.log(`[Playwright] Debug Screenshot saved: ${screenshotStart}`);

        console.log('[Playwright] Waiting for Chat input (textarea)...');
        // Let's check what elements are available if textarea fails
        try {
            await page.waitForSelector('textarea', { timeout: 15000 });
        } catch (err) {
            console.log('[Playwright] Textarea NOT FOUND. Attempting to list all inputs on page.');
            const inputs = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('input, button, textarea, [role="button"]')).map(el => ({
                    tag: el.tagName,
                    type: (el as any).type,
                    id: el.id,
                    class: el.className,
                    text: (el as any).innerText || (el as any).value
                }));
            });
            console.log('[Playwright] Elements found:', JSON.stringify(inputs, null, 2));
            throw err;
        }
        
        console.log('[Playwright] Typing prompt...');
        const promptText = 'قم ببناء نظام متطور لإدارة المخازن على القرص D';
        await page.fill('textarea', promptText);
        
        console.log('[Playwright] Submitting prompt...');
        await page.keyboard.press('Enter');
        
        console.log('[Playwright] Waiting for interaction to register...');
        await page.waitForTimeout(10000); 

        const screenshotEnd = "C:\\Users\\home\\.gemini\\antigravity\\brain\\478baa5f-47f8-4618-965b-b920ea6c9fdc\\scratch\\joe_ui_after.png";
        await page.screenshot({ path: screenshotEnd });
        console.log(`[Playwright] Final Screenshot saved: ${screenshotEnd}`);

        const pageText = await page.evaluate(() => document.body.innerText);
        console.log('\n--- JOE DETECTED RESPONSE ---');
        console.log(pageText.substring(0, 500) + '...');

    } catch (e: any) {
        console.error('[Playwright] Fatal Error:', e.message);
    } finally {
        await browser.close();
    }
}

run();
