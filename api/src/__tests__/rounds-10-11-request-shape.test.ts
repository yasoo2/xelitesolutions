import { clarifyGate } from '../core/orchestrator/clarify';
import { asksForSomething, describesItsContents, looksLikeBuild, tracksSomethingOfHis } from '../core/orchestrator/buildIntent';
import {
    blueprintFor,
    derivedColumns,
    detectAppKind,
    recordedSubject,
} from '../core/design/app-blueprints';

const TRACKING = /(أتابع|اتابع|أسجل|اسجل|أدوّن|ادون|أحفظ|احفظ|أنظم|انظم|أرتب|ارتب|أدير|ادير|\btrack\b|\bmanage\b|\brecord\b|\blog\b|\bkeep\s+track\b|\borgani[sz]e\b)/i;

describe('rounds 10/11: request shape is the contract', () => {
    it.each([
        ['Arabic', 'بدي شي أتابع فيه ديوني', 'ar', 'ديوني', 'لم تذكر ما يُسجَّل لكل واحد من'],
        ['English', 'I want something to track my debts', 'en', 'debts', 'You did not say what each of your'],
    ])('%s tracking request is decided about its row contents and echoes the object', (_label, request, language, object, question) => {
        expect(asksForSomething(request)).toBe(true);
        expect(tracksSomethingOfHis(request, TRACKING)).toBe(true);
        expect(describesItsContents(request)).toBe(false);
        expect(looksLikeBuild(request)).toBe(false);

        const decision = clarifyGate(request, language);
        expect(decision.kind).toBe('decide');
        expect((decision as any).note).toContain(question);
        expect((decision as any).note).toContain(object);
        expect((decision as any).note).not.toMatch(/sections|colou?r|one page|multi-page|أقسامه|ألوانه|صفحة واحدة|موقع متعدد الصفحات/i);
    });

    it('a thin request waits for nothing: the next message is its own request', () => {
        //  Until 2026-11-03 the answer to the question was merged into the
        //  remembered brief. Nothing is asked now, so nothing is remembered.
        expect(clarifyGate('بدي شي أتابع فيه ديوني', 'ar').kind).toBe('decide');
        expect(clarifyGate('اسم المدين، المبلغ، تاريخ الدين', 'ar')).toEqual({ kind: 'pass' });
    });

    it('derives a tracking subject and a request-shaped schema without a domain catalogue', () => {
        const request = 'بدي أتابع ديوني: اسم المدين، المبلغ، هل تم السداد';
        expect(recordedSubject(request)).toBe('ديوني');
        expect(detectAppKind(request)).toBe('generic');
        expect(derivedColumns(request)?.map(column => column.label)).toEqual(['اسم المدين', 'المبلغ', 'هل تم السداد']);

        const bp = blueprintFor('generic', request, true);
        expect(bp.engine).toBe('records');
        expect(bp.relation).toBeUndefined();
        expect(bp.fields.map(field => field.label)).toEqual(['اسم المدين', 'المبلغ', 'هل تم السداد']);
        expect(bp.fields.find(field => field.label === 'المبلغ')).toMatchObject({ type: 'number' });
        expect(bp.fields.find(field => field.label === 'هل تم السداد')).toMatchObject({ type: 'select', options: ['نعم', 'لا'] });
        expect(bp.statusField).toBe('flag1');
        expect(bp.doneValue).toBe('نعم');
    });

    it('keeps negative Arabic value boundaries: project funding is text, paid amount is number', () => {
        const request = 'بدي أتابع ديوني: اسم الدين، تمويل المشروع، المبلغ المدفوع';
        const bp = blueprintFor('generic', request, true);
        expect(bp.fields.find(field => field.label === 'تمويل المشروع')).toMatchObject({ type: 'text' });
        expect(bp.fields.find(field => field.label === 'المبلغ المدفوع')).toMatchObject({ type: 'number' });
    });

    it('does not let WeatherGo prose field become a records schema', () => {
        const request = 'Build a polished weather dashboard called WeatherGo. Create a visible city search field with a Search button, Enter-key submission, reject empty input, show loading state, and show clear invalid-city, network-failure, and API-error states.';
        expect(derivedColumns(request)).toBeNull();
        expect(detectAppKind(request)).toBe('weather');
    });

    it('recognises an invented Arabic tracking verb but not an invented definite-article UI noun', () => {
        const verbRequest = 'بدي أفهرس ديوني';
        const nounRequest = 'بدي صفحة فيها الحقول زغرودة والزر إرسال';
        expect(asksForSomething(verbRequest)).toBe(true);
        expect(tracksSomethingOfHis(verbRequest, TRACKING)).toBe(true);
        expect(derivedColumns(nounRequest)).toBeNull();
        const unsafe = /(?:الحقول|الأعمدة|\bcolumns?\b|\bfields?\b)/iu;
        expect(unsafe.test(nounRequest)).toBe(true);
    });
});
