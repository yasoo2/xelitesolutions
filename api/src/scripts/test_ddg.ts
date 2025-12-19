
import { search, SafeSearchType } from 'duck-duck-scrape';

async function test() {
    const query = 'اين تقع كايا شهير؟';
    console.log(`Searching for: ${query}`);
    try {
        const res = await search(query, { safeSearch: SafeSearchType.STRICT });
        console.log('Results count:', res.results.length);
        res.results.slice(0, 3).forEach((r, i) => {
            console.log(`\n--- ${i+1} ---`);
            console.log('Title:', r.title);
            console.log('URL:', r.url);
            console.log('Desc:', r.description);
        });
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
