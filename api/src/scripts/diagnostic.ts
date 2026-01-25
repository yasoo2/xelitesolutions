
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Fix module resolution for local imports
import { planNextStep } from '../llm';

async function test() {
    console.info('🚀 Starting System Diagnostic...');

    const messages = [
        { role: 'user', content: 'ابني لي صفحة هبوط فخمة لشركة شحن' }
    ];

    try {
        console.info('Testing planNextStep with "build page" query...');
        const result = await planNextStep(messages as any, { provider: 'auto' });
        console.info('Result:', JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error('Test Failed:', e.stack || e.message);
    }
}

test().catch(console.error);
