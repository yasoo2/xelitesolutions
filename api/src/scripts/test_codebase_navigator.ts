
import fetch from 'node-fetch';
import path from 'path';

async function main() {
    const API_URL = 'http://localhost:3000/api/tools/execute';
    const TEST_USER_ID = '507f1f77bcf86cd799439011';

    console.log('🧠 Testing Codebase Navigator...');

    // 1. Indexing
    console.log('\n[1] Indexing src/tools/definitions...');
    const indexPayload = {
        tool: 'codebase_navigator',
        arguments: {
            action: 'index',
            targetDir: path.join(process.cwd(), 'src/tools/definitions')
        }
    };

    try {
        const resIndex = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID },
            body: JSON.stringify(indexPayload)
        });
        const jsonIndex = await resIndex.json();
        console.log('Index Result:', jsonIndex);
    } catch (e) {
        console.error('Indexing Failed:', e);
    }

    // 2. Searching
    console.log('\n[2] Searching for "image generation"...');
    const searchPayload = {
        tool: 'codebase_navigator',
        arguments: {
            action: 'search',
            query: 'How do I generate an image using OpenAI?'
        }
    };

    try {
        const resSearch = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID },
            body: JSON.stringify(searchPayload)
        });
        const jsonSearch = await resSearch.json();
        console.log('Search Results:', JSON.stringify(jsonSearch, null, 2));
    } catch (e) {
        console.error('Search Failed:', e);
    }
}

main();
