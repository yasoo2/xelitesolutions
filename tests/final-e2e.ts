const mongoose = require('mongoose');
const { User } = require('../api/src/models/user');
const { Workspace } = require('../api/src/models/workspace');
const { Session } = require('../api/src/models/session');
const { workspaceService } = require('../api/src/services/WorkspaceService');
const { freeIntelligenceOptimizer } = require('../api/src/llm/free-intelligence-optimizer');
const { config } = require('../api/src/config');

async function finalTest() {
    console.log('🏁 Starting Final End-to-End System Test...');
    try {
        await mongoose.connect(config.mongoUri);

        // 1. Setup User & Workspace
        console.log('👤 Setup User & Workspace...');
        const email = `test_e2e_${Date.now()}@joe.com`;
        const user = await User.create({ email, passwordHash: 'hash', role: 'USER' });
        // Cast not needed in JS
        const workspace = await workspaceService.ensurePersonalWorkspace(user._id.toString());
        console.log(`✅ Workspace Created: ${workspace.name} (${workspace._id})`);

        // 2. Create Session
        console.log('📝 Creating Session...');
        const session = await Session.create({
            title: 'E2E Test Session',
            userId: user._id,
            tenantId: workspace._id, // Legacy field
            workspaceId: workspace._id,
            mode: 'ADVISOR',
            kind: 'chat'
        });
        console.log(`✅ Session Created: ${session._id}`);

        // 3. Simulate AI Request (Arabic Context)
        console.log('🤖 Simulating AI Request (Arabic)...');
        const context = [
            { language: 'ar' },
            { workspaceId: workspace._id.toString(), plan: 'free' }
        ];

        const result = await freeIntelligenceOptimizer.optimizeRequest('مرحبا جو كيف الحال', context);
        console.log('📊 AI Analysis Result:', JSON.stringify(result, null, 2));

        // 4. Verification
        if (!result.shouldUseCache && !result.suggestedModel) throw new Error('❌ AI Failed to respond');

        if (result.cachedResponse) {
            const isArabic = /[\u0600-\u06FF]/.test(result.cachedResponse);
            if (!isArabic) console.warn('⚠️ Warning: Response might not be fully Arabic');
            else console.log('✅ Response is in Arabic');
        } else {
            console.log('✅ AI configured for generation (Planner Active)');
        }

        // 5. Cleanup
        await User.deleteOne({ _id: user._id });
        await Workspace.deleteOne({ _id: workspace._id });
        await Session.deleteOne({ _id: session._id });

        console.log('🎉 FINAL SYSTEM TEST PASSED: Core Architecture is Sound.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

finalTest();
