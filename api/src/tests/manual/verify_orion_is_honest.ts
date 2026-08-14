/**
 * LIVE PROOF — ORION on three different machines.
 *
 * Not a mock: this runs the real tool three times against real temporary
 * workspaces, and once against a PATH with no Python on it at all, which
 * is the situation on the user's own Windows box far more often than not.
 *
 *   run:  npx ts-node -T src/tests/manual/verify_orion_is_honest.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { OrionBusinessFoundationTool } from '../../modules/tools/definitions/OrionBusinessFoundationTool';
import { isOrionBusinessOperatingSystemRequest } from '../../modules/tools/definitions/ProjectPipelineTool';

const REQUEST = 'Build ORION, a multi-tenant business operating system with RBAC, CRM, inventory, orders and approvals';

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail = '') {
    if (condition) { passed++; console.log(`  ✓ ${label}`); }
    else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function runIn(prepare?: (projectDir: string) => void): Promise<any> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-orion-live-'));
    if (prepare) prepare(path.join(root, 'orion-business-operating-system'));
    const result = await new OrionBusinessFoundationTool().execute(
        { request: REQUEST },
        { workspaceRoot: root, sessionId: 'orion-live-proof', language: 'en' },
    );
    return { root, result };
}

async function main() {
    console.log('\n=== 1. A machine that has Python (this one) ===');
    {
        const { root, result } = await runIn();
        check('ok', result.ok === true, result.error);
        check('the acceptance suite really ran', result.output?.acceptanceRan === true);
        check('verified', result.output?.verified === true);
        check('no false failure marker', result.output?.verificationFailed === false);
        check('the transcript shows the acceptance run passing', result.logs.some((l: string) => /business-acceptance=passed/.test(l)));
        check('files on disk', fs.existsSync(path.join(result.output.projectPath, 'services/business-core/orion/core.py')));
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log('\n=== 2. A machine with NO Python — skipped, never "failed" ===');
    {
        const realPath = process.env.PATH;
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-no-python-'));
        process.env.PATH = empty; // nothing on PATH: python3/python cannot be spawned
        const { root, result } = await runIn();
        process.env.PATH = realPath;
        check('the delivery is not called broken', result.ok === true, result.error);
        check('it says the acceptance did NOT run', result.output?.acceptanceRan === false);
        check('no failure marker was raised', result.output?.verificationFailed === false);
        check('the message names Python as the reason', /python is not installed/i.test(String(result.output?.verification)));
        check('and gives him the exact command to run', String(result.output?.verification).includes('unittest discover -s tests -v'));
        check('the transcript says SKIPPED, not failed', result.logs.some((l: string) => /business-acceptance=skipped \(python not installed\)/.test(l)));
        check('it never printed "failed" for an unrun check', !result.logs.some((l: string) => /business-acceptance=failed/.test(l)));
        check('the files were still written', fs.existsSync(path.join(result.output.projectPath, 'tests/test_orion_acceptance.py')));
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(empty, { recursive: true, force: true });
    }

    console.log('\n=== 3. A genuinely failing acceptance suite — final evidence, not a retry ===');
    {
        const { root, result } = await runIn(projectDir => {
            fs.mkdirSync(path.join(projectDir, 'tests'), { recursive: true });
            fs.writeFileSync(
                path.join(projectDir, 'tests', 'test_zz_broken.py'),
                'import unittest\n\nclass Broken(unittest.TestCase):\n    def test_business_rule_is_violated(self):\n        self.assertEqual(1, 2)\n',
                'utf8',
            );
        });
        check('the delivery is refused', result.ok === false);
        check('and marked as final evidence for the orchestrator', result.output?.verificationFailed === true);
        check('the acceptance suite is reported as having RUN', result.output?.acceptanceRan === true);
        check('the transcript says failed, not skipped', result.logs.some((l: string) => /business-acceptance=failed/.test(l)));
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log('\n=== 4. The route belongs to the name he gave it ===');
    {
        const named: [string, boolean][] = [
            ['Build ORION, a multi-tenant business operating system with RBAC and inventory', true],
            ['ابنِ ORION — نظام أعمال متعدد المستأجرين فيه مخزون وطلبات', true],
            ['Build a restaurant system with a menu, orders and an audit of every change', false],
            ['I need an enterprise system for CRM, billing and inventory with an approval workflow', false],
            ['Build a React store with products and orders', false],
            ['Make me a landing page about the Orion nebula', false],
        ];
        for (const [request, expected] of named) {
            check(`${expected ? 'ORION' : 'not ORION'}: ${request.slice(0, 62)}`, isOrionBusinessOperatingSystemRequest(request) === expected);
        }
    }

    console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed\n`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
