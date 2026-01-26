
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { BrowserRunTool } from '../../tools/definitions/BrowserRunTool';
import { Session } from '../../models/session'; // Assuming model path

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function verify() {
    console.log('🧪 Starting Verification Suite...');

    // 1. Verify DB & Delete Logic
    console.log('\n--- 1. Verifying Session Deletion Logic ---');
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/joe';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri);
        }

        // Create dummy session
        const userId = 'verify_user_' + Date.now();
        const session = await Session.create({
            kind: 'agent',
            title: 'Verify Fixes Test',
            userId: 'test-user',
            messages: []
        } as any);
        console.log(`Created dummy session: ${(session as any)._id}`);

        // Verify it exists
        const check = await Session.findById((session as any)._id);
        if (!check) throw new Error('Session not found in DB');
        console.log('DB Check passed.');

        // Add a message
        await Session.findByIdAndUpdate((session as any)._id, {
            $push: { messages: { role: 'user', content: 'test msg' } }
        });

        // Delete
        console.log('Deleting sessions for user...');
        await Session.deleteMany({ userId });

        // Verify deletion
        const check2 = await Session.findById((session as any)._id);
        if (check2) throw new Error('Session WAS NOT DELETED! Security Risk?');
        console.log('✅ Session Deletion Logic Passed (Backend)');

    } catch (e: any) {
        console.error('❌ DB Verification Failed:', e.message);
    }

    // 2. Verify Browser DNS & Scroll
    console.log('\n--- 2. Verifying Browser DNS & Scroll ---');
    try {
        const tool = new BrowserRunTool();
        const sessionId = 'verify-browser-' + Date.now();

        console.log('Navigating to google.com (Testing connection & DNS)...');
        const res1 = await tool.execute({
            sessionId,
            actions: [{ type: 'goto', url: 'https://google.com', waitUntil: 'domcontentloaded' }]
        });

        if (!res1.ok) {
            console.error('❌ Navigation Failed:', res1.error, res1.output?.summary);
            // Check for DNS specific error
            if (String(res1.output?.summary).includes('dns_failed')) {
                console.error('CRITICAL: DNS Resolution is failing in container.');
            }
        } else {
            console.log('✅ Navigation Successful. DNS verified.');
            console.log('Page Title:', res1.output?.title);

            // Test Scroll Action (Backend handling)
            console.log('Testing Scroll Action...');
            const res2 = await tool.execute({
                sessionId,
                actions: [{ type: 'scroll', direction: 'down', amount: 500 }]
            });

            if (!res2.ok) {
                console.error('❌ Scroll Action Failed:', res2.error);
            } else {
                console.log('✅ Scroll Action Executed (Backend accepted it).');
            }
        }

    } catch (e: any) {
        console.error('❌ Browser Verification Failed:', e);
    }

    console.log('\n--- Verification Complete ---');
    process.exit(0);
}

verify();
