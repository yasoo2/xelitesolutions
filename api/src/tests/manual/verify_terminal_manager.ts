import { TerminalManagerTool, terminals } from '../../modules/tools/definitions/TaskInteractionTools';

async function testTerminalManager() {
    console.log('🚀 Starting TerminalManagerTool verification...');
    const tool = new TerminalManagerTool();
    const id = 'test-terminal';

    // Cleanup if exists
    if (terminals.has(id)) {
        await tool.execute({ action: 'kill', id });
    }

    // 1. Create
    console.log('--- Step 1: Create terminal ---');
    const createRes = await tool.execute({ action: 'create', id });
    if (!createRes.ok) {
        console.error('Create failed:', createRes.error);
        process.exit(1);
    }
    console.log('Terminal created:', createRes.output);

    // 2. Write
    console.log('--- Step 2: Write command ---');
    await tool.execute({ action: 'write', id, command: 'echo JOE_TERMINAL_OK\n' });

    // 3. Read & Verify
    console.log('--- Step 3: Verify output ---');
    let success = false;
    let finalHistory = '';
    
    for (let i = 0; i < 20; i++) {
        const readRes = await tool.execute({ action: 'read', id });
        finalHistory = readRes.output?.history || '';
        if (readRes.ok && finalHistory.includes('JOE_TERMINAL_OK')) {
            success = true;
            break;
        }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 500));
    }
    console.log();

    if (!success) {
        console.error('❌ Verification failed. History did not contain JOE_TERMINAL_OK.');
        console.error('Final History:', finalHistory);
        process.exit(1);
    }
    console.log('✅ Terminal output verified!');

    // 4. Resize (bonus test for the new logs)
    console.log('--- Step 4: Resize test ---');
    await tool.execute({ action: 'resize', id, cols: 100, rows: 40 });

    // 5. Kill
    console.log('--- Step 5: Kill terminal ---');
    const killRes = await tool.execute({ action: 'kill', id });
    if (!killRes.ok) {
        console.error('Kill failed:', killRes.error);
        process.exit(1);
    }
    
    if (terminals.has(id)) {
        console.error('❌ Terminal still exists in map after kill');
        process.exit(1);
    }
    console.log('✅ Terminal killed successfully!');
    console.log('\n✨ ALL TESTS PASSED!');
}

testTerminalManager().catch(err => {
    console.error('❌ Unexpected error during test:', err);
    process.exit(1);
});
