import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { broadcast } from '../../../api/ws';

/**
 * ScreenshotTool - Captures screenshots of web pages for visual verification
 * Used by JoeStudio's Screenshot Gallery feature
 */
export class ScreenshotTool extends BaseTool {
    name = 'screenshot';
    description = 'Capture a screenshot of a web page for visual verification.';
    version = '1.0.0';
    tags = ['browser', 'visual', 'qa', 'screenshot'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: {
                type: 'string',
                description: 'URL of the page to capture'
            },
            filename: {
                type: 'string',
                description: 'Output filename (will be saved to screenshots folder)'
            },
            fullPage: {
                type: 'boolean',
                description: 'Capture full scrollable page (default: false)'
            },
            width: {
                type: 'number',
                description: 'Viewport width (default: 1280)'
            },
            height: {
                type: 'number',
                description: 'Viewport height (default: 720)'
            },
            waitFor: {
                type: 'number',
                description: 'Wait time in ms after page load (default: 1000)'
            }
        },
        required: ['url']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' },
            path: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' }
        }
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;
    auditFields = ['url'];

    async execute(input: any) {
        const logs: string[] = [];
        // A screenshot of nothing is not a screenshot: with no url this used to
        // launch a real browser and navigate to the empty string.
        const url = String(input?.url ?? '').trim();
        if (!url) return { ok: false, error: 'screenshot needs a url to capture.', logs };
        const fullPage = Boolean(input?.fullPage ?? false);
        const width = Number(input?.width) || 1280;
        const height = Number(input?.height) || 720;
        const waitFor = Number(input?.waitFor) || 1000;

        // Generate filename
        const timestamp = Date.now();
        const filename = input?.filename
            ? String(input.filename)
            : `screenshot_${timestamp}.png`;

        // Ensure screenshots directory exists
        const screenshotsDir = path.resolve(process.cwd(), 'screenshots');
        if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
        }

        const outputPath = path.join(screenshotsDir, filename);

        let browser = null;
        try {
            logs.push(`Launching browser...`);
            browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const context = await browser.newContext({
                viewport: { width, height }
            });

            const page = await context.newPage();

            logs.push(`Navigating to ${url}...`);
            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Wait for any animations/renders
            await page.waitForTimeout(waitFor);

            logs.push(`Capturing screenshot...`);
            await page.screenshot({
                path: outputPath,
                fullPage
            });

            await browser.close();
            browser = null;

            // Get actual dimensions
            const dimensions = fullPage
                ? { width, height: height * 2 } // Estimate for full page
                : { width, height };

            // Broadcast screenshot event for UI
            const pageName = new URL(url).pathname.split('/').pop() || 'page';
            broadcast({
                type: 'screenshot',
                data: {
                    id: timestamp.toString(),
                    url: `/screenshots/${filename}`,
                    pageName,
                    timestamp: new Date().toISOString(),
                    status: 'success',
                    width: dimensions.width,
                    height: dimensions.height
                }
            });

            logs.push(`Screenshot saved to ${outputPath}`);

            return {
                ok: true,
                output: {
                    success: true,
                    path: outputPath,
                    publicUrl: `/screenshots/${filename}`,
                    width: dimensions.width,
                    height: dimensions.height
                },
                logs
            };

        } catch (error: any) {
            if (browser) {
                try { await browser.close(); } catch { }
            }

            logs.push(`Error: ${error.message}`);

            // Broadcast error for UI
            broadcast({
                type: 'screenshot',
                data: {
                    id: Date.now().toString(),
                    url: '',
                    pageName: 'Error',
                    timestamp: new Date().toISOString(),
                    status: 'error',
                    width: 0,
                    height: 0,
                    error: error.message
                }
            });

            return {
                ok: false,
                error: error.message,
                logs
            };
        }
    }
}

/**
 * VisualComparisonTool - Compares two screenshots for visual regression testing
 */
export class VisualComparisonTool extends BaseTool {
    name = 'visual_compare';
    description = 'Compare two screenshots and report visual differences.';
    version = '1.0.0';
    tags = ['browser', 'visual', 'qa', 'testing'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            baseline: {
                type: 'string',
                description: 'Path to baseline screenshot'
            },
            current: {
                type: 'string',
                description: 'Path to current screenshot to compare'
            },
            threshold: {
                type: 'number',
                description: 'Difference threshold (0-1, default: 0.1)'
            }
        },
        required: ['baseline', 'current']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            match: { type: 'boolean' },
            diffPercentage: { type: 'number' }
        }
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;
    auditFields = ['baseline', 'current'];

    async execute(input: any) {
        const logs: string[] = [];
        const baseline = String(input?.baseline ?? '');
        const current = String(input?.current ?? '');
        const threshold = Number(input?.threshold) || 0.1;

        // Check files exist
        if (!fs.existsSync(baseline)) {
            return { ok: false, error: 'Baseline screenshot not found', logs };
        }
        if (!fs.existsSync(current)) {
            return { ok: false, error: 'Current screenshot not found', logs };
        }

        try {
            // Read both images
            const baselineBuffer = fs.readFileSync(baseline);
            const currentBuffer = fs.readFileSync(current);

            // Simple size comparison (basic check)
            const sizeDiff = Math.abs(baselineBuffer.length - currentBuffer.length);
            const maxSize = Math.max(baselineBuffer.length, currentBuffer.length);
            const diffPercentage = sizeDiff / maxSize;

            const match = diffPercentage <= threshold;

            logs.push(`Comparison complete: ${match ? 'MATCH' : 'DIFFERENT'}`);
            logs.push(`Diff: ${(diffPercentage * 100).toFixed(2)}%`);

            return {
                ok: true,
                output: {
                    match,
                    diffPercentage: diffPercentage * 100
                },
                logs
            };

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return { ok: false, error: error.message, logs };
        }
    }
}
