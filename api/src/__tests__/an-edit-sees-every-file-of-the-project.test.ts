/**
 * Round 21 (writing fork's hand-back): project_edit listed a project's files
 * through a walk that stopped after 60 without a word, and changed the text he
 * quoted in the first four files that held it. On a project with a components
 * folder of 70, the content file that sorts after it was never seen — his
 * wording edit was «not found»; and a phrase written in six places was changed
 * in four, the note saying it was done.
 * Only the model call is substituted; the literal edit needs none.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { ProjectEditTool, parseLiteralTextReplacement, parsePresentationEdits } from '../modules/tools/definitions/ProjectEditTool';

jest.setTimeout(120_000);

const write = (root: string, rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
};

describe('an edit sees every file of the project', () => {
    let site = '';
    beforeEach(() => {
        site = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-edit-every-file-'));
        write(site, 'package.json', '{"name":"clinic-site"}');
        for (let i = 0; i < 70; i++) write(site, `src/components/Part${String(i).padStart(2, '0')}.jsx`, `export const part${i} = 'section ${i}';\n`);
    });
    afterEach(() => fs.rmSync(site, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

    it('the text he quoted is found after seventy components', async () => {
        write(site, 'src/content.js', "export const content = { cta: 'احجز جلسة' };\n");
        const res: any = await new ProjectEditTool().execute(
            { request: 'غيّر نص زر «احجز جلسة» إلى «احجز موعدك»', dir: site },
            { sessionId: 'edit-every-file-late' },
        );
        delete (global as any).joeProjects?.['edit-every-file-late'];
        expect(res.output.touched).toEqual(['src/content.js']);
        expect(fs.readFileSync(path.join(site, 'src', 'content.js'), 'utf-8')).toContain("cta: 'احجز موعدك'");
    });

    it('a phrase written in six places is changed in all six, and the note counts them', async () => {
        const files = ['src/content.js', ...[3, 17, 33, 52, 69].map(i => `src/components/Part${String(i).padStart(2, '0')}.jsx`)];
        for (const rel of files) write(site, rel, `export const label = 'احجز جلسة';\n`);
        const res: any = await new ProjectEditTool().execute(
            { request: 'غيّر نص «احجز جلسة» إلى «احجز موعدك»', dir: site },
            { sessionId: 'edit-every-file-six' },
        );
        delete (global as any).joeProjects?.['edit-every-file-six'];
        expect([...res.output.touched].sort()).toEqual([...files].sort());
        for (const rel of files) expect(fs.readFileSync(path.join(site, rel), 'utf-8')).toContain('احجز موعدك');
    });

    it('…and inside a compound edit, where every change is staged and written at once', async () => {
        write(site, 'src/content.js', "export const content = {\n  servicesTitle: 'خدماتنا',\n  cta: 'احجز جلسة',\n};\n");
        write(site, 'src/components/Services.jsx', "import { content } from '../content';\nexport default function Services() {\n  return (\n    <section>\n      <h2>{content.servicesTitle}</h2>\n    </section>\n  );\n}\n");
        const labelled = [3, 17, 33, 52, 69].map(i => `src/components/Part${String(i).padStart(2, '0')}.jsx`);
        for (const rel of labelled) write(site, rel, `export const label = 'احجز جلسة';\n`);
        const res: any = await new ProjectEditTool().execute(
            { request: 'غيّر نص «احجز جلسة» إلى «احجز موعدك»، وأضف تحت عنوان خدماتنا سطراً «نهتم بابتسامتك»', dir: site },
            { sessionId: 'edit-every-file-batch' },
        );
        delete (global as any).joeProjects?.['edit-every-file-batch'];
        expect(res.logs.join('\n')).toMatch(/compound presentation batch: 2 operation\(s\)/u);
        for (const rel of ['src/content.js', ...labelled]) expect(fs.readFileSync(path.join(site, rel), 'utf-8')).toContain('احجز موعدك');
        expect(fs.readFileSync(path.join(site, 'src', 'content.js'), 'utf-8')).toContain("servicesSubtitle: 'نهتم بابتسامتك'");
    });
});

/**
 * The compound request above is typed «سطراً» — alef before the tanween, the
 * way it is most often typed — and the reader knew only «سطرًا»: the second
 * part of the edit was dropped without a word. Marks change how a word is
 * typed, not which word it is; what he quoted is replaced exactly as written.
 */
describe('a request is read whatever marks he typed, and his quoted text is kept exactly', () => {
    it('«سطراً», «سطرًا» and «سطرا» are one word', () => {
        for (const line of ['سطراً', 'سطرًا', 'سطرا']) {
            expect(parsePresentationEdits(`أضِف تحت عنوان خدماتنا ${line} «نهتم بابتسامتك»`))
                .toEqual([{ kind: 'section_subtitle', section: 'خدماتنا', value: 'نهتم بابتسامتك' }]);
        }
    });
    it('a quoted value keeps its marks: it is replaced as he wrote it', () => {
        expect(parseLiteralTextReplacement('غيِّر «مرحباً بكم» إلى «أهلاً وسهلاً»')).toEqual({ from: 'مرحباً بكم', to: 'أهلاً وسهلاً' });
    });
});
