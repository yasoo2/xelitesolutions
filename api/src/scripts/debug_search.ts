
import { executeTool } from '../tools/registry';

async function testSearch() {
    const query = "اين تقع كايا شهير؟";
    console.log(`Testing query: "${query}"`);

    const result = await executeTool('web_search', { query });
    console.log('Result:', JSON.stringify(result, null, 2));
}

testSearch();
