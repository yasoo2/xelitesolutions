import mongoose from 'mongoose';
import { User } from '../api/src/models/user';
import { workspaceService } from '../api/src/services/WorkspaceService';
import { config } from '../api/src/config';

async function migrate() {
    console.log('🔌 Connecting to DB...');
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected.');

    const users = await User.find({});
    console.log(`📊 Found ${users.length} users to migrate.`);

    for (const user of users) {
        try {
            console.log(`Processing user: ${user.email} (${user._id})`);
            const ws = await workspaceService.ensurePersonalWorkspace(user._id.toString());
            console.log(`  -> Workspace: ${ws.name} (${ws.slug})`);
        } catch (e: any) {
            console.error(`  ❌ Failed: ${e.message}`);
        }
    }

    console.log('🏁 Migration Complete.');
    process.exit(0);
}

migrate().catch(e => {
    console.error(e);
    process.exit(1);
});
