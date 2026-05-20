import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent verification for targeted TS2322 number-to-string self-fix execution.
 */
async function verifySelfFixTypeScriptNumberToString() {
  console.log('Starting TS2322 number-to-string self-fix verification...');

  process.env.JOE_PRO_ALPHA = '1';
  process.env.OFFLINE_MODE = 'true';

  const projectsRoot = path.join(process.cwd(), 'data/tests/typescript_number_to_string');
  process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(projectsRoot, { recursive: true });

  const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

  const sessionId = 'test-session-' + Date.now();
  const workspaceId = 'test-typescript-number-to-string-workspace';
  const userId = 'test-user';
  const testWorkspacePath = path.join(projectsRoot, workspaceId);
  const srcDir = path.join(testWorkspacePath, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const appPath = path.join(srcDir, 'App.ts');
  const untouchedPath = path.join(srcDir, 'Untouched.ts');
  const verifyPath = path.join(testWorkspacePath, 'verify-build.js');

  fs.writeFileSync(appPath, 'const label: string = 42;\nexport default label;\n', 'utf-8');
  fs.writeFileSync(untouchedPath, 'export const untouched = true;\n', 'utf-8');
  fs.writeFileSync(
    verifyPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/App.ts', 'utf8');",
      "if (app.includes('= 42;')) {",
      "  console.error(\"src/App.ts(1,7): error TS2322: Type 'number' is not assignable to type 'string'.\");",
      "  console.error('const label: string = 42;');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('= \"42\";')) {",
      "  console.error('src/App.ts(1,7): error TS2322: TypeScript repair did not produce a string assignment.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );

  const untouchedBefore = fs.readFileSync(untouchedPath, 'utf-8');

  const plannerResult = {
    ok: true,
    output: {
      projectName: 'TypeScript Number To String Repair Test',
      totalPhases: 1,
      phases: [
        {
          phaseNumber: 1,
          name: 'TypeScript Number To String Build Phase',
          tasks: [
            {
              task: 'Run TS2322 number-to-string verification',
              tool: 'shell_execute',
              args: { command: 'node verify-build.js' },
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
    runId: 'test-typescript-number-to-string-run',
    userId,
    workspaceId,
    plannerResult,
  });

  let passed = true;
  const appAfter = fs.readFileSync(appPath, 'utf-8');
  const untouchedAfter = fs.readFileSync(untouchedPath, 'utf-8');
  const firstPhaseResult = result.results?.[0];

  if (result.ok === true && result.completedPhases === 1 && firstPhaseResult?.status === 'completed') {
    console.log('PASS: pipeline completed after targeted TS2322 number-to-string repair');
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

  if (appAfter.includes('const label: string = "42";') && !appAfter.includes('= 42;')) {
    console.log('PASS: targeted numeric assignment was converted to string');
  } else {
    console.error('FAIL: targeted TS2322 file was not patched as expected:', appAfter);
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

verifySelfFixTypeScriptNumberToString().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
