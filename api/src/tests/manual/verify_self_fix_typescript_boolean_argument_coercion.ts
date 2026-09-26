import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent verification for targeted TS2345 boolean literal-argument self-fix execution.
 * Phase 1 repairs a boolean literal passed to a string parameter; phase 2
 * repairs a quoted boolean literal passed to a boolean parameter. Each repair
 * must be a single-line literal coercion via file_edit, nothing else.
 */
async function verifySelfFixTypeScriptBooleanArgumentCoercion() {
  console.log('Starting TS2345 boolean-argument-coercion self-fix verification...');

  process.env.JOE_PRO_ALPHA = '1';
  process.env.OFFLINE_MODE = 'true';

  const projectsRoot = path.join(process.cwd(), 'data/tests/typescript_boolean_argument_coercion');
  process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(projectsRoot, { recursive: true });

  const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

  const sessionId = 'test-session-' + Date.now();
  const workspaceId = 'test-typescript-boolean-argument-coercion-workspace';
  const userId = 'test-user';
  const testWorkspacePath = path.join(projectsRoot, workspaceId);
  const srcDir = path.join(testWorkspacePath, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const greetPath = path.join(srcDir, 'Greet.ts');
  const togglePath = path.join(srcDir, 'Toggle.ts');
  const untouchedPath = path.join(srcDir, 'Untouched.ts');
  const checkAPath = path.join(testWorkspacePath, 'check-a.js');
  const checkBPath = path.join(testWorkspacePath, 'check-b.js');

  fs.writeFileSync(greetPath, 'const a: string = greet(true);\nexport default a;\n', 'utf-8');
  fs.writeFileSync(togglePath, 'const b: boolean = toggle("false");\nexport default b;\n', 'utf-8');
  fs.writeFileSync(untouchedPath, 'export const untouched = true;\n', 'utf-8');
  fs.writeFileSync(
    checkAPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/Greet.ts', 'utf8');",
      "if (app.includes('greet(true)')) {",
      "  console.error(\"src/Greet.ts(1,24): error TS2345: Argument of type 'boolean' is not assignable to parameter of type 'string'.\");",
      "  console.error('const a: string = greet(true);');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('greet(\"true\")')) {",
      "  console.error('src/Greet.ts(1,24): error TS2345: TypeScript repair did not produce a string argument.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    checkBPath,
    [
      "const fs = require('fs');",
      "const app = fs.readFileSync('src/Toggle.ts', 'utf8');",
      "if (app.includes('toggle(\"false\")')) {",
      "  console.error(\"src/Toggle.ts(1,24): error TS2345: Argument of type 'string' is not assignable to parameter of type 'boolean'.\");",
      "  console.error('const b: boolean = toggle(\"false\");');",
      "  process.exit(1);",
      "}",
      "if (!app.includes('toggle(false)')) {",
      "  console.error('src/Toggle.ts(1,24): error TS2345: TypeScript repair did not produce a boolean argument.');",
      "  process.exit(1);",
      "}",
    ].join('\n'),
    'utf-8',
  );

  const untouchedBefore = fs.readFileSync(untouchedPath, 'utf-8');

  const plannerResult = {
    ok: true,
    output: {
      projectName: 'TypeScript Boolean Argument Coercion Repair Test',
      totalPhases: 2,
      phases: [
        {
          phaseNumber: 1,
          name: 'TS2345 boolean-to-string argument phase',
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
          name: 'TS2345 string-to-boolean argument phase',
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
    runId: 'test-typescript-boolean-argument-coercion-run',
    userId,
    workspaceId,
    plannerResult,
  });

  let passed = true;
  const greetAfter = fs.readFileSync(greetPath, 'utf-8');
  const toggleAfter = fs.readFileSync(togglePath, 'utf-8');
  const untouchedAfter = fs.readFileSync(untouchedPath, 'utf-8');
  const firstPhaseResult = result.results?.[0];
  const secondPhaseResult = result.results?.[1];

  if (result.ok === true && result.completedPhases === 2
    && firstPhaseResult?.status === 'completed' && secondPhaseResult?.status === 'completed') {
    console.log('PASS: pipeline completed after targeted TS2345 boolean argument repairs');
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

  if (greetAfter.includes('greet("true")') && !greetAfter.includes('greet(true)')) {
    console.log('PASS: boolean argument was coerced to a string literal');
  } else {
    console.error('FAIL: Greet.ts was not patched as expected:', greetAfter);
    passed = false;
  }

  if (toggleAfter.includes('toggle(false)') && !toggleAfter.includes('toggle("false")')) {
    console.log('PASS: quoted boolean argument was coerced to a boolean');
  } else {
    console.error('FAIL: Toggle.ts was not patched as expected:', toggleAfter);
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

verifySelfFixTypeScriptBooleanArgumentCoercion().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
