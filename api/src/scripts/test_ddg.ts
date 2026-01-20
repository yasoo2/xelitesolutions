
import { callLLM } from '../llm';

async function main() {
    process.env.LLM_PROVIDER = 'ddg';
    console.log('Testing DuckDuckGo Provider (Proxy)...');
    try {
        const response = await callLLM('Hello! Are you running on DuckDuckGo? Respond with YES or NO.');
        console.log('Response:', response);
    } catch (e) {
        console.error('Test Failed:', e);
    }
}

main();
