import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.resolve(__dirname, '../src/modules/services/AgentLoopService.ts');

const src = fs.readFileSync(filePath, 'utf8');

const checks = [
  {
    label: 'SelfFixService import can be inserted',
    needle: "import { RepairTicketService } from './RepairTicketService';\n",
    replacement: "import { RepairTicketService } from './RepairTicketService';\nimport { SelfFixService } from './SelfFixService';\n",
  },
  {
    label: 'selfFixPlan variable can be inserted',
    needle: '        let repairTicket: any = null;\n',
    replacement: '        let repairTicket: any = null;\n        let selfFixPlan: any = null;\n',
  },
  {
    label: 'SelfFixService.plan call can be inserted after repair ticket creation',
    needle: `                repairTicket = RepairTicketService.build({\n                    projectName: planOutput?.projectName,\n                    phase,\n                    phaseIndex: i,\n                    phaseStatus,\n                    phaseResult,\n                    runId,\n                    sessionId,\n                    workspaceId,\n                });\n`,
    replacement: `                repairTicket = RepairTicketService.build({\n                    projectName: planOutput?.projectName,\n                    phase,\n                    phaseIndex: i,\n                    phaseStatus,\n                    phaseResult,\n                    runId,\n                    sessionId,\n                    workspaceId,\n                });\n                selfFixPlan = SelfFixService.plan(repairTicket);\n`,
  },
  {
    label: 'selfFixPlan can be attached to failed phase result',
    needle: `                repairTicket: phasePassed ? undefined : repairTicket,\n`,
    replacement: `                repairTicket: phasePassed ? undefined : repairTicket,\n                selfFixPlan: phasePassed ? undefined : selfFixPlan,\n`,
  },
  {
    label: 'selfFixPlan can be returned in pipeline result',
    needle: `            repairTicket,\n            results: phaseResults,\n`,
    replacement: `            repairTicket,\n            selfFixPlan,\n            results: phaseResults,\n`,
  },
];

let ok = true;
for (const check of checks) {
  if (src.includes(check.replacement)) {
    console.log(`✅ already patched: ${check.label}`);
  } else if (src.includes(check.needle)) {
    console.log(`✅ applicable: ${check.label}`);
  } else {
    ok = false;
    console.error(`❌ not applicable: ${check.label}`);
  }
}

if (!ok) {
  console.error('Self-fix patch dry-run failed. Do not run patch:self-fix until the needles are updated.');
  process.exit(1);
}

console.log('✅ Self-fix patch dry-run passed. It is safe to run: npm run patch:self-fix');
