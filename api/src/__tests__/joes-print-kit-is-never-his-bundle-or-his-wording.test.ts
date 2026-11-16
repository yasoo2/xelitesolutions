/**
 * JOE'S PRINT KIT IS NEVER HIS BUNDLE, AND NEVER HIS WORDING (review 3 of r40, finding 6).
 *
 * The kit (public/vendor/joe-kit: four Cairo/Amiri fonts, print.css, JOE-KIT.json,
 * about 185 KB) is copied into dist/ by Vite. The «too small to be this
 * application» check counted every byte of dist, so an empty React shell with a
 * script tag passed as a «real bundle» whenever the brief had been given. And the
 * wording edit saw the kit's print.css and JOE-KIT.json as his source: «rename
 * Cairo» would rewrite Joe's own files. No model is called.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { auditInTerminal } from '../core/quality/terminal-audit';
import { ProjectEditTool } from '../modules/tools/definitions/ProjectEditTool';

jest.setTimeout(120_000);

const roots: string[] = [];
const project = (files: Record<string, string | Buffer>) => {
    const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r40-kit-'));
    roots.push(root);
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), body);
    }
    return root;
};
afterAll(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

/** The kit as Vite copies it into dist/: four fonts of ~46 KB each, print.css, JOE-KIT.json, README.md, OFL.txt. */
const kitIn = (dir: string): Record<string, string | Buffer> => ({
    [`${dir}/fonts/cairo-arabic.woff2`]: Buffer.alloc(46_000, 1),
    [`${dir}/fonts/cairo-latin.woff2`]: Buffer.alloc(46_000, 2),
    [`${dir}/fonts/amiri-700-arabic.woff2`]: Buffer.alloc(46_000, 3),
    [`${dir}/fonts/amiri-700-latin.woff2`]: Buffer.alloc(46_000, 4),
    [`${dir}/print.css`]: ':where(:root){font-family:Cairo}\n'.repeat(40),
    [`${dir}/JOE-KIT.json`]: JSON.stringify({ kit: 'joe-kit', fonts: ['Cairo', 'Amiri'] }),
    [`${dir}/README.md`]: '# Joe print kit\n',
    [`${dir}/OFL.txt`]: 'SIL Open Font License\n'.repeat(50),
});

const SHELL = '<!doctype html><html lang="ar" dir="rtl"><head><title>فواتير</title><script type="module" src="/assets/index.js"></script></head><body><div id="root"></div></body></html>';

const bundleCheck = async (files: Record<string, string | Buffer>) => {
    const dir = project({ 'package.json': '{"name":"api","private":true}', ...files });
    const audit = await auditInTerminal(dir, { timeoutMs: 8_000, appDir: path.join(dir, 'client') } as any);
    return audit.checks.find(c => c.id === 'app_bundle_real');
};

describe('the «real bundle» check counts the application, never Joe\'s kit', () => {
    it('an empty React shell with the kit copied into dist/ is still too small to be this application', async () => {
        const check = await bundleCheck({
            'client/package.json': '{"name":"client","private":true,"scripts":{"build":"vite build"}}',
            'client/dist/index.html': SHELL,
            'client/dist/assets/index.js': 'console.log(1);',
            ...kitIn('client/dist/vendor/joe-kit'),
        });
        expect(check).toBeDefined();
        expect(check!.ok).toBe(false);
        expect(check!.detail).toMatch(/too small to be this application/u);
    });

    it('a real bundle beside the kit still passes, measured without the kit', async () => {
        const check = await bundleCheck({
            'client/package.json': '{"name":"client","private":true,"scripts":{"build":"vite build"}}',
            'client/dist/index.html': SHELL,
            'client/dist/assets/index.js': `export const app = ${JSON.stringify('x'.repeat(60_000))};`,
            ...kitIn('client/dist/vendor/joe-kit'),
        });
        expect(check!.ok).toBe(true);
        //  60 KB of the app's own script, not the ~190 KB the kit would add.
        expect(check!.detail).toMatch(/^\d+ file\(s\), (?:5\d|6\d) KB of real bundle$/u);
    });
});

describe('a wording edit never rewrites the kit', () => {
    it('«Change the text "Cairo" to "Tajawal"» changes his stylesheet and leaves print.css and JOE-KIT.json as Joe placed them', async () => {
        const dir = project({
            'package.json': '{"name":"invoices","private":true}',
            'public/index.html': '<!doctype html><html lang="ar" dir="rtl"><head><title>فواتير</title><link rel="stylesheet" href="/style.css"></head><body><h1>فواتير</h1></body></html>',
            'public/style.css': "body { font-family: 'Cairo', sans-serif; }\n",
            'public/vendor/joe-kit/print.css': ":where(:root) { font-family: 'Cairo', 'Amiri', serif; }\n",
            'public/vendor/joe-kit/JOE-KIT.json': '{"kit":"joe-kit","fonts":["Cairo","Amiri"]}',
            'public/vendor/joe-kit/fonts/cairo-arabic.woff2': Buffer.alloc(64, 1),
        });
        const res: any = await new ProjectEditTool().execute({ request: 'Change the text "Cairo" to "Tajawal"', dir }, { sessionId: 'r40-kit-wording' });
        delete (global as any).joeProjects?.['r40-kit-wording'];
        expect(fs.readFileSync(path.join(dir, 'public/vendor/joe-kit/print.css'), 'utf8')).toContain("'Cairo'");
        expect(fs.readFileSync(path.join(dir, 'public/vendor/joe-kit/JOE-KIT.json'), 'utf8')).toContain('"Cairo"');
        expect((res.output?.touched || []).some((rel: string) => rel.includes('joe-kit'))).toBe(false);
        expect(fs.readFileSync(path.join(dir, 'public/style.css'), 'utf8')).toContain("'Tajawal'");
    });
});
