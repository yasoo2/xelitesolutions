import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent verification for targeted TS2345 literal-argument self-fix execution.
 * Phase 1 repairs a numeric literal passed to a string parameter; phase 2
 * repairs a quoted numeric literal passed to a number parameter. Each repair
 * must be a single-line literal coercion via file_edit, nothing else.
 */
async function verifySelfFixTypeScriptArgumentCoercion() {
  console.log('Starting TS2345 argument-coercion self-fix verification...');

  process.env.JOE_PRO_ALPHA = '1';
  process.env.OFFLINE_MODE = 'true';

  const projectsRoot = path.join(process.cwd(), 'data/tests/typescript_argument_coercion');
  process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(projectsRoot, { recursive: true });

  const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

  const sessionId = 'test-session-' + Date.now();
  const workspaceId = 'test-typescript-argument-coercion-workspace';
  const userId = 'test-user';
  const testWorkspacePath = path.join(projectsRoot, workspaceId);
  const srcDir = path.join(testWorkspacePath, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const shoutPath = path.join(srcDir, 'Shout.ts');
  const unquotePath = path.join(srcDir, 'Unquote.ts');
  const untouchedPath = path.join(srcDir, 'Untouched.ts');
  const checkAPath = path.join(testWorkspacePath, 'check-a.js');
  const checkBPath = path.join(testWorkspacePath, 'check-b.js');

  fs.writeFileSync(shoutPath, 'const a: string = shout(42);\nexport default a;\n', 'utf-8');
  fs.writeFileSync(unquotePath, 'const b: number = unquote("42");\nexport default b;\n', 'utf-8');
  fs.writeFileSync(untouchedPath, 'export const untouched = true;\n', 'utf-8');
  fs.writeFileSync(
    checkAPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/Shout.ts', 'utf8');",
      "if (app.includes('shout(42)')) {",
      "  console.error(\"src/Shout.ts(1,24): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.\");",
      "  console.error('const a: string = shout(42);');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('shout(\"42\")')) {",
      "  console.error('src/Shout.ts(1,24): error TS2345: TypeScript repair did not produce a string argument.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    checkBPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/Unquote.ts', 'utf8');",
      "if (app.includes('unquote(\"42\")')) {",
      "  console.error(\"src/Unquote.ts(1,24): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.\");",
      "  console.error('const b: number = unquote(\"42\");');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('unquote(42)')) {",
      "  console.error('src/Unquote.ts(1,24): error TS2345: TypeScript repair did not produce a numeric argument.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );

  const untouchedBefore = fs.readFileSync(untouchedPath, 'utf-8');

  const plannerResult = {
    ok: true,
    output: {
      projectName: 'TypeScript Argument Coercion Repair Test',
      totalPhases: 2,
      phases: [
        {
          phaseNumber: 1,
          name: 'TS2345 number-to-string argument phase',
          tasks: [
            {
              task: 'Run TS2345 number-argument verification',
              tool: 'shell_execute',
              args: { command: 'node check-a.js' },
              required: true,
              priority: 'high',
            },
          ],
        },
        {
          phaseNumber: 2,
          name: 'TS2345 string-to-number argument phase',
          tasks: [
            {
              task: 'Run TS2345 string-argument verification',
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
    runId: 'test-typescript-argument-coercion-run',
    userId,
    workspaceId,
    plannerResult,
  });

  let passed = true;
  const shoutAfter = fs.readFileSync(shoutPath, 'utf-8');
  const unquoteAfter = fs.readFileSync(unquotePath, 'utf-8');
  const untouchedAfter = fs.readFileSync(untouchedPath, 'utf-8');
  const firstPhaseResult = result.results?.[0];
  const secondPhaseResult = result.results?.[1];

  if (result.ok === true && result.completedPhases === 2
    && firstPhaseResult?.status === 'completed' && secondPhaseResult?.status === 'completed') {
    console.log('PASS: pipeline completed after targeted TS2345 argument repairs');
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

  if (shoutAfter.includes('shout("42")') && !shoutAfter.includes('shout(42)')) {
    console.log('PASS: numeric argument was coerced to a string literal');
  } else {
    console.error('FAIL: Shout.ts was not patched as expected:', shoutAfter);
    passed = false;
  }

  if (unquoteAfter.includes('unquote(42)') && !unquoteAfter.includes('unquote("42")')) {
    console.log('PASS: quoted numeric argument was coerced to a number');
  } else {
    console.error('FAIL: Unquote.ts was not patched as expected:', unquoteAfter);
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

verifySelfFixTypeScriptArgumentCoercion().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
