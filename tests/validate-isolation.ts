const mongoose = require('mongoose');
const { User } = require('../api/src/models/user');
const { Workspace } = require('../api/src/models/workspace');
const { WorkspaceMember } = require('../api/src/models/workspaceMember');
const { workspaceService } = require('../api/src/services/WorkspaceService');
const { config } = require('../api/src/config');

async function validate() {
    console.log('🧪 Starting Isolation Validation...');
    await mongoose.connect(config.mongoUri);

    // 1. Create Data
    console.log('Creating Test Users...');
    const u1 = await User.create({ email: `u1_${Date.now()}@test.com`, passwordHash: 'hash', role: 'USER' });
    const u2 = await User.create({ email: `u2_${Date.now()}@test.com`, passwordHash: 'hash', role: 'USER' });

    // 2. Create Workspaces
    console.log('Creating Workspaces...');
    const ws1 = await workspaceService.createWorkspace(u1._id.toString(), 'WS1');
    const ws2 = await workspaceService.createWorkspace(u2._id.toString(), 'WS2');

    // 3. Test Isolation: Access Check
    console.log('🔍 Testing Access Control...');

    // U1 should access WS1
    const check1 = await workspaceService.getWorkspace(ws1._id.toString(), u1._id.toString());
    if (!check1) throw new Error('❌ U1 blocked from Own Workspace');
    console.log('✅ U1 accessed WS1');

    // U1 should NOT access WS2
    const check2 = await workspaceService.getWorkspace(ws2._id.toString(), u1._id.toString());
    if (check2) throw new Error('❌ LEAK: U1 accessed WS2!');
    console.log('✅ U1 blocked from WS2');

    // 4. Test Membership Addition
    console.log('➕ Testing Membership...');
    await workspaceService.addMember(u1._id.toString(), ws1._id.toString(), u2.email, 'VIEWER');

    // U2 should now access WS1
    const check3 = await workspaceService.getWorkspace(ws1._id.toString(), u2._id.toString());
    if (!check3) throw new Error('❌ Member U2 check failed');
    console.log('✅ U2 accessed WS1 (after invite)');

    // 5. Clean up
    await User.deleteMany({ _id: { $in: [u1._id, u2._id] } });
    await Workspace.deleteMany({ _id: { $in: [ws1._id, ws2._id] } });
    await WorkspaceMember.deleteMany({ userId: { $in: [u1._id, u2._id] } });

    console.log('🎉 VALIDATION PASSED: Strict Isolation Confirmed.');
    process.exit(0);
}

validate().catch(e => {
    console.error(e);
    process.exit(1);
});
