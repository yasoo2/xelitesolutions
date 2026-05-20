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
  "import { SelfFixService } from './SelfFixService';\n",
  "import { SelfFixService } from './SelfFixService';\nimport { SelfFixExecutionService } from './SelfFixExecutionService';\n",
  'SelfFixExecutionService import',
);

replaceOnce(
  '        let selfFixPlan: any = null;\n',
  '        let selfFixPlan: any = null;\n        let selfFixExecution: any = null;\n',
  'selfFixExecution variable',
);

replaceOnce(
  '            const phaseStatus = String((phaseResult as any)?.output?.status || \'unknown\');\n            const phasePassed = !!phaseResult.ok && phaseStatus === \'completed\';\n',
  '            const phaseStatus = String((phaseResult as any)?.output?.status || \'unknown\');\n            let phasePassed = !!phaseResult.ok && phaseStatus === \'completed\';\n',
  'make phasePassed mutable',
);

replaceOnce(
  `                selfFixPlan = SelfFixService.plan(repairTicket);\n\n            }\n`,
  `                selfFixPlan = SelfFixService.plan(repairTicket);\n                if (selfFixPlan?.allowed) {\n                    selfFixExecution = await SelfFixExecutionService.executeOnce({\n                        phase,\n                        projectContext,\n                        selfFixPlan,\n                        executionContext: {\n                            sessionId,\n                            workspaceId,\n                            userId: userId ? String(userId) : undefined,\n                            onProgress: (m: string) => broadcastThinkingDetail(sessionId, m),\n                        },\n                    });\n                    phasePassed = !!selfFixExecution?.ok;\n                }\n\n            }\n`,
  'execute one controlled self-fix attempt',
);

replaceOnce(
  `                selfFixPlan: phasePassed ? undefined : selfFixPlan,\n\n            });\n`,
  `                selfFixPlan: phasePassed ? undefined : selfFixPlan,\n                selfFixExecution,\n\n            });\n`,
  'attach selfFixExecution to phase result',
);

replaceOnce(
  `            selfFixPlan,\n            results: phaseResults,\n`,
  `            selfFixPlan,\n            selfFixExecution,\n            results: phaseResults,\n`,
  'attach selfFixExecution to pipeline result',
);

fs.writeFileSync(filePath, src);
console.log('SelfFixExecutionService wiring patch complete. Run: npm run guard:architecture');
