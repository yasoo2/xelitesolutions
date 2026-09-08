import fs from 'fs';
import path from 'path';

const plannerPath = path.resolve(__dirname, '../../modules/tools/definitions/ProjectPlannerTool.ts');
const agentLoopPath = path.resolve(__dirname, '../../modules/services/AgentLoopService.ts');
const repairTicketServicePath = path.resolve(__dirname, '../../modules/services/RepairTicketService.ts');
const selfFixServicePath = path.resolve(__dirname, '../../modules/services/SelfFixService.ts');
const appPath = path.resolve(__dirname, '../../api/app.ts');
const registryPath = path.resolve(__dirname, '../../modules/tools/registry.ts');
const toolCatalogPath = path.resolve(__dirname, '../../core/orchestrator/toolCatalog.ts');

const RETIRED_EXECUTION_FILES = [
  path.resolve(__dirname, '../../api/routes/agent.ts'),
  path.resolve(__dirname, '../../api/routes/build.ts'),
  path.resolve(__dirname, '../../core/agents/JoeAgent.ts'),
  path.resolve(__dirname, '../../core/agents/AutonomousLoopEngine.ts'),
  path.resolve(__dirname, '../../core/agents/ProjectManagerAgent.ts'),
  path.resolve(__dirname, '../../core/agents/TaskExecutor.ts'),
  path.resolve(__dirname, '../../core/agents/scaffold-entry.ts'),
  path.resolve(__dirname, '../../modules/tools/definitions/TaskLoopTool.ts'),
];

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
  const app = readRequired(appPath, 'API app');
  const registry = readRequired(registryPath, 'Tool Registry');
  const toolCatalog = readRequired(toolCatalogPath, 'Tool Catalog');

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

  if (!agentLoop.includes('SelfFixExecutionService')) {
    fail('AgentLoopService must attach SelfFixExecutionService for automatic repair execution');
  } else {
    pass('AgentLoop is connected to self-fix execution');
  }

  if (!registry.includes('TerminalManagerTool')) {
    fail('TerminalManagerTool must be registered in src/modules/tools/registry.ts');
  } else {
    pass('TerminalManagerTool is registered in tools registry');
  }

  const retiredFilesStillPresent = RETIRED_EXECUTION_FILES.filter(filePath => fs.existsSync(filePath));
  if (retiredFilesStillPresent.length) {
    fail(`Retired execution files must not return: ${retiredFilesStillPresent.join(', ')}`);
  } else {
    pass('Retired execution files are absent');
  }

  const forbiddenWiring = [
    [app, "apiRouter.use('/agent'"],
    [app, "apiRouter.use('/build'"],
    [app, "apiRouter.use('/run'"],
    [registry, 'TaskLoopTool'],
    [registry, "safeNew('task_loop'"],
    [toolCatalog, "'task_loop'"],
  ].filter(([source, needle]) => source.includes(needle));
  if (forbiddenWiring.length) {
    fail(`Retired execution wiring must not return: ${forbiddenWiring.map(([, needle]) => needle).join(', ')}`);
  } else {
    pass('Only the canonical /api/runs execution ingress remains');
  }

  pass('Architecture guard passed');
}

run();
