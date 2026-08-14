/**
 * THREE THINGS THAT WERE BROKEN ON `main`, FOUND BY RUNNING IT.
 *
 * A second builder pushed nine commits of good work on top of this branch —
 * real regression tests, workspace-root containment, a sharper fix for the OCR
 * worker than the one it replaced. It was reviewed by checking it out and
 * running the project's own gates, and three things did not survive that:
 *
 *   1. `npx tsc --noEmit` FAILED — three errors in PlanningEngine.ts. The
 *      standing gate was red on main. It slipped because ts-jest runs with
 *      `diagnostics: false` and esbuild does not type-check, so nothing in the
 *      test-and-build path could see it.
 *
 *   2. The enterprise foundation tool returned `ok: false` on a foundation it
 *      had written perfectly. Its own README says it installs nothing on the
 *      user's behalf — and then it verified itself by importing FastAPI, which
 *      it had not installed. A tool that cannot pass on a clean machine.
 *
 *   3. `llama-3.1-8b-instant` was still wired in three places. Groq announced
 *      on 2026-08-13 that it stops being served on the 16th.
 *
 * Each is pinned below at the level where it was actually wrong.
 */
import fs from 'fs';
import path from 'path';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const PLANNER = read('core', 'orchestrator', 'PlanningEngine.ts');
const ROUTER = read('core', 'llm', 'intelligent-router.ts');
const ENTERPRISE = read('modules', 'tools', 'definitions', 'EnterprisePlatformFoundationTool.ts');

describe('the plan metadata says what a plan really carries', () => {
    /**
     * Three plans were setting these and `tsc` refused two of them: an
     * excess-property check catches a fresh literal but not one widened on the
     * way in, so the same mistake failed loudly in one place and passed
     * silently in another.
     */
    it('the fields the planner sets are declared, not cast away', () => {
        expect(PLANNER).toMatch(/terminalExecution\?: boolean;/);
        expect(PLANNER).toMatch(/buildVerification\?: boolean;/);
        expect(PLANNER).toMatch(/matchedBy\?: string;/);
        // Declared on the interface — never smuggled past the compiler.
        expect(PLANNER).not.toMatch(/metadata: \{[^}]*\} as any/);
    });

    it('and the step array uses a type that exists', () => {
        expect(PLANNER).not.toMatch(/const steps: PlanStep\[\]/);
        expect(PLANNER).toMatch(/const steps: ExecutionStep\[\] = \[\{/);
    });
});

describe('a foundation that installs nothing cannot verify by importing', () => {
    it('the contract test skips when FastAPI is absent, instead of failing', () => {
        expect(ENTERPRISE).toContain('HAS_FASTAPI');
        expect(ENTERPRISE).toContain('unittest.skipUnless(HAS_FASTAPI');
        expect(ENTERPRISE).toContain('except ModuleNotFoundError');
    });

    it('…and it still says how to make the check real', () => {
        expect(ENTERPRISE).toContain('pip install -r requirements.txt');
    });

    /**
     * The rule this restores is the terminal audit's: «a check that cannot run
     * says so and is excluded from the score». Deleting the test would also
     * have made the tool pass, and would have removed a real check from every
     * machine that does have the dependency.
     */
    it('the test is skipped, never deleted', () => {
        expect(ENTERPRISE).toContain('class ControlPlaneContractTest');
        expect(ENTERPRISE).toContain('test_new_workflow_requires_approval');
    });

    /**
     * This gate was written against the literal verdict expression. The
     * verdict has since learned one more distinction — a machine with no
     * Python SKIPS the contract tests instead of failing them (see
     * core/quality/python-runtime.ts) — so the pin moves to the property it
     * was always guarding: where Python ran, every check still has to pass
     * for the tool to claim ok. It is repointed, not removed; deleting it
     * would drop the guard that made it worth writing.
     */
    it('and the verification still gates the tool\'s own ok', () => {
        expect(ENTERPRISE).toMatch(/const verified = pythonSkipped \? jsonValid : \(compile\.ok && tests\.ok && serviceTests\.ok && jsonValid\);/);
        expect(ENTERPRISE).toMatch(/ok: verified,/);
    });

    it('…and a skipped run is never reported as a passing one', () => {
        expect(ENTERPRISE).toMatch(/skipped \(python not installed\)/);
        expect(ENTERPRISE).toContain('acceptanceRan: !pythonSkipped');
    });
});

describe('a retired model is not an emergency', () => {
    it('no live reference points at the id Groq retires on 2026-08-16', () => {
        expect(ROUTER).not.toMatch(/^\s*model: 'llama-3\.1-8b-instant',/m);
        expect(ROUTER).not.toMatch(/const analyst = 'llama-3\.1-8b-instant';/);
    });

    it('the replacement Groq named is what the router asks for', () => {
        expect(ROUTER).toMatch(/model: 'openai\/gpt-oss-20b',/);
        expect(ROUTER).toMatch(/const analyst = 'openai\/gpt-oss-20b';/);
    });

    /**
     * The registry already carried the scar of this happening three times —
     * llama-3.1-70b-versatile, mixtral, gemma2 — each repointed by hand after
     * it broke. The vision path had already learned to list /models live. The
     * text router never had, which is the only reason a vendor's email was
     * urgent at all.
     */
    it('the catalogue is listed live, and every call is checked against it', () => {
        expect(ROUTER).toMatch(/async function groqTextModels\(apiKey: string\)/);
        expect(ROUTER).toMatch(/https:\/\/api\.groq\.com\/openai\/v1\/models/);
        expect(ROUTER).toMatch(/model = await liveGroqModel\(model, GROQ_API_KEY\);/);
    });

    it('an UNREACHABLE catalogue changes nothing', () => {
        expect(ROUTER).toMatch(/if \(!ids\.length\) return model;/);
        expect(ROUTER).toMatch(/Empty means «unknown», never «none»/);
    });

    it('a model still served is left alone, and a substitution is announced', () => {
        expect(ROUTER).toMatch(/if \(ids\.includes\(model\)\) return model;/);
        expect(ROUTER).toMatch(/is no longer served — using «\$\{pick\}» instead/);
    });

    it('and the last-resort pick refuses the models that cannot chat', () => {
        expect(ROUTER).toMatch(/whisper\|tts\|guard\|vision\|scout\|maverick/);
    });
});
