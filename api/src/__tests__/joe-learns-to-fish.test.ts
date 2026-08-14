/**
 * القانون السادس — عَلِّمه الصيد، لا تُطعمه السمكة.
 *
 * «لا اريد بناء قوالب جاهزة لجو بل اريد ان يتعلم جو كيف يبني هذه القوالب.»
 *
 * A builder that carries a finished product inside itself is not a builder;
 * it is a photocopier. And the test for the difference is not a matter of
 * taste, it is measurable in one line:
 *
 *   GIVE IT TWO DIFFERENT REQUESTS. IF THE BYTES COME OUT THE SAME,
 *   IT NEVER READ THE REQUEST.
 *
 * Measured on 2026-08-14: OrionBusinessFoundationTool asked to build for a
 * clinic chain and then for a freight company produced 24 files, of which
 * exactly 3 differed — and all three were `.pyc` bytecode caches. Every
 * source file was byte-identical. The word "clinic" never reached the
 * output; the tool touches `request` only to check it is non-empty and to
 * pick a reply language.
 *
 * The proof that the law is achievable sits inside this same codebase, and
 * so does the proof that it is not yet obeyed. Two functions, side by side
 * in the design layer, given the same two briefs:
 *
 *   deriveDataModel  (a list of DOMAINS)   clinic → doctors, patients, appointments
 *                                          freight → (nothing)
 *   inferModel       (a SHAPE, "no domain  clinic → patients, appointments, doctors, claims
 *                     is named")           freight → shipments, containers, customs, payrolls
 *
 * Nobody ever taught Joe about freight. The shape path built its model
 * anyway, out of the words the user typed. The list path returned an empty
 * array — and `designSchema` still consults it at priority 2, ABOVE the
 * path that reads his own sentence.
 *
 * This file makes the law binding two ways:
 *   - anything NEW must vary with the request, or it fails here;
 *   - what is frozen today is named in a ledger that may only shrink.
 * The ledger is not an amnesty. It is a debt with the interest showing.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { deriveDataModel } from '../core/design/data-model';
import { inferModel } from '../core/design/entity-inference';
import { OrionBusinessFoundationTool } from '../modules/tools/definitions/OrionBusinessFoundationTool';

/** Two requests that share a shape and share nothing else. */
const CLINIC = 'Build ORION, a multi-tenant business operating system for a CLINIC CHAIN: patients, appointments, doctors, insurance claims, RBAC and approvals';
const FREIGHT = 'Build ORION, a multi-tenant business operating system for a FREIGHT COMPANY: shipments, containers, customs, driver payroll, RBAC and approvals';

/**
 * Build the same thing twice from two different briefs and count how much
 * of the delivered SOURCE actually changed. Bytecode caches and other
 * machine-generated leftovers are excluded — they differ for reasons that
 * have nothing to do with reading the request.
 */
async function varianceOf(
    run: (request: string, workspaceRoot: string) => Promise<string>,
): Promise<{ files: number; differing: string[] }> {
    const fingerprint = async (request: string) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-fishing-'));
        try {
            const projectPath = await run(request, root);
            const seen: Record<string, string> = {};
            const walk = (dir: string, base: string) => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (entry.name === '__pycache__' || entry.name === 'node_modules' || entry.name === '.git') continue;
                    const full = path.join(dir, entry.name);
                    const rel = path.posix.join(base, entry.name);
                    if (entry.isDirectory()) walk(full, rel);
                    else seen[rel] = fs.readFileSync(full, 'utf8');
                }
            };
            walk(projectPath, '');
            return seen;
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
    const a = await fingerprint(CLINIC);
    const b = await fingerprint(FREIGHT);
    const names = new Set([...Object.keys(a), ...Object.keys(b)]);
    const differing = [...names].filter(name => a[name] !== b[name]);
    return { files: names.size, differing };
}

/**
 * THE DEBT LEDGER — builders that still hand over a finished product.
 *
 * A name here is an admission, not a licence. The only permitted edit to
 * this list is a DELETION, made by teaching that builder to read the
 * request. Adding a name means someone wrote a new photocopier, and the
 * count assertion below turns that into a failing build.
 */
const STILL_A_TEMPLATE = [
    // A finished product, byte-identical for every brief.
    'orion_business_foundation',
    'enterprise_platform_foundation',
    // A list of domains rather than a shape: it answers for the six domains
    // someone wrote down and returns nothing for the seventh. Still consulted
    // ahead of the general path in schema-designer.designSchema.
    'core/design/data-model.deriveDataModel',
];

describe('القانون السادس: البنّاء يقرأ الطلب، وإلا فهو آلة نسخ', () => {
    test('the ledger of frozen builders may only shrink, never grow', () => {
        // Three, measured on 2026-08-14. If this number has to go up, the law
        // was broken; if it goes down, edit it down and say which one learned.
        expect(STILL_A_TEMPLATE.length).toBeLessThanOrEqual(3);
    });

    test('the shape path builds a model for a domain nobody taught it', () => {
        const names = (request: string) => inferModel(request).entities.map(entity => entity.key);
        // Freight is in no list in this repository. The rod still catches it.
        expect(names(FREIGHT)).toEqual(expect.arrayContaining(['shipments', 'containers', 'customs']));
        expect(names(CLINIC)).toEqual(expect.arrayContaining(['patients', 'appointments', 'doctors']));
        expect(names(CLINIC).join(',')).not.toBe(names(FREIGHT).join(','));
    });

    test('…and the list path goes hungry the moment the world exceeds the list', () => {
        expect(deriveDataModel(CLINIC).length).toBeGreaterThan(0);
        // Not an accident of these two sentences — the same brief, the same
        // grammar, one word changed, and the canned domains have nothing.
        expect(deriveDataModel(FREIGHT)).toHaveLength(0);
        expect(STILL_A_TEMPLATE).toContain('core/design/data-model.deriveDataModel');
    });

    test('ORION is still a photocopier today, and this measures exactly how much', async () => {
        const { files, differing } = await varianceOf(async (request, workspaceRoot) => {
            const result: any = await new OrionBusinessFoundationTool().execute(
                { request },
                { workspaceRoot, sessionId: 'joe-learns-to-fish', language: 'en' },
            );
            expect(result.ok).toBe(true);
            return result.output.projectPath;
        });

        expect(files).toBeGreaterThanOrEqual(20);
        // The measurement, recorded rather than hidden: zero source files
        // respond to the brief. When someone teaches this tool to read the
        // request, THIS assertion is what fails first — and the fix is to
        // flip it to `toBeGreaterThan(0)` and strike the name off the ledger.
        expect(differing.length).toBe(0);
        expect(STILL_A_TEMPLATE).toContain('orion_business_foundation');
    }, 90_000);
});
