/**
 * FOUR FINDINGS FROM ONE RUN OF HIS.
 *
 * He sent the big English request — a veterinary clinic, tables listed by
 * name — and pasted the whole log. It contained four separate defects, and
 * every one of them is a system trusting its own guess over a fact in front
 * of it:
 *
 * 1. The mesh asked every provider «Reply with the single word: OK», got `OK`
 *    from four of them, and called all four failures — because an answer was
 *    judged by being longer than two characters.
 * 2. Every pipeline line printed twice: once live, once replayed at the end.
 * 3. The phase announcements spoke Arabic in an English run in English mode.
 * 4. `Tables: animals, vaccinations, doctors, appointments, invoices` was
 *    overruled by the word «clinic» hitting a hand-written domain list.
 */
import fs from 'fs';
import path from 'path';
import { isUsableAnswer } from '../core/llm/intelligent-router';
import { declaredTables } from '../core/design/declared-tables';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

const ROUTER = read('core', 'llm', 'intelligent-router.ts');
const RUN_ROUTE = read('api', 'routes', 'run.ts');
const TOOLSVC = read('modules', 'services', 'ToolService.ts');
const PIPE = read('modules', 'tools', 'definitions', 'ProjectPipelineTool.ts');
const RUNTOOL = read('modules', 'tools', 'definitions', 'ProjectRunTool.ts');
const DESIGNER = read('core', 'design', 'schema-designer.ts');

/* ─────────── 1. an answer is judged by shape, not by length ─────────── */

describe('a correct answer is not a failure', () => {
    it('accepts the shortest true answers a model can give', () => {
        expect(isUsableAnswer('OK')).toBe(true);   // the verify probe's own answer
        expect(isUsableAnswer('لا')).toBe(true);   // two Arabic letters
        expect(isUsableAnswer('42')).toBe(true);
        expect(isUsableAnswer('7')).toBe(true);
        expect(isUsableAnswer('[]')).toBe(true);   // «no tools needed»
        expect(isUsableAnswer('{}')).toBe(true);
    });

    it('still refuses a reply that says nothing, at any length', () => {
        expect(isUsableAnswer('')).toBe(false);
        expect(isUsableAnswer('   \n ')).toBe(false);
        expect(isUsableAnswer('...')).toBe(false);
        expect(isUsableAnswer('---- ---- ----')).toBe(false);
        expect(isUsableAnswer(null)).toBe(false);
        expect(isUsableAnswer(undefined)).toBe(false);
    });

    /**
     * The probe and the gate must agree, or pressing «verify» in Settings
     * cools down every provider in the mesh — which is what happened.
     */
    it('the verify probe asks for exactly the answer the gate now accepts', () => {
        const probe = ROUTER.match(/const probe = \[\{ role: 'user', content: '([^']+)'/);
        expect(probe).toBeTruthy();
        expect(probe![1]).toContain('OK');
        expect(isUsableAnswer('OK')).toBe(true);
        expect(RUN_ROUTE).toContain('verifyProviderDirect');
    });

    it('the arbitrary length constant is gone from the mesh decision', () => {
        expect(ROUTER).toContain('if (isUsableAnswer(ans)) {');
        expect(ROUTER).not.toContain('if (ans && ans.length > 2) {');
    });

    /**
     * The same constant lived a second life one level down — «Pollinations
     * response too short» in his log is Pollinations answering `OK` and being
     * called too short at `res.length < 5`. One rule, every gate.
     */
    it('and from every provider\'s own guard, which had its own numbers', () => {
        expect(ROUTER).not.toMatch(/res\.length < \d+\) throw new Error/);
        expect((ROUTER.match(/if \(!isUsableAnswer\(res\)\) throw new Error/g) || []).length)
            .toBeGreaterThanOrEqual(6);
    });
});

/* ─────────── 2. a line the user already read is not repeated ─────────── */

describe('the log does not say everything twice', () => {
    it('ToolService remembers what was already spoken live', () => {
        expect(TOOLSVC).toContain('const spokenLive = new Set<string>();');
        expect(TOOLSVC).toMatch(/spokenLive\.add\(String\(m\)\)/);
    });

    it('and the post-run flush skips exactly those lines', () => {
        expect(TOOLSVC).toMatch(/\.filter\(\(line: string\) => !spokenLive\.has\(String\(line\)\)\)/);
    });

    it('the wrapper still forwards the line — dedupe must not mute the panel', () => {
        const at = TOOLSVC.indexOf('const spokenLive = new Set<string>();');
        expect(TOOLSVC.slice(at, at + 500)).toContain('return outerProgress(m);');
    });
});

/* ─────────── 3. one run, one language — including the pipeline ─────────── */

describe('the pipeline speaks the language of the run', () => {
    it('project_pipeline asks the one rule instead of defaulting to Arabic', () => {
        expect(PIPE).toContain("import { isArabicReply, say as pick } from '../../../shared/reply-language';");
        expect(PIPE).toMatch(/const isAr = isArabicReply\(\{ language: context\?\.language, text: request \}\);/);
        expect(PIPE).not.toMatch(/String\(context\?\.language \|\| 'ar'\)/);
    });

    it('its own spoken lines carry both sentences', () => {
        expect(PIPE).toMatch(/`\[pipeline\] scope «\$\{scope\}» — building with the real engines/);
        expect(PIPE).toMatch(/'▶️ Starting the system so you can see it live…'/);
    });

    it('and project_run, which the pipeline starts, is handed that language', () => {
        expect(PIPE).toMatch(/executeTool\('project_run', \{\}, \{ \.\.\.context, language: isAr \? 'ar' : 'en' \}\)/);
        expect(RUNTOOL).toContain("import { isArabicReply, say as pick } from '../../../shared/reply-language';");
        expect(RUNTOOL).toMatch(/⏳ The server started but answered on no port within 45s/);
        expect(RUNTOOL).toMatch(/`▶️ Starting the project \(\$\{detected\.kind\}\) on port \$\{port\}…`/);
    });
});

/* ─────────── 4. the tables he typed beat the domain we recognised ─────── */

describe('a declared table list outranks a recognised keyword', () => {
    const HIS_REQUEST = [
        'Build a complete system for a veterinary clinic called "Dar Al-Rifq",',
        'with a React interface and a real database:',
        '',
        'Tables: animals, vaccinations, doctors, appointments, invoices',
        'With photos for the animals, sign-in and staff permissions.',
    ].join('\n');

    it('reads back exactly the five tables he wrote — not «patients»', () => {
        const keys = declaredTables(HIS_REQUEST).map(e => e.key);
        expect(keys).toEqual(['animals', 'vaccinations', 'doctors', 'appointments', 'invoices']);
        expect(keys).not.toContain('patients');
    });

    it('each declared table gets the columns its own shape needs', () => {
        const by = new Map(declaredTables(HIS_REQUEST).map(e => [e.key, e.fields.map(f => f.key)]));
        // A living thing you keep records of has a photograph; an invoice does not.
        expect(by.get('animals')).toContain('image');
        expect(by.get('invoices')).not.toContain('image');
        expect(by.get('invoices')).toContain('amount');
        expect(by.get('appointments')).toContain('date');
        expect(by.get('doctors')).toContain('phone');
    });

    it('reads an Arabic declaration too, waw-joined and all', () => {
        const keys = declaredTables('نظام لعيادة بيطرية. الجداول: الحيوانات والتطعيمات والأطباء والمواعيد')
            .map(e => e.key);
        expect(keys.length).toBe(4);
        expect(keys.every(k => /^[a-z][a-z0-9_]*$/.test(k))).toBe(true);
    });

    it('and stays silent on a colon that declares nothing', () => {
        expect(declaredTables('a system for a clinic: it should be fast and pretty')).toEqual([]);
        expect(declaredTables('Tables: animals')).toEqual([]);          // one item is a heading
        expect(declaredTables('build me a veterinary clinic system')).toEqual([]);
    });

    it('it is asked BEFORE the six hand-written domains, and its answer is validated', () => {
        const declaredAt = DESIGNER.indexOf('const declared = declaredTables(request);');
        const knownAt = DESIGNER.indexOf('const known = deriveDataModel(request);');
        expect(declaredAt).toBeGreaterThan(-1);
        expect(knownAt).toBeGreaterThan(declaredAt);
        expect(DESIGNER).toMatch(/data model: the request declares its tables/);
        expect(DESIGNER.slice(declaredAt, knownAt)).toContain('validateDesign(declared)');
    });
});
