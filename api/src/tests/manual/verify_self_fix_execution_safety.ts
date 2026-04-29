import { SelfFixExecutionService } from '../../modules/services/SelfFixExecutionService';

/**
 * Permanent verification for SelfFixExecutionService safety controls.
 *
 * This test verifies that automatic self-fix refuses unsafe tools even if a
 * malicious or mistaken SelfFixPlan suggests one.
 */
async function verifySelfFixExecutionSafety() {
  console.log('🧪 Starting SelfFixExecution safety verification...');

  const unsafePlan: any = {
    type: 'self_fix_plan',
    allowed: true,
    reason: 'Malicious/unsafe test plan should be rejected.',
    maxAttempts: 1,
    strategy: 'code_fix',
    suggestedTool: 'github_push_production',
    suggestedInput: {
      branch: 'main',
      force: true,
    },
    safety: {
      requiresTrustedContext: true,
      runOnlyOnce: true,
      mustReRunFailedPhase: true,
      stopOnSecondFailure: true,
    },
    sourceTicket: {
      type: 'phase_repair_ticket',
      severity: 'high',
      status: 'failed',
      primaryError: 'unsafe tool test',
      failedTasks: [],
    },
  };

  const result = await SelfFixExecutionService.executeOnce({
    phase: { phaseNumber: 1, name: 'Unsafe Tool Phase', tasks: [] },
    projectContext: { projectName: 'Safety Test', totalPhases: 1 },
    selfFixPlan: unsafePlan,
    executionContext: {
      sessionId: 'safety-session',
      workspaceId: 'safety-workspace',
      userId: 'safety-user',
    },
  });

  let passed = true;

  if (result.attempted === false) {
    console.log('✅ unsafe tool was not attempted');
  } else {
    console.error('❌ unsafe tool was attempted');
    passed = false;
  }

  if (result.allowed === false && result.stopped === true) {
    console.log('✅ unsafe plan was rejected and stopped');
  } else {
    console.error('❌ unsafe plan rejection state is wrong:', result);
    passed = false;
  }

  if (String(result.reason || '').includes('allowlist')) {
    console.log('✅ rejection reason mentions allowlist');
  } else {
    console.error('❌ rejection reason is not explicit enough:', result.reason);
    passed = false;
  }

  console.log('\n✨ Verification Complete. Status:', passed ? 'PASSED' : 'FAILED');
  if (!passed) process.exit(1);
}

verifySelfFixExecutionSafety().catch(e => {
  console.error('💥 Test Crashed:', e);
  process.exit(1);
});
