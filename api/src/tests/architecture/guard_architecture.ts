import fs from 'fs';
import path from 'path';

const plannerPath = path.resolve(__dirname, '../../modules/tools/definitions/ProjectPlannerTool.ts');

function fail(msg: string) {
  console.error('❌ Architecture Guard Failed:\n' + msg);
  process.exit(1);
}

function pass(msg: string) {
  console.log('✅ ' + msg);
}

function run() {
  if (!fs.existsSync(plannerPath)) {
    fail('ProjectPlannerTool not found');
  }

  const planner = fs.readFileSync(plannerPath, 'utf-8');

  if (planner.includes('executeTool(')) {
    fail('ProjectPlannerTool must NOT call executeTool');
  } else {
    pass('Planner does not execute tools');
  }

  if (!planner.includes('autoExecuted: false')) {
    fail('Planner must enforce autoExecuted: false');
  } else {
    pass('Planner enforces planner-only mode');
  }

  pass('Architecture guard passed');
}

run();
