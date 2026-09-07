import { verifyNamed, type NamedRequirement } from '../core/quality/named-requirements';
import { acceptanceFor, judgeAcceptance } from '../core/quality/acceptance';
import fs from 'fs';
import os from 'os';
import path from 'path';

const requirement = (id: string, text: string): NamedRequirement => ({ id, text, quote: text });

const SOURCE = `
<!doctype html><html lang="ar" dir="rtl"><title>مدار</title></html>
export const content = {
  isArabic: true,
  cta: 'تواصل الآن',
  contactHref: '#contact',
  productsTitle: 'خدماتنا',
  products: [{ name: 'استشارة' }, { name: 'تطوير' }],
};
export function Products(){ return <section id="products"><h2>{content.productsTitle}</h2>{content.products.map(item => <article>{item.name}</article>)}</section> }
export function Hero(){ return <a className="btn primary" href={content.contactHref}>{content.cta}</a> }
export function App(){ return <><Products /><Hero /></> }
@media (min-width: 760px) { .products { grid-template-columns: repeat(2, 1fr); } }
`;

describe('presentation requirements have source-backed offline acceptance', () => {
    const requirements = [
        requirement('req-ar', 'have an Arabic interface'),
        requirement('req-responsive', 'have a responsive design'),
        requirement('req-services', 'have a services section'),
        requirement('req-contact', 'have a clear contact button'),
    ];

    it('proves all four from implementation evidence without calling a provider', async () => {
        let calls = 0;
        const judged = await verifyNamed(requirements, SOURCE, false, async () => {
            calls += 1;
            throw new Error('provider unavailable');
        });
        expect(calls).toBe(0);
        expect(judged.map(item => item.verdict)).toEqual(['met', 'met', 'met', 'met']);
    });

    it('does not accept or condemn a capability when only its words remain', async () => {
        const wordsOnly = '<html><body>Arabic interface, responsive design, services section, clear contact button</body></html>';
        const judged = await verifyNamed(requirements, wordsOnly, false, async () => {
            throw new Error('provider unavailable');
        });
        expect(judged.map(item => item.verdict)).toEqual(['unprovable', 'unprovable', 'unprovable', 'unprovable']);
    });

    it('keeps every explicit capability in the Arabic acceptance denominator', () => {
        const prompt = 'تصميم موقع حديث لشركة برمجيات بعنوان مدار، بواجهة عربية متجاوبة وقسم خدمات وزر تواصل واضح.';
        const criteria = acceptanceFor(prompt);
        const names = criteria.map(item => item.ar);

        expect(names).toEqual(expect.arrayContaining([
            'عنوان أو رأس صفحة',
            'واجهة عربية RTL',
            'واجهة متجاوبة',
            'قسم خدمات',
            'زر تواصل واضح',
        ]));
        expect(criteria).toHaveLength(5);
    });

    it('judges the shared capability checks instead of weaker generic markers', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-presentation-acceptance-'));
        try {
            fs.writeFileSync(path.join(dir, 'index.html'), SOURCE);
            const prompt = 'تصميم موقع حديث لشركة برمجيات بعنوان مدار، بواجهة عربية متجاوبة وقسم خدمات وزر تواصل واضح.';
            const result = judgeAcceptance(acceptanceFor(prompt), { dir }, true);

            expect(result.accepted).toBe(true);
            expect(result.met).toBe(5);
            expect(result.criteria.find(item => item.ar === 'زر تواصل واضح')?.verdict).toBe('met');
            expect(result.criteria.find(item => item.ar === 'قسم خدمات')?.verdict).toBe('met');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
