
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import { routeToModel, MODELS } from '../llm/intelligent-router';

async function testMesh() {
    console.log('--- AI MESH DIAGNOSTIC ---');
    console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'Set' : 'MISSING');
    console.log('OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? 'Set' : 'MISSING');
    console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'MISSING');

    const messages = [{ role: 'user', content: 'Build a simple login page in React.' }];

    // Test Providers
    const providers = ['Groq (Free)', 'OpenRouter (Free)', 'Pollinations (Backup)'];

    for (const p of providers) {
        console.log(`\nTesting ${p}...`);
        try {
            // Mocking the loop logic
            let result = "";
            if (p === 'Groq (Free)' && process.env.GROQ_API_KEY) {
                const { callGroq } = require('../llm/intelligent-router');
                result = await callGroq('llama-3.1-70b-versatile', messages);
            } else if (p === 'OpenRouter (Free)' && process.env.OPENROUTER_API_KEY) {
                const { openRouterProvider } = require('../llm');
                result = await openRouterProvider.chatComplete(messages, 'google/gemma-2-9b-it:free');
            } else if (p === 'Pollinations (Backup)') {
                const { pollinationsProvider } = require('../llm');
                result = await pollinationsProvider.chatComplete(messages, 'openai');
            } else {
                console.log(`Skipping ${p} (Needs key)`);
                continue;
            }

            if (result) {
                console.log(`✅ ${p} responded with ${result.length} characters.`);
                console.log(`Preview: "${result.substring(0, 100)}..."`);
            } else {
                console.error(`❌ ${p} returned empty response.`);
            }
        } catch (e: any) {
            console.error(`❌ ${p} failed: ${e.message}`);
        }
    }
}

testMesh();
