import { executeTool } from '../../modules/services/ToolService';
import { AgentOrchestrator } from '../../orchestration/AgentOrchestrator';
import { logger } from '../../shared/utils/logger';

async function testFirewall() {
    console.log('--- Starting Firewall Verification Test ---');

    // 1. Test Direct Bypass (Should Fail)
    console.log('\n[Test 1] Attempting direct tool execution (Bypass)...');
    try {
        await executeTool('echo', { text: 'Bypass attempt' }, { sessionId: 'test-bypass' });
        console.error('❌ FAIL: Direct tool execution was NOT blocked!');
    } catch (error: any) {
        if (error.message.includes('Execution bypass detected')) {
            console.log('✅ PASS: Direct tool execution was blocked by firewall.');
        } else {
            console.error('❌ FAIL: Blocked with unexpected error:', error.message);
        }
    }

    // 2. Test Authorized Execution (Should Pass)
    console.log('\n[Test 2] Attempting authorized execution via Orchestrator...');
    try {
        const orchestrator = new AgentOrchestrator();
        const result = await orchestrator.execute({
            id: 'test-authorized',
            goal: 'Say hello world using the echo tool'
        });
        
        if (result.ok) {
            console.log('✅ PASS: Authorized execution via Orchestrator completed successfully.');
        } else {
            console.error('❌ FAIL: Authorized execution failed:', result.result);
        }
    } catch (error: any) {
        console.error('❌ FAIL: Authorized execution threw error:', error.message);
    }

    console.log('\n--- Firewall Verification Finished ---');
}

testFirewall().catch(err => {
    console.error('Fatal test error:', err);
});
