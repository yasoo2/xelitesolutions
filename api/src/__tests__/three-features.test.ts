/**
 * THREE USER REQUESTS, locked:
 *
 * (1) LOGS OPEN LIVE — the builder announces build_started (with sessionId),
 *     and the frontend keeps Logs in front during the build: a PARTIAL
 *     preview_ready no longer steals the tab mid-stream.
 * (2) THE CLARIFY DIALOGUE — «ابن لي موقع» gets questions, the next message
 *     merges with the original request, detailed prompts pass untouched.
 * (3) MOBILE APPS — «تطبيق اندرويد» builds an INSTALLABLE app: manifest,
 *     offline service worker, real generated PNG icons, iOS meta.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { clarifyGate, isVagueBuildRequest, clarifyQuestions, descriptiveTokens } from '../core/orchestrator/clarify';
import { wantsMobileApp, iconPng, manifestJson, serviceWorkerJs, ensurePwaMarkup } from '../core/design/pwa';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('(1) the Logs panel opens the moment a build starts', () => {
    it('the builder broadcasts build_started with the sessionId', () => {
        const src = read('modules', 'tools', 'definitions', 'WebPageBuilderTool.ts');
        expect(src).toContain("type: 'build_started'");
        expect(src.indexOf("type: 'build_started'")).toBeLessThan(src.indexOf('const isAr'));
    });
    it('the frontend opens Logs on build_started and a PARTIAL preview never steals the tab', () => {
        const ui = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf-8');
        expect(ui).toContain("msg.type === 'build_started'");
        expect(ui).toContain('if (!msg.data?.partial) {');
        // The partial URL still feeds the preview pane (split view keeps growing).
        const handler = ui.slice(ui.indexOf("msg.type === 'preview_ready'"));
        expect(handler.indexOf('setPreviewUrl(url)')).toBeLessThan(handler.indexOf('if (!msg.data?.partial)'));
    });
});

describe('(2) a thin build prompt starts a dialogue, not a build', () => {
    afterEach(() => { (global as any).joeClarify = {}; });

    it('«ابن لي موقع» is vague; a described request is not', () => {
        expect(isVagueBuildRequest('ابن لي موقع')).toBe(true);
        expect(isVagueBuildRequest('اعمل لي صفحة')).toBe(true);
        expect(isVagueBuildRequest('build me a website')).toBe(true);
        expect(isVagueBuildRequest('ابن لي موقعاً لمطعم بيتزا إيطالي')).toBe(false);
        expect(isVagueBuildRequest('build a portfolio site for a wedding photographer')).toBe(false);
    });
    it('«ابدأ مباشرة» and edits and attachments are never questioned', () => {
        expect(isVagueBuildRequest('ابن لي موقع مباشرة بدون اسئلة')).toBe(false);
        expect(isVagueBuildRequest('ابن لي موقع', { hasActivePage: true })).toBe(false);
        expect(isVagueBuildRequest('ابن لي موقع\n\n[ATTACHED FILES — the user attached 1 file(s)]')).toBe(false);
    });
    it('an ordinary question is never questioned', () => {
        expect(isVagueBuildRequest('ما هي عاصمة فرنسا؟')).toBe(false);
        expect(isVagueBuildRequest('كيف حالك يا جو')).toBe(false);
    });
    it('the questions are Arabic for an Arabic prompt and name the four things', () => {
        const q = clarifyQuestions('ابن لي موقع', 'ar');
        expect(q).toContain('1️⃣');
        expect(q).toContain('4️⃣');
        expect(q).toContain('ابدأ مباشرة');
    });
    it('the full dialogue: ask → merge the answers → build once', () => {
        const first = clarifyGate('ابن لي موقع', 's-clar', 'ar');
        expect(first.kind).toBe('ask');
        const second = clarifyGate('مطعم مأكولات بحرية، أقسام: قائمة الطعام والحجز، ألوان زرقاء', 's-clar', 'ar');
        expect(second.kind).toBe('merge');
        expect((second as any).goal).toContain('ابن لي موقع');
        expect((second as any).goal).toContain('مأكولات بحرية');
    });
    it('a NEW detailed build request after the questions replaces the dialogue', () => {
        clarifyGate('ابن لي موقع', 's-clar2', 'ar');
        const next = clarifyGate('ابن لي موقعاً لصالون حلاقة رجالي بألوان داكنة', 's-clar2', 'ar');
        expect(next.kind).toBe('pass');
    });
    it('an explicit project-run command replaces a pending vague-build dialogue', () => {
        const session = 's-clar-run';
        expect(clarifyGate('ابن لي موقع', session, 'ar').kind).toBe('ask');

        const run = clarifyGate(
            'شغّل المشروع الموجود داخل مساحة العمل باسم react-لوحة-مهامي. لا تنشئ مشروعاً جديداً ولا تستخدم الشبكة.',
            session,
            'ar',
        );
        expect(run.kind).toBe('pass');

        // The operational command consumes the stale state: a later ordinary
        // message is not silently merged back into the unrelated build brief.
        expect(clarifyGate('الحالة الآن', session, 'ar').kind).toBe('pass');
    });
    it('sessions do not leak into each other', () => {
        clarifyGate('ابن لي موقع', 's-a', 'ar');
        expect(clarifyGate('أزرق وأبيض', 's-b', 'ar').kind).toBe('pass');
    });
    it('descriptiveTokens ignores the verbs, nouns and pleasantries', () => {
        expect(descriptiveTokens('ابن لي موقع جميل من فضلك').length).toBe(0);
        expect(descriptiveTokens('ابن لي موقع لمطعم بيتزا').length).toBeGreaterThanOrEqual(2);
    });
});

describe('(3) «تطبيق اندرويد» ships an installable app', () => {
    it('phone-app requests are recognized; a web app alone is not', () => {
        for (const t of ['ابن لي تطبيق اندرويد لمطعم', 'اعمل تطبيق للايفون', 'تطبيق جوال للمتجر', 'build me an android app', 'an ios app for my store']) {
            expect(wantsMobileApp(t)).toBe(true);
        }
        for (const t of ['ابن لي موقع لمطعم', 'اعمل لي صفحة هبوط', 'build a web dashboard']) {
            expect(wantsMobileApp(t)).toBe(false);
        }
    });
    it('the generated icon is a REAL valid PNG (signature, IHDR, decodable IDAT)', () => {
        const png = iconPng(192, '#6e31d8');
        expect(png.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
        expect(png.slice(12, 16).toString('ascii')).toBe('IHDR');
        expect(png.readUInt32BE(16)).toBe(192);          // width
        expect(png.readUInt32BE(20)).toBe(192);          // height
        const idatAt = png.indexOf(Buffer.from('IDAT'));
        const idatLen = png.readUInt32BE(idatAt - 4);
        const raw = zlib.inflateSync(png.slice(idatAt + 4, idatAt + 4 + idatLen));
        expect(raw.length).toBe((192 * 4 + 1) * 192);    // RGBA scanlines + filter bytes
        // Centre pixel is the brand colour, corner pixel is transparent.
        const centre = (96 * (192 * 4 + 1)) + 1 + 96 * 4;
        expect([raw[centre], raw[centre + 1], raw[centre + 2], raw[centre + 3]]).toEqual([0x6e, 0x31, 0xd8, 255]);
        expect(raw[(0 * (192 * 4 + 1)) + 1 + 3]).toBe(0);
    });
    it('the manifest is installable: standalone, scoped, both icons, RTL for Arabic', () => {
        const m = JSON.parse(manifestJson({ name: 'مطعمي', themeColor: '#6e31d8', isArabic: true }));
        expect(m.display).toBe('standalone');
        expect(m.start_url).toBe('./');
        expect(m.dir).toBe('rtl');
        expect(m.icons.map((i: any) => i.sizes)).toEqual(['192x192', '512x512']);
    });
    it('the service worker precaches the shell and survives offline navigation', () => {
        const sw = serviceWorkerJs();
        expect(sw).toContain("caches.open(CACHE)");
        expect(sw).toContain('./manifest.webmanifest');
        expect(sw).toContain("caches.match('./index.html')");
    });
    it('the markup injection is idempotent and carries the iOS meta', () => {
        const page = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';
        const once = ensurePwaMarkup(page, { name: 'مطعمي', themeColor: '#6e31d8', isArabic: true });
        const twice = ensurePwaMarkup(once, { name: 'مطعمي', themeColor: '#6e31d8', isArabic: true });
        expect(twice).toBe(once);
        expect(once).toContain('rel="manifest"');
        expect(once).toContain('apple-mobile-web-app-capable');
        expect(once).toContain("serviceWorker' in navigator");
        expect((once.match(/joe-pwa/g) || []).length).toBe(2);   // open + close markers
    });
    it('the builder forces multi-file mode for a mobile app and remembers the pwa flag', () => {
        const src = read('modules', 'tools', 'definitions', 'WebPageBuilderTool.ts');
        expect(src).toContain('const isMobileApp = wantsMobileApp(request)');
        expect(src).toMatch(/isMultiFile = multiFileIntent \|\| isMobileApp/);
        expect(src).toContain('pwa: isMobileApp');
        expect(src).toContain("fs.writeFileSync(path.join(abs, 'manifest.webmanifest')");
        expect(src).toContain("fs.writeFileSync(path.join(abs, 'sw.js')");
    });
    it('a mobile app never falls into the backend project pipeline', () => {
        const src = read('core', 'orchestrator', 'PlanningEngine.ts');
        expect(src).toContain('!wantsMobileApp(probe)');
    });
});
