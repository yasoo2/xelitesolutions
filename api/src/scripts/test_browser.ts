
import { tools } from '../tools/registry';
import { BrowserRunTool } from '../tools/definitions/BrowserRunTool';

// Manually instantiate to be sure, or find in registry
const browserTool = tools.find(t => t.name === 'browser_run') || new BrowserRunTool();

async function main() {
    console.log('--- Browser Worker Verification ---');

    const sessionId = 'verify-browser-' + Date.now();
    console.log(`Starting browser session: ${sessionId}`);

    try {
        // 1. Open a page
        console.log('Navigating to example.com...');
        const result = await browserTool.execute({
            sessionId,
            instructionText: 'Go to example.com and verify the title',
            actions: [
                { type: 'goto', url: 'https://example.com' }
            ]
        });

        console.log('Browser result:', result.ok ? 'OK' : 'FAILED');
        if (!result.ok) {
            console.error('Error:', result.error);
            console.log('Logs:', result.logs);
            process.exit(1);
        }

        const title = result.output?.title;
        console.log('Page Title:', title);

        if (title && (title.includes('Example') || title.includes('Domain'))) {
            console.log('✅ Browser navigation successful.');
        } else {
            console.error('❌ Unexpected title:', title);
        }

        // 2. Check for screenshot
        if (result.output?.screenshotHref) {
            console.log('✅ Screenshot generated:', result.output.screenshotHref);
        } else {
            console.warn('⚠️ No screenshot returned.');
        }

    } catch (e: any) {
        console.error('❌ Browser test exception:', e.message);
        process.exit(1);
    }
}

main().catch(console.error);
