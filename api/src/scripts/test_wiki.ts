
async function testWiki(query: string) {
    console.log(`\nTesting Wiki Query: "${query}"`);
    const lang = 'ar';
    const wurl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
    
    try {
        const r = await fetch(wurl);
        const j = await r.json();
        const results = (j.query?.search || []).map((it: any) => ({
            title: it.title,
            snippet: String(it.snippet).replace(/<[^>]+>/g, '')
        }));
        
        console.log(`Found ${results.length} results:`);
        results.forEach((r: any, i: number) => {
            console.log(`${i+1}. [${r.title}]: ${r.snippet.slice(0, 100)}...`);
        });
    } catch (e) {
        console.error('Wiki Error:', e);
    }
}

async function run() {
    await testWiki("اين تقع كايا شهير");
    await testWiki("كايا شهير");
    await testWiki('"كايا شهير"'); // With quotes
}

run();
