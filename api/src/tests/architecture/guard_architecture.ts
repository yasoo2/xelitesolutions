import fs from 'fs';
import path from 'path';

const plannerPath = path.resolve(__dirname, '../../modules/tools/definitions/ProjectPlannerTool.ts');
const agentLoopPath = path.resolve(__dirname, '../../modules/services/AgentLoopService.ts');
const repairTicketServicePath = path.resolve(__dirname, '../../modules/services/RepairTicketService.ts');
const selfFixServicePath = path.resolve(__dirname, '../../modules/services/SelfFixService.ts');

function fail(msg: string) {
  console.error('❌ Architecture Guard Failed:\n' + msg);
  process.exit(1);
}

function pass(msg: string) {
  console.log('✅ ' + msg);
}

function readRequired(filePath: string, label: string) {
  if (!fs.existsSync(filePath)) fail(`${label} not found at ${filePath}`);
  return fs.readFileSync(filePath, 'utf-8');
}

function run() {
  const planner = readRequired(plannerPath, 'ProjectPlannerTool');
  const agentLoop = readRequired(agentLoopPath, 'AgentLoopService');
  const repairService = readRequired(repairTicketServicePath, 'RepairTicketService');
  const selfFixService = readRequired(selfFixServicePath, 'SelfFixService');

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

  if (!agentLoop.includes('RepairTicketService')) {
    fail('AgentLoopService must attach RepairTicketService output when orchestrated phases fail');
  } else {
    pass('AgentLoop is connected to repair ticket generation');
  }

  if (!repairService.includes('phase_repair_ticket')) {
    fail('RepairTicketService must produce phase_repair_ticket objects');
  } else {
    pass('RepairTicketService produces structured phase repair tickets');
  }

  if (!selfFixService.includes('self_fix_plan')) {
    fail('SelfFixService must produce self_fix_plan objects');
  } else {
    pass('SelfFixService produces structured self-fix plans');
  }

  if (!selfFixService.includes('maxAttempts: 1')) {
    fail('SelfFixService must limit automatic repair to one attempt');
  } else {
    pass('SelfFixService limits repair attempts');
  }

  pass('Architecture guard passed');
}

run();
