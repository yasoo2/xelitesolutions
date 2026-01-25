
// import fetch from 'node-fetch'; // Use global fetch in Node 18+

async function prove() {
    console.log('🕵️‍♀️ Monitoring Brain Growth via API (Living System)...');

    // 1. Snapshot Start
    const getStats = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/system/brain/stats');
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch {
                return { error: 'Invalid JSON', raw: text };
            }
        } catch (e) {
            return { error: e.message };
        }
    };

    const start = await getStats();
    console.log('[T=0s] Response:', start);

    if (!start.reflexCount) {
        return;
    }

    console.log('⏳ Waiting 40 seconds for next training cycle...');
    await new Promise(r => setTimeout(r, 40000));

    // 2. Snapshot End
    const end = await getStats();
    console.log('[T=40s] Response:', end);

    const growth = end.reflexCount - start.reflexCount;
    if (growth > 0) {
        console.log(`✅ PROOF POSITIVE: Living System learned ${growth} new reflexes.`);
    } else {
        console.log('❌ NO GROWTH.');
    }
}

prove().catch(console.error);
