/**
 * WIRE PROOF — Stage 5 end to end:
 *
 *   1. A REAL git clone from github.com (octocat/Hello-World) through the
 *      REAL tool — streamed, analyzed, registered as the active project.
 *   2. A realistic local project imported and UNDERSTOOD (stack, structure,
 *      scripts — facts only).
 *   3. COMPOSITION: the Stage-3 surgical editor edits the imported project
 *      (stubbed model words, real apply + real esbuild gate).
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_import_project.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Module } from 'module';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-import-wire-'));

    console.log('\n[1] استنساخ حقيقي من GitHub عبر الأداة');
    const { ImportProjectTool } = await import('../../modules/tools/definitions/ImportProjectTool');
    const gh: any = await new ImportProjectTool().execute(
        { request: 'استورد https://github.com/octocat/Hello-World وافهمه', root: tmp }, { sessionId: 'imp-wire-gh' });
    check('the clone succeeded and was analyzed', gh.ok === true, JSON.stringify(gh.output || gh.error).slice(0, 150));
    check('the README fact reached the report', /Hello World|README|ملف/.test(String(gh.output?.message)), String(gh.output?.message).slice(0, 100));
    check('the repo is the session\'s ACTIVE project', (global as any).joeProjects?.['imp-wire-gh']?.type === 'imported');

    console.log('\n[2] مشروع محلي واقعي: الفهم حقائق لا تخمين');
    const proj = path.join(tmp, 'legacy-shop');
    fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({
        name: 'legacy-shop', scripts: { start: 'node src/server.js' }, dependencies: { express: '^4.18.0' },
    }));
    fs.writeFileSync(path.join(proj, 'src', 'server.js'),
        `const express = require('express');\nconst app = express();\napp.get('/', (req, res) => res.send('مرحبا'));\napp.listen(3000);\n`);
    fs.writeFileSync(path.join(proj, 'README.md'), '# متجر قديم\nخادم Express بسيط\n');
    const local: any = await new ImportProjectTool().execute({ request: 'افهم هذا المشروع واعمل عليه', path: proj }, { sessionId: 'imp-wire-local' });
    check('Express detected from package.json (not guessed)', /Express/.test(String(local.output?.message)), String(local.output?.message).slice(0, 120));
    check('the start script is reported', /start: node src\/server\.js/.test(String(local.output?.message)));

    console.log('\n[3] التركيب: المحرر الجراحي يعدّل المشروع المستورَد');
    const serverJs = fs.readFileSync(path.join(proj, 'src', 'server.js'), 'utf-8');
    const line = serverJs.split('\n').find(l => l.includes("res.send"))!;
    const STUB = `FILE: src/server.js\n<<<<<<< SEARCH\n${line}\n=======\napp.get('/', (req, res) => res.send('أهلاً بكم في المتجر'));\n>>>>>>> REPLACE`;
    const origLoad = (Module as any)._load;
    (Module as any)._load = function (request: string, ...rest: any[]) {
        const exp = origLoad.apply(this, [request, ...rest]);
        if (/intelligent-router$/.test(String(request))) {
            return new Proxy(exp, { get: (t: any, k: string) => (k === 'routeToModel' ? async () => STUB : t[k]) });
        }
        return exp;
    };
    delete require.cache[require.resolve('../../modules/tools/definitions/ProjectEditTool')];
    const Fresh = require('../../modules/tools/definitions/ProjectEditTool').ProjectEditTool;
    const edit: any = await new Fresh().execute({ request: 'غيّر رسالة الترحيب في الخادم' }, { sessionId: 'imp-wire-local' });
    (Module as any)._load = origLoad;
    check('the surgical edit landed on the imported project', edit.ok && String(edit.output?.touched) === 'src/server.js', JSON.stringify(edit.output).slice(0, 150));
    check('the file carries the new greeting and still parses', fs.readFileSync(path.join(proj, 'src', 'server.js'), 'utf-8').includes('أهلاً بكم في المتجر'));

    delete (global as any).joeProjects?.['imp-wire-gh'];
    delete (global as any).joeProjects?.['imp-wire-local'];
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
