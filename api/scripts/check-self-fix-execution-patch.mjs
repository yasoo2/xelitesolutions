import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.resolve(__dirname, '../src/modules/services/AgentLoopService.ts');

const src = fs.readFileSync(filePath, 'utf8');

const checks = [
  {
    label: 'SelfFixExecutionService import can be inserted',
    needle: "import { SelfFixService } from './SelfFixService';\n",
    replacement: "import { SelfFixService } from './SelfFixService';\nimport { SelfFixExecutionService } from './SelfFixExecutionService';\n",
  },
  {
    label: 'selfFixExecution variable can be inserted',
    needle: '        let selfFixPlan: any = null;\n',
    replacement: '        let selfFixPlan: any = null;\n        let selfFixExecution: any = null;\n',
  },
  {
    label: 'phasePassed can be made mutable',
    needle: "            const phaseStatus = String((phaseResult as any)?.output?.status || 'unknown');\n            const phasePassed = !!phaseResult.ok && phaseStatus === 'completed';\n",
    replacement: "            const phaseStatus = String((phaseResult as any)?.output?.status || 'unknown');\n            let phasePassed = !!phaseResult.ok && phaseStatus === 'completed';\n",
  },
  {
    label: 'controlled self-fix execution can be inserted',
    needle: `                selfFixPlan = SelfFixService.plan(repairTicket);\n\n            }\n`,
    replacement: `                selfFixPlan = SelfFixService.plan(repairTicket);\n                if (selfFixPlan?.allowed) {\n                    selfFixExecution = await SelfFixExecutionService.executeOnce({\n                        phase,\n                        projectContext,\n                        selfFixPlan,\n                        executionContext: {\n                            sessionId,\n                            workspaceId,\n                            userId: userId ? String(userId) : undefined,\n                            onProgress: (m: string) => broadcastThinkingDetail(sessionId, m),\n                        },\n                    });\n                    phasePassed = !!selfFixExecution?.ok;\n                }\n\n            }\n`,
  },
  {
    label: 'selfFixExecution can be attached to phase result',
    needle: `                selfFixPlan: phasePassed ? undefined : selfFixPlan,\n\n            });\n`,
    replacement: `                selfFixPlan: phasePassed ? undefined : selfFixPlan,\n                selfFixExecution,\n\n            });\n`,
  },
  {
    label: 'selfFixExecution can be returned in pipeline result',
    needle: `            selfFixPlan,\n            results: phaseResults,\n`,
    replacement: `            selfFixPlan,\n            selfFixExecution,\n            results: phaseResults,\n`,
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
  console.error('Self-fix execution patch dry-run failed. Do not run patch:self-fix-execution until the needles are updated.');
  process.exit(1);
}

console.log('✅ Self-fix execution patch dry-run passed. It is safe to run: npm run patch:self-fix-execution');
