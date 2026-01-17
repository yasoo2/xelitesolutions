#!/usr/bin/env npx ts-node
/**
 * Comprehensive Joe Browser Test
 * Tests actual browser functionality on remote server
 */

import { chromium } from 'playwright';

async function testBrowserWorker() {
    console.log('🧪 Comprehensive Browser Worker Test\n');
    console.log('=' + '='.repeat(50) + '\n');

    const wsEndpoint = 'ws://localhost:5050/ws';
    console.log(`🔗 Connecting to browser worker at: ${wsEndpoint}\n`);

    try {
        // Connect to browser worker
        const browser = await chromium.connect(wsEndpoint);
        console.log('✅ Successfully connected to browser worker!\n');

        // Create context and page
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        const page = await context.newPage();
        console.log('✅ Created browser context and page\n');

        // Test 1: Navigate to Google
        console.log('📍 Test 1: Navigating to Google...');
        await page.goto('https://www.google.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        const googleTitle = await page.title();
        console.log(`   ✅ Page loaded: "${googleTitle}"`);
        console.log(`   🌐 URL: ${page.url()}\n`);

        // Test 2: Navigate to local site
        console.log('📍 Test 2: Navigating to xelitesolutions.com...');
        await page.goto('https://xelitesolutions.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        const siteTitle = await page.title();
        console.log(`   ✅ Page loaded: "${siteTitle}"`);
        console.log(`   🌐 URL: ${page.url()}\n`);

        // Test 3: Take screenshot
        console.log('📸 Test 3: Taking screenshot...');
        const screenshot = await page.screenshot({
            type: 'jpeg',
            quality: 80
        });
        console.log(`   ✅ Screenshot captured (${(screenshot.length / 1024).toFixed(2)} KB)\n`);

        // Test 4: Check for console errors
        console.log('📋 Test 4: Checking for console errors...');
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        // Reload page to catch errors
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        if (errors.length > 0) {
            console.log(`   ⚠️  Found ${errors.length} console errors:`);
            errors.forEach((err, i) => {
                console.log(`      ${i + 1}. ${err.substring(0, 100)}`);
            });
        } else {
            console.log('   ✅ No console errors detected\n');
        }

        // Test 5: Test interaction
        console.log('📍 Test 5: Testing page interaction...');
        await page.goto('https://www.google.com');
        const searchBox = await page.$('textarea[name="q"], input[name="q"]');
        if (searchBox) {
            await searchBox.fill('Joe AI Assistant');
            console.log('   ✅ Successfully typed in search box');
            await page.keyboard.press('Enter');
            await page.waitForLoadState('domcontentloaded');
            console.log('   ✅ Search executed successfully\n');
        }

        // Cleanup
        await context.close();
        await browser.close();

        console.log('=' + '='.repeat(50));
        console.log('🎉 All Tests PASSED!');
        console.log('✨ Browser worker is functioning correctly\n');

        process.exit(0);

    } catch (error: any) {
        console.error('\n❌ TEST FAILED!');
        console.error('Error:', error.message);
        console.error('\nStack:', error.stack);

        console.log('\n🔍 Debugging Info:');
        console.log('- Check if browser-worker is running');
        console.log('- Verify ws://localhost:5050/ws is accessible');
        console.log('- Check browser-worker logs');

        process.exit(1);
    }
}

testBrowserWorker();
