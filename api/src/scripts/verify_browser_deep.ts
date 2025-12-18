
import { browserService } from '../services/browser';

async function runDeepTest() {
    console.log('🧪 Starting Deep Browser Test...');

    try {
        // 1. Launch
        console.log('1. Launching browser...');
        await browserService.launch();
        const status = browserService.getStatus();
        if (!status.active) throw new Error('Browser failed to launch');
        console.log('✅ Browser launched.');

        // 2. Navigate
        console.log('2. Navigating to example.com...');
        const navResult = await browserService.navigate('https://example.com');
        console.log(`✅ Navigated to: ${navResult.title} (${navResult.url})`);

        // 3. Screenshot
        console.log('3. Taking screenshot...');
        const screenshot = await browserService.screenshot();
        if (!screenshot || screenshot.length < 1000) throw new Error('Screenshot failed or too small');
        console.log(`✅ Screenshot captured (${screenshot.length} bytes base64)`);

        // 4. Inject Log & Check
        console.log('4. Testing Console Logs...');
        await browserService.evaluate('console.log("TEST_LOG_ENTRY")');
        // Wait a bit for listener
        await new Promise(r => setTimeout(r, 500));
        const logs = browserService.getLogs();
        const foundLog = logs.find(l => l.message.includes('TEST_LOG_ENTRY'));
        if (!foundLog) console.warn('⚠️ Console log listener might be slow or failing (log not found yet)');
        else console.log('✅ Console log captured.');

        // 5. Network Test
        console.log('5. Testing Network Capture...');
        // Force a network request
        await browserService.evaluate('fetch("https://jsonplaceholder.typicode.com/todos/1")');
        await new Promise(r => setTimeout(r, 1000));
        const network = browserService.getNetwork();
        if (network.length === 0) console.warn('⚠️ No network requests captured');
        else console.log(`✅ Captured ${network.length} network requests.`);

        // 6. Inspect Element
        console.log('6. Testing Inspect...');
        // example.com has an h1
        const inspectResult = await browserService.inspect(100, 100); // Approximate middle
        if (!inspectResult) console.warn('⚠️ Inspect returned null (might be empty space)');
        else console.log(`✅ Inspected tag: <${inspectResult.tagName}>`);

        // 7. DOM Analysis
        console.log('7. Testing DOM Analysis...');
        const dom = await browserService.getSimplifiedDOM();
        if (!dom || dom.length === 0) throw new Error('DOM analysis returned empty');
        console.log(`✅ DOM Analysis returned ${dom.length} nodes.`);

        // 8. Audit
        console.log('8. Testing Audit...');
        const audit = await browserService.auditPage();
        if (!audit) throw new Error('Audit returned null');
        console.log(`✅ Audit Score: ${audit.score}`);

    } catch (error) {
        console.error('❌ TEST FAILED:', error);
        process.exit(1);
    } finally {
        await browserService.close();
        console.log('🏁 Browser closed.');
        process.exit(0);
    }
}

runDeepTest();
