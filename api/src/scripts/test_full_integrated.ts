
import { executeTool } from '../tools/registry';
import { LoggerTool } from '../tools/definitions/LoggerTool';
import { MonitoringTool } from '../tools/definitions/MonitoringTool';
import { ErrorRecoveryTool } from '../tools/definitions/ErrorRecoveryTool';
import { PythonBuilderTool } from '../tools/definitions/PythonBuilderTool';
import { store } from '../mock/store';

// Manually register tools since we are running as a script
import { tools } from '../tools/registry';
if (tools.length === 0) {
    tools.push(new LoggerTool());
    tools.push(new MonitoringTool());
    tools.push(new ErrorRecoveryTool());
    tools.push(new PythonBuilderTool());
}

async function runTest() {
    console.log('🚀 Starting Full System Integration Test...');

    // 1. Test Monitoring (Phase 9.2)
    console.log('\n--- Testing Monitoring ---');
    await executeTool('monitor', {
        action: 'record_metric',
        metric: 'test_execution_count',
        value: 1,
        tags: { env: 'test' }
    });
    console.log('✅ Metric recorded');

    // 2. Test Logging (Phase 9.2)
    console.log('\n--- Testing Logging ---');
    await executeTool('logger', {
        level: 'info',
        message: 'System integration test initiated by User',
        metadata: { source: 'test_script' }
    });
    console.log('✅ Log entry created');

    // 3. Test Multi-Language (Phase 9.4)
    console.log('\n--- Testing Python Builder ---');
    const pyResult = await executeTool('python_builder', {
        action: 'scaffold',
        name: 'test_project_py',
        template: 'flask'
    });
    if (pyResult.ok) console.log('✅ Python project scaffolded');
    else console.error('❌ Python build failed', pyResult);

    // 4. Test Error Recovery & Learning (Phase 9.3 & 10.2)
    console.log('\n--- Testing Error Recovery & Learning ---');
    // Simulate an error that looks like a missing module
    const errorMsg = "Error: Cannot find module 'missing-lib'";

    // First run: Should analyze and suggest fix (and learn it)
    const recovery1 = await executeTool('error_recovery', { error: errorMsg });
    console.log('First Recovery Output:', JSON.stringify(recovery1.output, null, 2));

    if (recovery1.logs.some(l => l.includes('Learned new fix'))) {
        console.log('✅ System LEARNED from error');
    } else {
        console.log('⚠️ System did not report learning (might already know it)');
    }

    console.log('\n--- Test Data Seeding Complete ---');
    console.log('Now verify the Dashboard UI.');
}

runTest().catch(console.error);
