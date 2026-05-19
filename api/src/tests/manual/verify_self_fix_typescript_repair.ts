import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent verification for targeted TypeScript/build self-fix execution.
 *
 * This proves the native pipeline can:
 * - read buildContext from a TypeScript-style error,
 * - choose a narrow file_edit repair,
 * - patch only the targeted file,
 * - rerun the same failed phase,
 * - pass only when the phase returns status === "completed".
 */
async function verifySelfFixTypeScriptRepair() {
  console.log('Starting TypeScript self-fix repair verification...');

  process.env.JOE_PRO_ALPHA = '1';
  process.env.OFFLINE_MODE = 'true';

  const projectsRoot = path.join(process.cwd(), 'data/tests/typescript_repair');
  process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(projectsRoot, { recursive: true });

  const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

  const sessionId = 'test-session-' + Date.now();
  const workspaceId = 'test-typescript-repair-workspace';
  const userId = 'test-user';
  const testWorkspacePath = path.join(projectsRoot, workspaceId);
  const srcDir = path.join(testWorkspacePath, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const appPath = path.join(srcDir, 'App.tsx');
  const untouchedPath = path.join(srcDir, 'Untouched.ts');
  const verifyPath = path.join(testWorkspacePath, 'verify-build.js');

  fs.writeFileSync(appPath, 'const answer: number = "42";\nexport default answer;\n', 'utf-8');
  fs.writeFileSync(untouchedPath, 'export const untouched = true;\n', 'utf-8');
  fs.writeFileSync(
    verifyPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/App.tsx', 'utf8');",
      "if (app.includes('= \"42\"')) {",
      "  console.error('src/App.tsx(1,7): error TS2322: Type \\'string\\' is not assignable to type \\'number\\'.');",
      "  console.error('const answer: number = \"42\";');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('= 42;')) {",
      "  console.error('src/App.tsx(1,7): error TS2322: TypeScript repair did not produce a numeric assignment.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );

  const untouchedBefore = fs.readFileSync(untouchedPath, 'utf-8');

  const plannerResult = {
    ok: true,
    output: {
      projectName: 'TypeScript Repair Test',
      totalPhases: 1,
      phases: [
        {
          phaseNumber: 1,
          name: 'TypeScript Build Phase',
          tasks: [
            {
              task: 'Run TypeScript build verification',
              tool: 'shell_execute',
              args: {
                command: 'node verify-build.js',
              },
              required: true,
              priority: 'high',
            },
          ],
        },
      ],
    },
  };

  const result: any = await (AgentLoopService as any).runPlannedPhasesIfPresent({
    sessionId,
    runId: 'test-typescript-repair-run',
    userId,
    workspaceId,
    plannerResult,
  });

  let passed = true;
  const appAfter = fs.readFileSync(appPath, 'utf-8');
  const untouchedAfter = fs.readFileSync(untouchedPath, 'utf-8');
  const firstPhaseResult = result.results?.[0];

  if (result.ok === true && result.completedPhases === 1 && firstPhaseResult?.status === 'completed') {
    console.log('PASS: pipeline completed after targeted TypeScript repair');
  } else {
    console.error('FAIL: pipeline did not complete after repair:', result);
    passed = false;
  }

  if (firstPhaseResult?.selfFixPlan?.strategy === 'build_fix' && firstPhaseResult?.selfFixPlan?.suggestedTool === 'file_edit') {
    console.log('PASS: build_fix selected file_edit');
  } else {
    console.error('FAIL: expected build_fix file_edit plan:', firstPhaseResult?.selfFixPlan);
    passed = false;
  }

  if (firstPhaseResult?.selfFixExecution?.ok === true && firstPhaseResult?.selfFixExecution?.repairTool === 'file_edit') {
    console.log('PASS: selfFixExecution used file_edit and rerun succeeded');
  } else {
    console.error('FAIL: selfFixExecution did not succeed with file_edit:', firstPhaseResult?.selfFixExecution);
    passed = false;
  }

  if (appAfter.includes('const answer: number = 42;') && !appAfter.includes('"42"')) {
    console.log('PASS: targeted file was patched');
  } else {
    console.error('FAIL: targeted file was not patched as expected:', appAfter);
    passed = false;
  }

  if (untouchedAfter === untouchedBefore) {
    console.log('PASS: unrelated file was not changed');
  } else {
    console.error('FAIL: unrelated file changed');
    passed = false;
  }

  console.log('\nVerification Complete. Status:', passed ? 'PASSED' : 'FAILED');
  if (!passed) process.exit(1);
  process.exit(0);
}

verifySelfFixTypeScriptRepair().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
