import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent verification for checkpoint resumption.
 *
 * This proves the native pipeline can:
 * - save checkpoints after each tool execution
 * - resume from checkpoints when re-running a phase
 * - skip already-completed tasks on resumption
 * - complete the phase successfully on resumption
 */
async function verifyCheckpointResumption() {
  console.log('Starting checkpoint resumption verification...');

  process.env.JOE_PRO_ALPHA = '1';
  process.env.OFFLINE_MODE = 'true';
  process.env.AUTO_APPROVE_ALL = '1';

  const projectsRoot = path.join(process.cwd(), 'data/tests/checkpoint_resumption');
  process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(projectsRoot, { recursive: true });

  const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

  const sessionId = 'test-session-' + Date.now();
  const workspaceId = 'test-checkpoint-resumption-workspace';
  const userId = 'test-user';
  const testWorkspacePath = path.join(projectsRoot, workspaceId);
  const srcDir = path.join(testWorkspacePath, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  // Create a simple verification script that fails on first run
  const verifyPath = path.join(testWorkspacePath, 'verify-build.js');
  const counterPath = path.join(testWorkspacePath, 'counter.txt');
  
  // Initialize counter
  fs.writeFileSync(counterPath, '0', 'utf-8');

  fs.writeFileSync(
    verifyPath,
    [
      "const fs = require('fs');",
      `const counterPath = '${counterPath.replace(/\\/g, '\\\\')}';`,
      "let count = parseInt(fs.readFileSync(counterPath, 'utf8') || '0', 10);",
      "count++;",
      "fs.writeFileSync(counterPath, String(count), 'utf8');",
      "if (count === 1) {",
      "  console.error('EVIDENCE_BLOCKER: Simulated failure on first run');",
      "  process.exit(1);",
      "}",
      "console.log('Success on run', count);",
    ].join('\n'),
    'utf-8',
  );

  const plannerResult = {
    ok: true,
    output: {
      projectName: 'Checkpoint Resumption Test',
      totalPhases: 1,
      phases: [
        {
          phaseNumber: 1,
          name: 'Multi-task Phase',
          tasks: [
            {
              task: 'Task 1 - First task',
              tool: 'shell_execute',
              args: { command: 'echo "Task 1 complete"' },
              priority: 'high',
            },
            {
              task: 'Task 2 - Second task (will fail first run)',
              tool: 'shell_execute',
              args: { command: 'node verify-build.js' },
            },
            {
              task: 'Task 3 - Third task',
              tool: 'shell_execute',
              args: { command: 'echo "Task 3 complete"' },
              priority: 'high',
            },
          ],
        },
      ],
    },
  };

  // First run - should fail at Task 2
  const result1: any = await (AgentLoopService as any).runPlannedPhasesIfPresent({
    sessionId,
    runId: 'test-checkpoint-resumption-run',
    userId,
    workspaceId,
    plannerResult,
  });

  let passed = true;
  const firstPhaseResult = result1.results?.[0];

  console.log('--- First Run Results ---');
  console.log('OK:', result1.ok);
  console.log('Completed Phases:', result1.completedPhases);
  console.log('Phase Status:', firstPhaseResult?.status);
  console.log('Tasks:', firstPhaseResult?.results?.map((r: any) => ({ task: r.task, ok: r.ok, execution: r.execution })));

  // Verify first run failed at Task 2
  if (result1.ok === false && firstPhaseResult?.status === 'partial') {
    console.log('PASS: First run failed at Task 2 as expected');
  } else {
    console.error('FAIL: First run should have failed at Task 2');
    console.error('  result1.ok:', result1.ok);
    console.error('  firstPhaseResult.status:', firstPhaseResult?.status);
    passed = false;
  }

  // Verify checkpoints were created
  const checkpointDir = path.join(testWorkspacePath, '.engineering-checkpoints');
  if (fs.existsSync(checkpointDir)) {
    const checkpointFiles = fs.readdirSync(checkpointDir).filter(f => f.endsWith('.json'));
    console.log(`Checkpoint files created: ${checkpointFiles.length}`);
    if (checkpointFiles.length >= 2) {
      console.log('PASS: Checkpoints created for completed tasks');
    } else {
      console.error('FAIL: Expected at least 2 checkpoint files');
      passed = false;
    }
  } else {
    console.error('FAIL: Checkpoint directory not found');
    passed = false;
  }

  // Second run - should resume and skip Task 1, succeed at Task 2, then run Task 3
  console.log('\n--- Second Run (Resumption) ---');
  const result2: any = await (AgentLoopService as any).runPlannedPhasesIfPresent({
    sessionId,
    runId: 'test-checkpoint-resumption-run', // Same runId for resumption
    userId,
    workspaceId,
    plannerResult,
  });

  const secondPhaseResult = result2.results?.[0];

  console.log('OK:', result2.ok);
  console.log('Completed Phases:', result2.completedPhases);
  console.log('Phase Status:', secondPhaseResult?.status);
  console.log('Tasks:', secondPhaseResult?.results?.map((r: any) => ({ task: r.task, ok: r.ok, execution: r.execution })));

  // Verify second run succeeded
  if (result2.ok === true && result2.completedPhases === 1 && secondPhaseResult?.status === 'completed') {
    console.log('PASS: Second run completed successfully');
  } else {
    console.error('FAIL: Second run should have completed successfully');
    passed = false;
  }

  // Verify Task 1 was skipped (reused from checkpoint)
  const task1Result = secondPhaseResult?.results?.find((r: any) => r.task?.includes('Task 1'));
  if (task1Result && task1Result.execution === 'reused') {
    console.log('PASS: Task 1 skipped (resumed from checkpoint)');
  } else {
    console.error('FAIL: Task 1 should have been skipped (reused)');
    console.error('  Task 1 result:', task1Result);
    passed = false;
  }

  // Verify Task 2 ran and succeeded
  const task2Result = secondPhaseResult?.results?.find((r: any) => r.task?.includes('Task 2'));
  if (task2Result && task2Result.execution === 'ran' && task2Result.ok === true) {
    console.log('PASS: Task 2 ran and succeeded on resumption');
  } else {
    console.error('FAIL: Task 2 should have run and succeeded');
    console.error('  Task 2 result:', task2Result);
    passed = false;
  }

  // Verify Task 3 ran and succeeded
  const task3Result = secondPhaseResult?.results?.find((r: any) => r.task?.includes('Task 3'));
  if (task3Result && task3Result.execution === 'ran' && task3Result.ok === true) {
    console.log('PASS: Task 3 ran and succeeded');
  } else {
    console.error('FAIL: Task 3 should have run and succeeded');
    console.error('  Task 3 result:', task3Result);
    passed = false;
  }

  console.log('\nVerification Complete. Status:', passed ? 'PASSED' : 'FAILED');
  if (!passed) process.exit(1);
  process.exit(0);
}

verifyCheckpointResumption().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});