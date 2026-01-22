
import mongoose from 'mongoose';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { ToolExecution } from '../models/toolExecution';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function diagnose() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/xelitesolutions');
    console.log('Connected.');

    const sessions = await Session.find().sort({ createdAt: -1 }).limit(10);
    console.log(`\nFound ${sessions.length} sessions (last 10):`);

    for (const s of sessions) {
        const msgCount = await Message.countDocuments({ sessionId: s._id });
        const toolCount = await ToolExecution.countDocuments({ sessionId: s._id });
        console.log(`- Session [${s._id}] Title: "${s.title}" | Messages: ${msgCount} | Tools: ${toolCount} | Created: ${s.createdAt}`);

        if (msgCount > 0) {
            const lastMsg = await Message.findOne({ sessionId: s._id }).sort({ createdAt: -1 });
            console.log(`  Last Message: [${lastMsg?.role}] ${lastMsg?.content?.slice(0, 50)}...`);
        }
    }

    const totalMessages = await Message.countDocuments();
    const totalTools = await ToolExecution.countDocuments();
    console.log(`\nTotal Global Stats:`);
    console.log(`- Total Sessions: ${await Session.countDocuments()}`);
    console.log(`- Total Messages: ${totalMessages}`);
    console.log(`- Total Tools: ${totalTools}`);

    await mongoose.disconnect();
    console.log('\nDone.');
}

diagnose().catch(console.error);
