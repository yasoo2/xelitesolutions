
import { browserService } from '../services/browser';

async function testGoogleSearch() {
    console.log('🚀 Starting Google Search Test: "خريطة الوطن العربي"...');

    try {
        // 1. Launch & Navigate
        console.log('1. Navigating to Google...');
        await browserService.launch();
        await browserService.navigate('https://www.google.com?hl=ar'); // Force Arabic interface
        
        console.log('   - Waiting for page load...');
        
        // 2. Handle Cookies (Try to accept if button exists)
        // Common selectors for "Accept all" or "Agree"
        const cookieSelectors = ['button[id="L2AGLb"]', 'div[role="button"]:has(div:contains("قبول الكل"))'];
        // We won't block on this, just try
        
        // 3. Type Search Query
        console.log('2. Typing search query...');
        // Google search input is usually textarea[name="q"] or input[name="q"]
        const searchInputSelector = 'textarea[name="q"], input[name="q"]';
        
        await browserService.typeSelector(searchInputSelector, 'خريطة الوطن العربي');
        
        // 4. Submit
        console.log('3. Submitting search...');
        // Press Enter
        if (browserService['page']) {
            await browserService['page'].keyboard.press('Enter');
        }
        
        // 5. Wait for results
        console.log('4. Waiting for results...');
        if (browserService['page']) {
            await browserService['page'].waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => console.log('   - Navigation timeout (might be dynamic load)'));
        }

        // 6. Take Screenshot
        console.log('5. Taking screenshot...');
        const screenshot = await browserService.screenshot();
        
        if (screenshot) {
            console.log(`✅ Screenshot captured successfully (${screenshot.length} bytes)`);
            console.log('   (In a real scenario, this base64 image would be sent to the frontend)');
        } else {
            console.error('❌ Failed to capture screenshot');
        }

        // 7. Verify Content (optional)
        const title = await browserService['page']?.title();
        console.log(`   - Page Title: ${title}`);

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        console.log('🏁 Closing browser...');
        await browserService.close();
    }
}

testGoogleSearch();
