import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectPageKind } from '../core/design/blueprints';
import { buildImageBrief } from '../core/design/image-brief';
import { ReactProjectTool, requestDrivenServiceProducts } from '../modules/tools/definitions/ReactProjectTool';

const REQUEST = 'أنشئ موقع ويب من صفحة واحدة لاستوديو تصوير باسم «عدسة». يجب أن يحتوي على رأس تنقل بروابط الرئيسية، الخدمات، الأعمال، تواصل؛ قسم افتتاحي بصورة واضحة وزر «احجز جلسة»؛ ثلاثة أقسام فعلية؛ ونموذج تواصل بالاسم والبريد والرسالة.';

describe('a photography brief stays a photography site', () => {
    it('classifies Arabic photography studios as portfolios and grounds image search in photography', () => {
        expect(detectPageKind(REQUEST)).toBe('portfolio');
        expect(buildImageBrief(REQUEST).suggestions.some(subject => /photograph|camera|portrait/i.test(subject))).toBe(true);
    });

    it('derives photography services rather than a generic or bicycle catalogue', () => {
        const catalog = requestDrivenServiceProducts(REQUEST, true);
        expect(catalog?.title).toBe('خدمات التصوير');
        expect(catalog?.cta).toBe('احجز جلسة');
        expect(catalog?.items.map(item => item.name)).toEqual(['جلسات شخصية', 'تغطية المناسبات', 'تصوير المنتجات']);
        expect(JSON.stringify(catalog)).not.toMatch(/دراج|إصلاح|repair|bike/i);
    });

    it('writes the requested navigation and copy without commerce or admin surfaces', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-photo-fidelity-'));
        const sessionId = 'photo-fidelity';
        try {
            const result: any = await new ReactProjectTool().execute({
                request: REQUEST,
                root,
                skipInstall: true,
                skipImages: true,
                skipAuthoredCopy: true,
                skipProfile: true,
            }, { sessionId, language: 'en' });
            expect(result.ok).toBe(true);
            const project = result.output.path;
            const content = fs.readFileSync(path.join(project, 'src', 'content.js'), 'utf8');
            const app = fs.readFileSync(path.join(project, 'src', 'App.jsx'), 'utf8');

            expect(content).toContain("brand: 'عدسة'");
            expect(content).toContain("heroTitle: 'عدسة — قصتك في كل إطار'");
            expect(content).toContain("cta: 'احجز جلسة'");
            expect(content).toContain("label: 'تصفح الخدمات'");
            expect(content).not.toContain("label: 'Browse services'");
            expect(content).toContain("label: 'الرئيسية'");
            expect(content).toContain("label: 'الخدمات'");
            expect(content).toContain("label: 'تواصل'");
            expect(content).not.toContain("label: 'قصتنا'");
            expect(content).toContain("storyTitle: 'نرى ما وراء اللحظة'");
            expect(content).toContain('commerce: false');
            expect(content).not.toMatch(/دراج|إصلاح|repair|bike/i);
            expect(app).not.toContain('ProductView');
            expect(app).not.toContain('AdminPanel');
            expect(fs.existsSync(path.join(project, 'src', 'components', 'ProductView.jsx'))).toBe(false);
            expect(fs.existsSync(path.join(project, 'src', 'components', 'AdminPanel.jsx'))).toBe(false);
        } finally {
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
