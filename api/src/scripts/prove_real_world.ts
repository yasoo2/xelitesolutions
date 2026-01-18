
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { TaskExecutor } from '../agents/TaskExecutor';
import { TaskStep } from '../agents/TaskExecutor';
import fs from 'fs';
import os from 'os';

async function proveRealWorld() {
    console.log('🦅 Operation: Real World Proof\n');

    const rootDir = path.resolve(__dirname, '../../..');
    const homeDir = os.homedir();
    const desktopPath = path.join(homeDir, 'Desktop');
    const proofFile = 'JOE_WAS_HERE.txt';

    const targetPath = path.join(desktopPath, proofFile);

    console.log(`   Targeting: ${targetPath}`);

    const executor = new TaskExecutor(rootDir);

    const step: TaskStep = {
        name: "Leave Mark",
        tool: "file_write",
        args: {
            path: targetPath,
            content: `
Hello Younis! 👋

This file was created by Joe (Your AI Agent) on ${new Date().toLocaleString()}.

I am running from: ${rootDir}
I have successfully broken out of the simulation to touch your Desktop.

We are ready to build great things.
`
        }
    };

    console.log(`\n👉 Executing: ${step.name} [${step.tool}]`);
    try {
        const result = await executor.executeStep(step);
        if (result.success) {
            console.log(`   ✅ Success! Check your Desktop.`);
        } else {
            console.error(`   ❌ Failed to write to Desktop (likely Permissions).`);
            console.error(`   Error: ${result.output}`);

            // Fallback to root
            console.log(`\n   ⚠️  Falling back to Workspace Root...`);
            step.args.path = path.join(rootDir, proofFile);
            const result2 = await executor.executeStep(step);
            if (result2.success) {
                console.log(`   ✅ Success! Check your Project Root: ${step.args.path}`);
            }
        }
    } catch (e: any) {
        console.error(`   💥 CRITICAL ERROR: ${e.message}`);
    }
}

proveRealWorld();
