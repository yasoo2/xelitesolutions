import { tools } from '../tools/registry';

// Mock executeTool for testing outside of full API context if needed, 
// BUT we want to test the registry's executeTool.
// Since registry.ts depends on many things, better to run this via ts-node which loads registry.
// However, registry's `execute` on `task_loop` calls `executeTool`.
// `executeTool` is not exported from registry.ts in my thought process earlier...
// Wait, I put `TaskLoop` inside registry.ts so it calls the internal `executeTool`.
// But to call `TaskLoop` from here, I need to call `tools.find(t=>t.name==='task_loop').execute(...)`.
// This integration test checks if `TaskLoop` can run.

async function main() {
    console.log('♾️  Starting Phase 2 Verification (Recursive Loop)...');

    try {
        const taskLoop = tools.find(t => t.name === 'task_loop');
        if (!taskLoop) throw new Error('Task Loop tool not found in registry!');

        if (!taskLoop.execute) throw new Error('TaskLoop has no execute method');

        console.log('1️⃣  Testing TaskLoop with Echo...');
        const result = await taskLoop.execute({
            goal: 'Verify loop mechanics independent of LLM',
            steps: [
                { name: 'Step 1', tool: 'echo', args: { text: 'Loop Start' } },
                { name: 'Step 2', tool: 'echo', args: { text: 'Loop End' } }
            ]
        });

        console.log('   Result:', JSON.stringify(result, null, 2));

        if (result.ok && result.output.completedSteps === 2) {
            console.log('✅ TaskLoop Verified: Executed multi-step plan.');
        } else {
            console.error('❌ TaskLoop Failed');
            process.exit(1);
        }

        // Visual QA verification typically needs a real image. 
        // We will skip actual GPT-4o-Vision call in this smoke test to save cost/time, 
        // just verify tool existence.
        const visualQA = tools.find(t => t.name === 'visual_qa');
        if (visualQA) {
            console.log('✅ VisualQATool Verified: Registered in system.');
        } else {
            console.error('❌ VisualQATool Failed: Not found in registry.');
            process.exit(1);
        }

        console.log('\n✨ PHASE 2 SYSTEM VERIFIED ✨\n');

    } catch (err) {
        console.error('❌ Verification Error:', err);
        process.exit(1);
    }
}

main();
