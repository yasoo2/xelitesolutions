/**
 * A compound edit reads the project without holding the event loop.
 *
 * Round 21 second review (W8): the compound path read every file of the
 * project with readFileSync to find the text he quoted (3000 files: a 38 ms
 * gap in the event loop, warm) — on a server other people use, every one of
 * them waited. The project is now read through the shared bounded reader. The
 * editor is the real code; no model is called.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { ProjectEditTool } from '../modules/tools/definitions/ProjectEditTool';

jest.setTimeout(120_000);

describe('a compound edit reads the project without holding the loop', () => {
    let site = '';
    const write = (rel: string, body: string) => {
        fs.mkdirSync(path.dirname(path.join(site, rel)), { recursive: true });
        fs.writeFileSync(path.join(site, rel), body);
    };
    beforeEach(() => {
        site = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-writing-compound-'));
        write('package.json', '{"name":"clinic-site"}');
        write('src/content.js', "export const content = {\n  cta: 'احجز جلسة',\n  faqTitle: 'أسئلة شائعة',\n  faq: [\n    { q: 'س١؟', a: 'ج١.' },\n    { q: 'س٢؟', a: 'ج٢.' },\n    { q: 'س٣؟', a: 'ج٣.' },\n  ],\n  navLinks: [\n    { href: '#contact', label: 'تواصل' },\n  ],\n};\n");
        write('src/App.jsx', "import React from 'react';\nimport Contact from './components/Contact.jsx';\nimport { content } from './content.js';\nexport default function App(){ return <main><Contact content={content} /></main>; }\n");
        write('src/components/Contact.jsx', 'export default function Contact(){ return <section id="contact">Contact</section>; }\n');
        write('src/styles/base.css', ':root{--line:#ddd;}\n');
        for (let i = 0; i < 300; i++) write(`src/components/parts/Part${String(i).padStart(3, '0')}.jsx`, `export const part${i} = 'section ${i}';\n`);
    });
    afterEach(() => fs.rmSync(site, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

    it('POSITIVE — no file the batch only searches is read synchronously, and both parts are made', async () => {
        const readFileSync = fs.readFileSync;
        const writeFileSync = fs.writeFileSync;
        // The batch reads, then writes. What reads the tree after the batch has
        // written (the acceptance judge's own source walk) is not this path.
        const events: string[] = [];
        const inSite = (file: any) => typeof file === 'string' && path.resolve(file).startsWith(path.resolve(site));
        const reads = jest.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...rest: any[]) => {
            if (inSite(file)) events.push(`read ${path.relative(site, file).replace(/\\/g, '/')}`);
            return (readFileSync as any)(file, ...rest);
        }) as any);
        const writes = jest.spyOn(fs, 'writeFileSync').mockImplementation(((file: any, ...rest: any[]) => {
            if (inSite(file)) events.push(`write ${path.relative(site, file).replace(/\\/g, '/')}`);
            return (writeFileSync as any)(file, ...rest);
        }) as any);
        let res: any;
        try {
            res = await new ProjectEditTool().execute(
                { request: 'أضف قسم الأسئلة الشائعة، وغير نص «احجز جلسة» الي «احجز موعدك»', dir: site, skipAudit: true },
                { sessionId: 'r22-compound-loop' },
            );
        } finally { reads.mockRestore(); writes.mockRestore(); delete (global as any).joeProjects?.['r22-compound-loop']; }
        expect(res.logs.join('\n')).toMatch(/compound presentation batch: 2 operation\(s\)/u);
        expect(fs.readFileSync(path.join(site, 'src', 'content.js'), 'utf-8')).toContain("cta: 'احجز موعدك'");
        const firstWrite = events.findIndex(event => event.startsWith('write '));
        expect(firstWrite).toBeGreaterThan(-1);
        expect(events.slice(0, firstWrite).filter(event => event.startsWith('read src/components/parts/'))).toEqual([]);
    });
});
