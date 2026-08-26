/**
 * «زر» IS INSIDE «أزرق», AND JOE DEMANDED A BUTTON FOR A BLUE PAGE.
 *
 * Every English alternative in the acceptance catalogue is written \bcounter\b.
 * Not one Arabic alternative had a boundary — and none could: JavaScript
 * defines \b by \w = [A-Za-z0-9_], so between two Arabic letters there is never
 * a \b position at all. \bعدد\b is not stricter, it is unmatchable. So the
 * Arabic side was left bare and matched fragments of longer words.
 *
 * Measured before the fix — each of these produced a criterion the request
 * never asked for, and an unmet criterion BLOCKS DELIVERY:
 *
 *     «ابن مشروع React متعدد الصفحات»  -> counter   «عدد» ⊂ «متعدد»
 *     «لون أزرق فاتح»                  -> button    «زر»  ⊂ «أزرق»
 *     «أضف مجموعة صور»                 -> counter   «مجموع» ⊂ «مجموعة»
 *     «عندي استعداد لإطلاق الموقع»     -> counter   «عداد» ⊂ «استعداد»
 *     «لبيع الجزر والخضار»             -> button    «زر»  ⊂ «الجزر»
 *
 * The first of those is why a real multi-page React build failed: Joe refused
 * to deliver correct work because it could not prove a counter nobody wanted.
 *
 * Both directions are tested here, because a boundary that rejects everything
 * is not strictness — it is the same defect facing the other way.
 */

import { acceptanceFor, requestAsksFor } from '../core/quality/acceptance';

const ids = (request: string) => acceptanceFor(request).map(c => c.id);

describe('a fragment inside a longer word is not the word', () => {
    it.each([
        ['ابن لي مشروع React متعدد الصفحات لمطعم', 'counter', '«عدد» inside «متعدد»'],
        ['اعمل صفحة بخلفية زرقاء ولون أزرق فاتح', 'button', '«زر» inside «أزرق»'],
        ['أضف مجموعة صور للمعرض', 'counter', '«مجموع» inside «مجموعة»'],
        ['عندي استعداد لإطلاق الموقع غدا', 'counter', '«عداد» inside «استعداد»'],
        ['موقع لبيع الجزر والخضار الطازجة', 'button', '«زر» inside «الجزر»'],
    ])('%s does not ask for %s — %s', (request, criterion) => {
        expect(ids(request)).not.toContain(criterion);
    });

    it('and none of them asks for anything else either', () => {
        expect(ids('اعمل صفحة بخلفية زرقاء ولون أزرق فاتح')).toEqual([]);
        expect(ids('موقع لبيع الجزر والخضار الطازجة')).toEqual([]);
    });
});

describe('and the word itself still asks, however Arabic glues it', () => {
    it.each([
        ['أضف عداداً للزوار', 'counter'],
        ['أضف عدّاداً ظاهراً', 'counter'],
        ['اعرض العدد في الأعلى', 'counter'],
        ['اعرض المجموع الكلي للفاتورة', 'counter'],
        ['ضع زر إرسال أسفل النموذج', 'button'],
        ['أريد الأزرار بلون واحد', 'button'],
        ['ابحث في المنتجات', 'search'],
        ['Create a page with a visible counter', 'counter'],
    ])('%s asks for %s', (request, criterion) => {
        expect(ids(request)).toContain(criterion);
    });

    it('the reference prompt still derives what it always derived', () => {
        const derived = ids('Build a small project called Gate062. Create one polished page titled Gate 062 with a heading, a short status message, and a button that increments a visible counter. Run the real build and open the live preview. Do not modify existing projects.');
        for (const id of ['counter', 'button', 'title', 'status_message', 'preview']) expect(derived).toContain(id);
    });
});

describe('the boundary rule itself', () => {
    const asks = (stem: string, text: string) => requestAsksFor(new RegExp(stem, 'iu'), text);

    it('accepts the particles Arabic writes joined to the front', () => {
        for (const t of ['العداد', 'والعداد', 'بالعداد', 'للعداد', 'عداد']) {
            expect(`${t}:${asks('عداد', t)}`).toBe(`${t}:true`);
        }
    });

    it('rejects a letter run that is merely the tail of another word', () => {
        for (const t of ['استعداد', 'الاستعداد', 'واستعداد']) {
            expect(`${t}:${asks('عداد', t)}`).toBe(`${t}:false`);
        }
    });

    it('accepts endings that do not make it a different noun', () => {
        for (const t of ['عدادات', 'عدادها', 'عدادان']) {
            expect(`${t}:${asks('عداد', t)}`).toBe(`${t}:true`);
        }
    });

    it('rejects an ending that does make it a different noun', () => {
        expect(asks('مجموع', 'مجموعة صور')).toBe(false);
        expect(asks('مجموع', 'المجموع الكلي')).toBe(true);
    });

    it('leaves a Latin match alone — its own \\b already holds', () => {
        expect(asks('\\bcounter\\b', 'a visible counter')).toBe(true);
        expect(asks('\\bcounter\\b', 'encountered')).toBe(false);
    });

    it('a rejected fragment does not hide a real word later in the sentence', () => {
        //  «الجزر» rejects «زر» at index 3; the real «زر» two words on must
        //  still be found. Stepping past the rejection instead of over it is
        //  the difference.
        expect(asks('زر', 'لبيع الجزر ثم ضع زر الشراء')).toBe(true);
    });
});
