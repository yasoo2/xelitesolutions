/**
 * ARABIC IN A PDF IS TOLD, NOT JUDGED (design arabic-pdf v9 §4.4, test A).
 *
 * L452's certificate printed an Arabic name reversed and glued (pdfkit, a machine font) and Joe
 * passed it: the only check was «a PDF is served». The proof reads PDFs in a child process
 * (assets/pdf-proof/prove.mjs, the lab's prove9.mjs word for word) started only through
 * runArgvStreaming; its told ids are measured on 1,435 right jobs with 0 untrue. Every fixture
 * here comes from the v7/v8 reviewers' corpora with the told ids the lab measured for it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { projectFontFiles, fontsInDataUris, provePdfs, proofHelpers, proofNodeModules, PROOF_PROCESS, FONT_FILE_MAX_BYTES, type PdfJob } from '../core/quality/outside-proof';
import { findJoeAsset } from '../core/quality/outside-scan';

jest.setTimeout(300_000);

const FIX = path.join(__dirname, 'fixtures', 'pdf-proof');
const FONTS = path.resolve(__dirname, '..', '..', 'assets', 'fonts');
const KIT_FONTS = ['cairo-400-arabic.woff2', 'cairo-400-latin.woff2', 'amiri-700-arabic.woff2', 'amiri-700-latin.woff2'].map(f => path.join(FONTS, f));
const NAME = 'عسل درس INV4817 سمح';
const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-pdf-proof-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
const job = (file: string, marker: string, extra: Partial<PdfJob> = {}): PdfJob => {
    const isNum = /^\d+[.,]\d+$/u.test(marker);
    return { pdf: path.join(FIX, file), marker: isNum ? '' : marker, number: isNum ? marker : '', fontFiles: KIT_FONTS, ...extra };
};

describe('the proof child, as Joe starts it', () => {
    it('is the lab\'s prove9.mjs below its header (sha256 of the lab file 84c337b4…)', () => {
        const lab = 'D:/Joe/eval/egm/pdf-lab/egm-pdf-v9/prove9.mjs';
        if (!fs.existsSync(lab)) return; // the lab is on the owner's laptop only
        const body = (t: string) => t.split('\n').slice(t.split('\n').findIndex(l => l.startsWith('import fs'))).join('\n');
        expect(body(fs.readFileSync(findJoeAsset(path.join('pdf-proof', 'prove.mjs'))!, 'utf8'))).toBe(body(fs.readFileSync(lab, 'utf8')));
    });

    it('its pure helpers are the same text as outside-proof.ts\'s: the selfTest job answers as Joe does', () => {
        const strings = ['عسل درس INV4817 سمح', '٧٣٥٩٫٤٦', '7359.46', '1,200.50', 'ABCDEF+Cairo-Regular', 'ـمُحَمَّد‏', 'یک کتاب', 'INV-4821 X'];
        const results = path.join(tmp, 'self.jsonl');
        const jf = path.join(tmp, 'self.json');
        fs.writeFileSync(jf, JSON.stringify({ list: [{ selfTest: true, strings }], nodeModules: proofNodeModules(), results }));
        spawnSync(process.execPath, [findJoeAsset(path.join('pdf-proof', 'prove.mjs'))!, jf], { timeout: 60_000 });
        const line = fs.readFileSync(results, 'utf8').split('\n').filter(l => l.endsWith('}')).map(l => JSON.parse(l)).find(o => !o.started);
        expect(line.selfTest).toEqual(strings.map(s => ({
            s, fold: proofHelpers.fold(s), codes: proofHelpers.codesOf(s),
            numberForms: /^\d+[.,]\d+$/u.test(s) ? proofHelpers.numberForms(s) : null, fontKey: proofHelpers.fontKey(s),
        })));
    });

    it('every fixture through one call: the told ids and «not measured» kinds the lab measured', async () => {
        const cases: Array<[PdfJob, string[], string[]]> = [
            [job('r8-thermal-80mm.pdf', NAME), [], []],                                           // right: silent
            [job('r8-thermal-80mm.pdf', '7359.46'), [], []],                                      // right: the amount, silent
            [job('w8-thermal-5px.pdf', NAME), ['pdf_text_tiny'], []],
            [job('w8-print-css-white-total.pdf', NAME), ['pdf_no_ink'], []],
            [job('w8-dark-theme-light-grey.pdf', NAME), ['pdf_text_very_faint'], []],
            [job('w8-cancelled-banner-over-name.pdf', NAME), ['pdf_text_painted_over'], []],
            [job('w8-pdfmake-vfs-arial.pdf', NAME), ['pdf_font_not_from_project', 'pdf_words_reversed'], ['ink']],
            [job('w8-pdfmake-vfs-arial.pdf', '7359.46'), ['pdf_font_not_from_project'], ['ink']],   // right, and true: Arial is the machine's
            //  v9 (should-fix 2): the page's /Rotate is folded into «upside down» — the v8 review's missed wrong job.
            [job('post-rotate-180.pdf', NAME), ['pdf_text_upside_down'], []],
            [job('r7-scan-image-only-server.pdf', 'سمح عسل INV5928 درس'), ['pdf_text_is_image'], ['typed text, font, ink']],
        ];
        const proofs = await provePdfs(cases.map(c => c[0]), { deadlineAt: Date.now() + 240_000 });
        proofs.forEach((p, k) => {
            const [, told, nm] = cases[k];
            expect([path.basename(cases[k][0].pdf), p.told.map(t => t.id).sort()]).toEqual([path.basename(cases[k][0].pdf), [...told].sort()]);
            expect([path.basename(cases[k][0].pdf), p.notMeasured.map(n => n.what)]).toEqual([path.basename(cases[k][0].pdf), nm]);
            expect(p.stopped).toBeUndefined();
        });
        expect(proofs[8].told[0].detail).toMatch(/the page itself is turned 180/u);
    });

    it('a static PDF (nothing typed, as stage 1 reads every PDF) is judged on font, ink and pictures only', async () => {
        const [right, white, image] = await provePdfs([
            job('r8-thermal-80mm.pdf', ''), job('w8-print-css-white-total.pdf', ''), job('r7-scan-image-only-server.pdf', ''),
        ], { deadlineAt: Date.now() + 120_000 });
        expect(right.told).toEqual([]);
        expect(right.notMeasured.map(n => n.what)).toEqual(['typed text, cut, order']);
        expect(white.notMeasured.map(n => n.what)).toContain('typed text, cut, order');
        expect(image.told.map(t => t.id)).toEqual(['pdf_text_is_image']);
    });
});

describe('bounds', () => {
    it('a «font» over 20 MB is never read: projectFontFiles skips it by its size, and so does the child (v9 M6)', async () => {
        const big = path.join(tmp, 'huge.ttf');
        const fd = fs.openSync(big, 'w');
        const b = Buffer.alloc(1048576, 1); b.write('\x00\x01\x00\x00', 0, 'latin1');
        for (let k = 0; k < 21; k++) fs.writeSync(fd, b);
        fs.closeSync(fd);
        expect(fs.statSync(big).size).toBeGreaterThan(FONT_FILE_MAX_BYTES);
        const root = path.join(tmp, 'fonts-project');
        fs.mkdirSync(path.join(root, 'fonts'), { recursive: true });
        fs.copyFileSync(KIT_FONTS[0], path.join(root, 'fonts', 'cairo.woff2'));
        fs.copyFileSync(big, path.join(root, 'fonts', 'huge.ttf'));
        const found = await projectFontFiles(root, tmp);
        expect(found.map(f => path.basename(f))).toEqual(['cairo.woff2']);
        //  Handed to the child anyway: every job read, none stopped.
        const proofs = await provePdfs([job('r8-thermal-80mm.pdf', NAME, { fontFiles: [...KIT_FONTS, big] }), job('w8-thermal-5px.pdf', NAME, { fontFiles: [...KIT_FONTS, big] })], { deadlineAt: Date.now() + 90_000 });
        expect(proofs.map(p => p.told.map(t => t.id))).toEqual([[], ['pdf_text_tiny']]);
        expect(proofs.every(p => !p.stopped)).toBe(true);
    });

    it('a file over 50 MB, a missing file and a file that is not a PDF each get their line, «not measured»', async () => {
        const junk = path.join(tmp, 'junk.pdf'); fs.writeFileSync(junk, 'not a pdf at all');
        const proofs = await provePdfs([
            job('r8-thermal-80mm.pdf', NAME, { pdf: path.join(tmp, 'nothing-here.pdf') }),
            job('r8-thermal-80mm.pdf', NAME, { pdf: junk }),
            job('r8-thermal-80mm.pdf', NAME),
        ], { deadlineAt: Date.now() + 90_000, limits: { fileBytes: 30_000 } });
        expect(proofs[0].notMeasured[0]).toMatchObject({ what: 'everything' });
        expect(proofs[0].notMeasured[0].why).toMatch(/not there/u);
        expect(proofs[1].notMeasured[0].why).toMatch(/not a PDF Joe can read/u);
        expect(proofs[2].notMeasured[0].why).toMatch(/over the 0 MB Joe reads|MB, over the/u);
    });

    it('no time left: every job still gets its line, never a throw', async () => {
        const proofs = await provePdfs([job('r8-thermal-80mm.pdf', NAME)], { deadlineAt: Date.now() + 1000 });
        expect(proofs).toHaveLength(1);
        expect(proofs[0].notMeasured[0].why).toMatch(/no time left/u);
    });

    it('a cancelled run stops the child', async () => {
        const ac = new AbortController();
        let cancel!: () => void; const cancelled = new Promise<void>(r => { cancel = r; });
        const t0 = Date.now();
        setTimeout(() => { ac.abort(); cancel(); }, 300);
        const proofs = await provePdfs([job('r8-thermal-80mm.pdf', NAME), job('w8-thermal-5px.pdf', NAME)], { deadlineAt: Date.now() + 90_000, signal: ac.signal, cancelled });
        expect(proofs).toHaveLength(2);
        expect(Date.now() - t0).toBeLessThan(30_000);
    });

    it('data: URI fonts in every form are found, by indexOf (fonts7.cjs: 9 of 9), and a PNG or SVG is not a font', () => {
        const B = fs.readFileSync(path.join(FONTS, 'tajawal-400-arabic.woff2')).toString('base64');
        const forms = [
            `src:url(data:font/woff2;base64,${B})`, `src:url("data:font/woff2;base64,${B}")`, `src:url('data:font/woff;base64,${B}')`,
            `src:url(data:application/x-font-woff;charset=utf-8;base64,${B})`, `src:url(data:font/truetype;charset=utf-8;base64,${B})`,
            `src:url(data:application/octet-stream;base64,${B})`, `src:url(data:font/ttf;base64,${B}) format("truetype")`,
            `src:url( "data:font/woff2 ; charset=utf-8 ; base64 , ${B}" )`, `src:url(data:font/woff2;base64,${B.replace(/(.{76})/gu, '$1\n')})`,
        ];
        for (const f of forms) expect(fontsInDataUris(f)).toHaveLength(1);
        expect(fontsInDataUris('background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk)')).toHaveLength(0);
        expect(fontsInDataUris('url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=")')).toHaveLength(0);
        const t0 = Date.now(); fontsInDataUris('url(data:a/b;'.repeat(80000)); fontsInDataUris(('url("data:font/woff2;base64,' + 'A'.repeat(200)).repeat(4000));
        expect(Date.now() - t0).toBeLessThan(2000);
    });
});

describe('the crash rule (v7 crash7.cjs): a crash turns the picture library off, a watchdog stop does not', () => {
    const S = path.join(FIX, 'crash-child.mjs');
    const call = (crashes: string[]) => provePdfs(crashes.map(c => ({ pdf: 'x.pdf', crash: c, fontFiles: null } as any)), { deadlineAt: Date.now() + 60_000, script: S });
    const show = (r: any[]) => r.map(o => o.stopped ? o.stopped : (o.notMeasured.length ? 'n/m' : 'ok')).join(',');
    beforeEach(() => { PROOF_PROCESS.noCanvas = false; PROOF_PROCESS.preStartCrashes = 0; });

    it('1 a crash inside a started job: that job «died», the rest of THIS call runs without the picture library; the next call has it', async () => {
        const r = await call(['', 'mid', '', '']);
        expect(show(r)).toBe('ok,died,n/m,n/m');
        expect(show(await call(['', '']))).toBe('ok,ok');
        expect(PROOF_PROCESS.noCanvas).toBe(false);
    });
    it('2 a watchdog stop (its line written, then the child dies with a crash code) is not a crash', async () => {
        expect(show(await call(['', 'watchdog', '', '']))).toBe('ok,time,ok,ok');
    });
    it('3 a child that dies before any job: this call goes on without the library; the second such call turns it off for the process', async () => {
        expect(show(await call(['load', '']))).toBe('n/m,n/m');
        expect(PROOF_PROCESS.noCanvas).toBe(false);
        expect(show(await call(['load', '']))).toBe('n/m,n/m');
        expect(PROOF_PROCESS.noCanvas).toBe(true);
        expect(show(await call(['', '']))).toBe('n/m,n/m');
    });
});
