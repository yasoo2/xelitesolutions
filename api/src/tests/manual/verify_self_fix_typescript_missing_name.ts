import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent verification for targeted TS2304 self-fix execution.
 *
 * This proves the native pipeline can:
 * - read buildContext from a TS2304 Cannot find name error,
 * - choose a narrow file_edit repair,
 * - patch only the targeted file,
 * - rerun the same failed phase,
 * - pass only when the phase returns status === "completed".
 */
async function verifySelfFixTypeScriptMissingName() {
  console.log('Starting TS2304 missing-name self-fix verification...');

  process.env.JOE_PRO_ALPHA = '1';
  process.env.OFFLINE_MODE = 'true';

  const projectsRoot = path.join(process.cwd(), 'data/tests/typescript_missing_name');
  process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(projectsRoot, { recursive: true });

  const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

  const sessionId = 'test-session-' + Date.now();
  const workspaceId = 'test-typescript-missing-name-workspace';
  const userId = 'test-user';
  const testWorkspacePath = path.join(projectsRoot, workspaceId);
  const srcDir = path.join(testWorkspacePath, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const appPath = path.join(srcDir, 'App.ts');
  const untouchedPath = path.join(srcDir, 'Untouched.ts');
  const verifyPath = path.join(testWorkspacePath, 'verify-build.js');

  fs.writeFileSync(appPath, 'export function getAnswer() {\n  return answer;\n}\n', 'utf-8');
  fs.writeFileSync(untouchedPath, 'export const untouched = true;\n', 'utf-8');
  fs.writeFileSync(
    verifyPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/App.ts', 'utf8');",
      "if (!app.includes('const answer = 42;')) {",
      "  console.error(\"src/App.ts(2,10): error TS2304: Cannot find name 'answer'.\");",
      "  console.error('  return answer;');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('return answer;')) {",
      "  console.error('src/App.ts(2,10): error TS2304: return statement was damaged.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );

  const untouchedBefore = fs.readFileSync(untouchedPath, 'utf-8');

  const plannerResult = {
    ok: true,
    output: {
      projectName: 'TypeScript Missing Name Repair Test',
      totalPhases: 1,
      phases: [
        {
          phaseNumber: 1,
          name: 'TypeScript Missing Name Build Phase',
          tasks: [
            {
              task: 'Run TS2304 verification',
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
    runId: 'test-typescript-missing-name-run',
    userId,
    workspaceId,
    plannerResult,
  });

  let passed = true;
  const appAfter = fs.readFileSync(appPath, 'utf-8');
  const untouchedAfter = fs.readFileSync(untouchedPath, 'utf-8');
  const firstPhaseResult = result.results?.[0];

  if (result.ok === true && result.completedPhases === 1 && firstPhaseResult?.status === 'completed') {
    console.log('PASS: pipeline completed after targeted TS2304 repair');
  } else {
    console.error('FAIL: pipeline did not complete after repair:', result);
    passed = false;
  }

  if (firstPhaseResult?.selfFixExecution?.ok === true && firstPhaseResult?.selfFixExecution?.repairTool === 'file_edit') {
    console.log('PASS: selfFixExecution used file_edit and rerun succeeded');
  } else {
    console.error('FAIL: selfFixExecution did not succeed with file_edit:', firstPhaseResult?.selfFixExecution);
    passed = false;
  }

  if (appAfter.includes('const answer = 42;') && appAfter.includes('return answer;')) {
    console.log('PASS: targeted missing name was defined without damaging return');
  } else {
    console.error('FAIL: targeted TS2304 file was not patched as expected:', appAfter);
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

verifySelfFixTypeScriptMissingName().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
