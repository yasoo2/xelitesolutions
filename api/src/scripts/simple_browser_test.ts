#!/usr/bin/env npx ts-node
/**
 * Simple Browser Session Test
 * Tests browser session creation directly without auth
 */

import { createSession } from '../browser/manager';
import mongoose from 'mongoose';
import { config } from '../config';

async function testBrowserSession() {
    console.log('🧪 Testing Browser Session Creation...\n');

    try {
        // Connect to MongoDB first
        console.log('📦 Connecting to MongoDB...');
        await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
        console.log('✅ MongoDB connected\n');

        // Create a browser session
        console.log('🌐 Creating browser session...');
        const sessionId = 'test-session-' + Date.now();

        const session = await createSession(sessionId);
        console.log(`Session created. ID: ${sessionId}`);
        console.log('📊 Session initialized.');

        // Navigate to a page
        console.log('\n🔗 Navigating to google.com...');
        const page = await session.browser.newPage();
        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
        console.log('✅ Navigation successful');

        // Cleanup
        console.log('\n🧹 Cleaning up...');
        await page.close();
        await session.browser.close();
        await mongoose.disconnect();

        console.log('\n✨ Test completed successfully!');
        console.log('📝 Check /app/src/stream_debug.log for diagnostic logs');

        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testBrowserSession();
