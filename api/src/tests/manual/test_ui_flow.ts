import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function run() {
    console.log("Connecting to browser worker...");
    const wsEndpoint = process.env.BROWSER_WS_ENDPOINT || 'ws://localhost:5050/ws';
    const apiKey = process.env.WORKER_API_KEY || '';
    
    const browser = await chromium.connect(wsEndpoint, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : undefined
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    // Directory for saving screenshots on the server
    const screenshotDir = '/root/xelitesolutions/api/data/tests/screenshots';
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    try {
        console.log("Navigating to login page...");
        await page.goto('http://127.0.0.1/login', { waitUntil: 'networkidle', timeout: 30000 });
        await page.screenshot({ path: path.join(screenshotDir, '01_login_page.png') });

        console.log("Filling login credentials...");
        await page.fill('input[type="email"]', 'info.auraaluxury@gmail.com');
        await page.fill('input[type="password"]', 'younes2025');
        await page.screenshot({ path: path.join(screenshotDir, '02_credentials_filled.png') });

        console.log("Clicking login submit button...");
        await page.click('button[type="submit"]');

        console.log("Waiting for navigation to dashboard/IDE...");
        await page.waitForTimeout(6000);
        await page.screenshot({ path: path.join(screenshotDir, '03_dashboard_loaded.png') });

        console.log("Locating prompt input...");
        const textarea = page.locator('textarea.main-input');
        await textarea.waitFor({ state: 'visible', timeout: 10000 });

        console.log("Typing prompt: 'من انت؟'...");
        await textarea.fill('من انت؟');
        await page.screenshot({ path: path.join(screenshotDir, '04_prompt_typed.png') });

        console.log("Pressing Enter to send the prompt...");
        await textarea.press('Enter');

        console.log("Waiting for Joe to think and respond (15 seconds)...");
        await page.waitForTimeout(15000);
        await page.screenshot({ path: path.join(screenshotDir, '05_response_received.png') });

        console.log("UI Flow Test completed successfully!");
    } catch (err) {
        console.error("UI Flow Test failed:", err);
    } finally {
        await context.close();
        await browser.close();
    }
}

run().catch(console.error);
