import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent verification for targeted TS2345 number/boolean literal-argument
 * self-fix execution. Phase 1 repairs a boolean literal passed to a number
 * parameter; phase 2 repairs an exact 0/1 literal passed to a boolean
 * parameter. Each repair must be a single-line literal coercion via file_edit,
 * nothing else.
 */
async function verifySelfFixTypeScriptNumberBooleanArgumentCoercion() {
  console.log('Starting TS2345 number-boolean-argument-coercion self-fix verification...');

  process.env.JOE_PRO_ALPHA = '1';
  process.env.OFFLINE_MODE = 'true';

  const projectsRoot = path.join(process.cwd(), 'data/tests/typescript_number_boolean_argument_coercion');
  process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(projectsRoot, { recursive: true });

  const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

  const sessionId = 'test-session-' + Date.now();
  const workspaceId = 'test-typescript-number-boolean-argument-coercion-workspace';
  const userId = 'test-user';
  const testWorkspacePath = path.join(projectsRoot, workspaceId);
  const srcDir = path.join(testWorkspacePath, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const takeNumPath = path.join(srcDir, 'TakeNum.ts');
  const takeBoolPath = path.join(srcDir, 'TakeBool.ts');
  const untouchedPath = path.join(srcDir, 'Untouched.ts');
  const checkAPath = path.join(testWorkspacePath, 'check-a.js');
  const checkBPath = path.join(testWorkspacePath, 'check-b.js');

  fs.writeFileSync(takeNumPath, 'const n: number = takeNum(false);\nexport default n;\n', 'utf-8');
  fs.writeFileSync(takeBoolPath, 'const b: boolean = takeBool(1);\nexport default b;\n', 'utf-8');
  fs.writeFileSync(untouchedPath, 'export const untouched = true;\n', 'utf-8');
  fs.writeFileSync(
    checkAPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/TakeNum.ts', 'utf8');",
      "if (app.includes('takeNum(false)')) {",
      "  console.error(\"src/TakeNum.ts(1,24): error TS2345: Argument of type 'boolean' is not assignable to parameter of type 'number'.\");",
      "  console.error('const n: number = takeNum(false);');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('takeNum(0)')) {",
      "  console.error('src/TakeNum.ts(1,24): error TS2345: TypeScript repair did not produce a number argument.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    checkBPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/TakeBool.ts', 'utf8');",
      "if (app.includes('takeBool(1)')) {",
      "  console.error(\"src/TakeBool.ts(1,24): error TS2345: Argument of type 'number' is not assignable to parameter of type 'boolean'.\");",
      "  console.error('const b: boolean = takeBool(1);');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('takeBool(true)')) {",
      "  console.error('src/TakeBool.ts(1,24): error TS2345: TypeScript repair did not produce a boolean argument.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );

  const untouchedBefore = fs.readFileSync(untouchedPath, 'utf-8');

  const plannerResult = {
    ok: true,
    output: {
      projectName: 'TypeScript Number Boolean Argument Coercion Repair Test',
      totalPhases: 2,
      phases: [
        {
          phaseNumber: 1,
          name: 'TS2345 boolean-to-number argument phase',
          tasks: [
            {
              task: 'Run TS2345 boolean-argument verification',
              tool: 'shell_execute',
              args: { command: 'node check-a.js' },
              required: true,
              priority: 'high',
            },
          ],
        },
        {
          phaseNumber: 2,
          name: 'TS2345 number-to-boolean argument phase',
          tasks: [
            {
              task: 'Run TS2345 number-argument verification',
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
    runId: 'test-typescript-number-boolean-argument-coercion-run',
    userId,
    workspaceId,
    plannerResult,
  });

  let passed = true;
  const takeNumAfter = fs.readFileSync(takeNumPath, 'utf-8');
  const takeBoolAfter = fs.readFileSync(takeBoolPath, 'utf-8');
  const untouchedAfter = fs.readFileSync(untouchedPath, 'utf-8');
  const firstPhaseResult = result.results?.[0];
  const secondPhaseResult = result.results?.[1];

  if (result.ok === true && result.completedPhases === 2
    && firstPhaseResult?.status === 'completed' && secondPhaseResult?.status === 'completed') {
    console.log('PASS: pipeline completed after targeted TS2345 number-boolean argument repairs');
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

  if (takeNumAfter.includes('takeNum(0)') && !takeNumAfter.includes('takeNum(false)')) {
    console.log('PASS: boolean argument was coerced to a number literal');
  } else {
    console.error('FAIL: TakeNum.ts was not patched as expected:', takeNumAfter);
    passed = false;
  }

  if (takeBoolAfter.includes('takeBool(true)') && !takeBoolAfter.includes('takeBool(1)')) {
    console.log('PASS: one argument was coerced to a boolean');
  } else {
    console.error('FAIL: TakeBool.ts was not patched as expected:', takeBoolAfter);
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

verifySelfFixTypeScriptNumberBooleanArgumentCoercion().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
