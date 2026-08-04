
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { chromium } from 'playwright';
import path from 'path';

export class BrowserVisionTool extends BaseTool {
    name = 'browser_vision';
    description = 'Open a URL in a real headless browser and capture an actual screenshot of the page (returns the saved image path).';
    version = '1.0.0';
    tags = ['browser', 'vision', 'screenshot'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' },
            width: { type: 'number', default: 1280 },
            height: { type: 'number', default: 720 }
        },
        required: ['url']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            screenshotPath: { type: 'string' },
            base64: { type: 'string' }
        }
    };
    permissions: ToolPermission[] = ['internet', 'read', 'write'];
    sideEffects: ToolPermission[] = ['write'];

    async execute(input: any) {
        // The launch used to happen BEFORE anything was validated and OUTSIDE
        // the try: called with no url it started a real Chromium to visit the
        // string "undefined", and on a machine where Chromium is missing it
        // threw a raw playwright error at the orchestrator instead of an
        // answer. The audit caught both.
        const url = String(input?.url ?? '').trim();
        if (!url) return { ok: false, error: 'browser_vision needs a url to open.', logs: [] };

        let browser: any;
        try {
            browser = await chromium.launch({ headless: true });
        } catch (e: any) {
            return {
                ok: false,
                error: `تعذّر تشغيل المتصفّح: ${String(e?.message || e).slice(0, 200)} — جرّب "npx playwright install chromium".`,
                logs: [],
            };
        }
        const page = await browser.newPage();

        try {
            await page.setViewportSize({ width: input.width || 1280, height: input.height || 720 });
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            const filename = `screenshot_${Date.now()}.png`;
            const outDir = path.join(process.cwd(), 'screenshots');
            // Ensure dir exists
            const fs = require('fs');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            const fullPath = path.join(outDir, filename);
            await page.screenshot({ path: fullPath });

            // For now, we won't return giant base64 to avoid context bloat, just the path
            // If the frontend can serve it, great.

            await browser.close();

            return {
                ok: true,
                output: { screenshotPath: fullPath, message: 'Screenshot captured.' },
                logs: [`screenshot=${url} path=${fullPath}`]
            };
        } catch (e: any) {
            await browser.close();
            return { ok: false, error: e.message, logs: [] };
        }
    }
}
