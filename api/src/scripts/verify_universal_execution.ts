
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { TaskExecutor } from '../agents/TaskExecutor';
import { TaskStep } from '../agents/TaskExecutor';

async function verifyUniversalExecution() {
    console.log('🚀 Verifying Universal Tool Execution (Registry Integration)...\n');

    const rootDir = path.resolve(__dirname, '../../..'); // Repo root
    const executor = new TaskExecutor(rootDir);

    // precision-crafted steps that use tools NOT previously hardcoded in TaskExecutor
    const steps: TaskStep[] = [
        {
            name: 'Discovery',
            tool: 'echo', // Just to prove basic works
            args: { text: 'Starting Enterprise Audit...' }
        },
        {
            name: 'Market Research',
            tool: 'knowledge_search', // NEW (Knowledge)
            args: { query: 'best practices for docker security' }
        },
        // {
        //    name: 'Security Audit',
        //    tool: 'security_scanner', // NEW (Quality) - Note: In registry it is 'security_scanner', let's check definition
        //    args: { files: ['api/src/index.ts', 'api/src/agents/TaskExecutor.ts'], projectPath: rootDir }
        // }
    ];

    // Let's verify 'grep_search' which is definitely in registry
    steps.push({
        name: 'Code Analysis',
        tool: 'grep_search', // NEW (System/Analysis)
        args: { query: 'Universal Tool Execution', path: 'api/src', include: '*.ts' }
    });

    console.log(`📋 Plan: ${steps.length} steps using Enterprise Tools.`);

    for (const step of steps) {
        console.log(`\n▶️  Executing: ${step.name} [Tool: ${step.tool}]`);
        const result = await executor.executeStep(step);

        if (result.success) {
            console.log(`   ✅ Success! Output length: ${result.output.length} chars`);
            // console.log(`   Output: ${result.output.substring(0, 100)}...`);
        } else {
            console.error(`   ❌ Failed: ${result.output}`);
        }
    }
}

verifyUniversalExecution();
