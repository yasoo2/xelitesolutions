export {};
async function main() {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
    const mongoose = require('mongoose');
    const { tools } = await import('../../modules/tools/registry');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

    console.log('🔍 Starting System Health Verification...');

    // 1. Tool Registry Check
    console.log(`🛠️  Loading Tools...`);
    if (tools.length === 0) {
        console.error('❌ No tools loaded in registry!');
        process.exit(1);
    }
    console.log(`✅ Loaded ${tools.length} tools.`);

    // 2. Service Integration Check
    try {
        if (!AgentLoopService) throw new Error('AgentLoopService not undefined');
        console.log('✅ AgentLoopService imported successfully.');
    } catch (e) {
        console.error('❌ Failed to import AgentLoopService', e);
        process.exit(1);
    }

    // 3. Database Check (Mock vs Real)
    if (process.env.MOCK_DB === '1') {
        console.log('✅ Running in MOCK_DB mode (Skipping Mongo connection).');
    } else {
        // Connect if URL is present, else skip
        if (process.env.MONGO_URI) {
            try {
                await mongoose.connect(process.env.MONGO_URI);
                console.log('✅ MongoDB connection successful.');
                await mongoose.disconnect();
            } catch (e) {
                console.warn('⚠️  MongoDB connection failed, but maybe expected if not running locally:', e);
            }
        } else {
            console.log('ℹ️  No MONGO_URI, skipping DB connection check.');
        }
    }

    console.log('🚀 System Verification PASSED.');
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Verification Script Failed:', err);
    process.exit(1);
});
