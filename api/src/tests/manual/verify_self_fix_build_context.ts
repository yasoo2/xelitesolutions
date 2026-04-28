import { SelfFixService } from '../../modules/services/SelfFixService';

/**
 * Permanent verification for SelfFixService build/TypeScript context extraction.
 *
 * This does not execute repairs. It verifies that a TypeScript/build error is
 * converted into a targeted self-fix plan with file/line/column/code context.
 */
function verifySelfFixBuildContext() {
  console.log('🧪 Starting SelfFix buildContext verification...');

  const ticket: any = {
    type: 'phase_repair_ticket',
    status: 'partial',
    severity: 'high',
    primaryError: "src/App.tsx(14,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    failedTasks: [
      {
        task: 'Run TypeScript build',
        tool: 'shell_execute',
        ok: false,
        error: "src/App.tsx(14,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      },
    ],
    retryPolicy: { maxRepairAttempts: 1 },
  };

  const plan = SelfFixService.plan(ticket);
  const buildContext = plan.suggestedInput?.buildContext as any;

  let passed = true;

  if (plan.allowed === true && plan.strategy === 'build_fix') {
    console.log('✅ build_fix plan generated');
  } else {
    console.error('❌ Expected allowed build_fix plan, got:', plan.strategy, plan.allowed);
    passed = false;
  }

  if (plan.suggestedTool === 'ai_write_file') {
    console.log('✅ suggestedTool is ai_write_file');
  } else {
    console.error('❌ Expected ai_write_file, got:', plan.suggestedTool);
    passed = false;
  }

  if (
    buildContext?.file === 'src/App.tsx' &&
    buildContext?.line === 14 &&
    buildContext?.column === 7 &&
    buildContext?.code === 'TS2322'
  ) {
    console.log('✅ buildContext extracted correctly:', buildContext);
  } else {
    console.error('❌ buildContext extraction failed:', buildContext);
    passed = false;
  }

  const instruction = String(plan.suggestedInput?.instruction || '');
  if (instruction.includes('Patch only the file identified in buildContext')) {
    console.log('✅ targeted repair instruction generated');
  } else {
    console.error('❌ targeted instruction missing:', instruction);
    passed = false;
  }

  console.log('\n✨ Verification Complete. Status:', passed ? 'PASSED' : 'FAILED');
  if (!passed) process.exit(1);
}

verifySelfFixBuildContext();
