import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.resolve(__dirname, '../src/modules/services/AgentLoopService.ts');

let src = fs.readFileSync(filePath, 'utf8');

function replaceOnce(needle, replacement, label) {
  if (src.includes(replacement)) {
    console.log(`already patched: ${label}`);
    return;
  }
  if (!src.includes(needle)) {
    throw new Error(`patch failed: missing needle for ${label}`);
  }
  src = src.replace(needle, replacement);
  console.log(`patched: ${label}`);
}

replaceOnce(
  "import { RepairTicketService } from './RepairTicketService';\n",
  "import { RepairTicketService } from './RepairTicketService';\nimport { SelfFixService } from './SelfFixService';\n",
  'SelfFixService import',
);

replaceOnce(
  '        let repairTicket: any = null;\n',
  '        let repairTicket: any = null;\n        let selfFixPlan: any = null;\n',
  'selfFixPlan variable',
);

replaceOnce(
  `                repairTicket = RepairTicketService.build({\n                    projectName: planOutput?.projectName,\n                    phase,\n                    phaseIndex: i,\n                    phaseStatus,\n                    phaseResult,\n                    runId,\n                    sessionId,\n                    workspaceId,\n                });\n`,
  `                repairTicket = RepairTicketService.build({\n                    projectName: planOutput?.projectName,\n                    phase,\n                    phaseIndex: i,\n                    phaseStatus,\n                    phaseResult,\n                    runId,\n                    sessionId,\n                    workspaceId,\n                });\n                selfFixPlan = SelfFixService.plan(repairTicket);\n`,
  'SelfFixService.plan call',
);

replaceOnce(
  `                repairTicket: phasePassed ? undefined : repairTicket,\n`,
  `                repairTicket: phasePassed ? undefined : repairTicket,\n                selfFixPlan: phasePassed ? undefined : selfFixPlan,\n`,
  'selfFixPlan phase result',
);

replaceOnce(
  `            repairTicket,\n            results: phaseResults,\n`,
  `            repairTicket,\n            selfFixPlan,\n            results: phaseResults,\n`,
  'selfFixPlan pipeline result',
);

fs.writeFileSync(filePath, src);
console.log('SelfFixService wiring patch complete. Run: npm run guard:architecture');
