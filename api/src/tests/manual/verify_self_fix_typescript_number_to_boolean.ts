import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent verification for targeted TS2322 number-to-boolean self-fix execution.
 * Only exact 0/1 literals qualify: phase 1 repairs `= 0` to `= false`, phase 2
 * repairs `= 1` to `= true`. Each repair must be a single-line literal
 * coercion via file_edit, nothing else.
 */
async function verifySelfFixTypeScriptNumberToBoolean() {
  console.log('Starting TS2322 number-to-boolean self-fix verification...');

  process.env.JOE_PRO_ALPHA = '1';
  process.env.OFFLINE_MODE = 'true';

  const projectsRoot = path.join(process.cwd(), 'data/tests/typescript_number_to_boolean');
  process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(projectsRoot, { recursive: true });

  const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

  const sessionId = 'test-session-' + Date.now();
  const workspaceId = 'test-typescript-number-to-boolean-workspace';
  const userId = 'test-user';
  const testWorkspacePath = path.join(projectsRoot, workspaceId);
  const srcDir = path.join(testWorkspacePath, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const flagAPath = path.join(srcDir, 'FlagA.ts');
  const flagBPath = path.join(srcDir, 'FlagB.ts');
  const untouchedPath = path.join(srcDir, 'Untouched.ts');
  const checkAPath = path.join(testWorkspacePath, 'check-a.js');
  const checkBPath = path.join(testWorkspacePath, 'check-b.js');

  fs.writeFileSync(flagAPath, 'const flagA: boolean = 0;\nexport default flagA;\n', 'utf-8');
  fs.writeFileSync(flagBPath, 'const flagB: boolean = 1;\nexport default flagB;\n', 'utf-8');
  fs.writeFileSync(untouchedPath, 'export const untouched = true;\n', 'utf-8');
  fs.writeFileSync(
    checkAPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/FlagA.ts', 'utf8');",
      "if (app.includes('= 0;')) {",
      "  console.error(\"src/FlagA.ts(1,7): error TS2322: Type 'number' is not assignable to type 'boolean'.\");",
      "  console.error('const flagA: boolean = 0;');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('= false;')) {",
      "  console.error('src/FlagA.ts(1,7): error TS2322: TypeScript repair did not produce a boolean assignment.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    checkBPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/FlagB.ts', 'utf8');",
      "if (app.includes('= 1;')) {",
      "  console.error(\"src/FlagB.ts(1,7): error TS2322: Type 'number' is not assignable to type 'boolean'.\");",
      "  console.error('const flagB: boolean = 1;');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('= true;')) {",
      "  console.error('src/FlagB.ts(1,7): error TS2322: TypeScript repair did not produce a boolean assignment.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );

  const untouchedBefore = fs.readFileSync(untouchedPath, 'utf-8');

  const plannerResult = {
    ok: true,
    output: {
      projectName: 'TypeScript Number To Boolean Repair Test',
      totalPhases: 2,
      phases: [
        {
          phaseNumber: 1,
          name: 'TS2322 zero-to-false phase',
          tasks: [
            {
              task: 'Run TS2322 zero verification',
              tool: 'shell_execute',
              args: { command: 'node check-a.js' },
              required: true,
              priority: 'high',
            },
          ],
        },
        {
          phaseNumber: 2,
          name: 'TS2322 one-to-true phase',
          tasks: [
            {
              task: 'Run TS2322 one verification',
              tool: 'shell_execute',
              args: { command: 'node check-b.js' },
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
    runId: 'test-typescript-number-to-boolean-run',
    userId,
    workspaceId,
    plannerResult,
  });

  let passed = true;
  const flagAAfter = fs.readFileSync(flagAPath, 'utf-8');
  const flagBAfter = fs.readFileSync(flagBPath, 'utf-8');
  const untouchedAfter = fs.readFileSync(untouchedPath, 'utf-8');
  const firstPhaseResult = result.results?.[0];
  const secondPhaseResult = result.results?.[1];

  if (result.ok === true && result.completedPhases === 2
    && firstPhaseResult?.status === 'completed' && secondPhaseResult?.status === 'completed') {
    console.log('PASS: pipeline completed after targeted TS2322 number-to-boolean repairs');
  } else {
    console.error('FAIL: pipeline did not complete after repairs:', result);
    passed = false;
  }

  for (const [label, phaseResult] of [['phase 1', firstPhaseResult], ['phase 2', secondPhaseResult]] as const) {
    if (phaseResult?.selfFixExecution?.ok === true && phaseResult?.selfFixExecution?.repairTool === 'file_edit') {
      console.log(`PASS: ${label} selfFixExecution used file_edit and rerun succeeded`);
    } else {
      console.error(`FAIL: ${label} selfFixExecution did not succeed with file_edit:`, phaseResult?.selfFixExecution);
      passed = false;
    }
  }

  if (flagAAfter.includes('const flagA: boolean = false;')) {
    console.log('PASS: zero assignment was converted to false');
  } else {
    console.error('FAIL: FlagA.ts was not patched as expected:', flagAAfter);
    passed = false;
  }

  if (flagBAfter.includes('const flagB: boolean = true;')) {
    console.log('PASS: one assignment was converted to true');
  } else {
    console.error('FAIL: FlagB.ts was not patched as expected:', flagBAfter);
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

verifySelfFixTypeScriptNumberToBoolean().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
