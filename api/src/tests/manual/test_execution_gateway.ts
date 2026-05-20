
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import { terminalKernel } from '../../modules/terminal/terminal-kernel';

async function runFullTraceTest() {
    console.log('\n--- STARTING COMPOSITE RUNTIME OWNERSHIP TEST ---');
    const sessionId = 'test-trace-' + Date.now();
    
    // 1. One-off Gateway Execution (Tools Flow)
    console.log('\n[TEST 1] FLOW: Gateway -> Kernel -> Spawn');
    const command = 'echo "GW_RUNTIME_TEST"';
    await ExecutionGateway.execute(command, [], { sessionId } as any);
    
    // 2. Interactive PTY Flow (Terminal Flow)
    console.log('\n[TEST 2] FLOW: WS -> Kernel -> PTY -> Kernel -> WS');
    
    // Simulate UI -> WS -> Kernel
    console.log(`[websocket.forward.received] sessionId=${sessionId} ts=${Date.now()} type=terminal_input`);
    console.log(`[websocket.forward.sent] sessionId=${sessionId} ts=${Date.now()} target=kernel`);
    
    // Create actual PTY
    await terminalKernel.createTerminal(sessionId, { shell: 'cmd.exe' }); // using cmd for simple echo on windows
    
    // Send input to PTY
    await terminalKernel.sendInput(sessionId, 'echo "PTY_RUNTIME_TEST"\r\n');
    
    // Wait for output to be emitted and broadcast
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('\n--- COMPOSITE TEST COMPLETE ---');
}

runFullTraceTest().catch(console.error);
