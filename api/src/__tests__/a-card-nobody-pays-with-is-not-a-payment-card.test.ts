/**
 * ⛔ A CARD NOBODY PAYS WITH IS NOT A PAYMENT CARD (qa-field-cases.ts cardMeaning).
 *
 * The r40 review, 2026-11-15: «Insurance card number», «رقم بطاقة التأمين», «Student card
 * number», «رقم البطاقة الجامعية», «Health card no», «Employee card number» were read as a
 * payment card, and «Security code», «رمز الأمان», «الرمز الأمني» as its CVC with no card in
 * sight. Each got «letters» as a MAJOR case, so a clinic that rightly keeps an alphanumeric
 * insurance number was refused. Pinned: those stay what they are; a real checkout's card
 * number and CVC are still read (a-card-field-is-given-a-card.test.ts keeps the rest).
 */
import { casesFor, meaningOf, type QaField } from '../core/quality/qa-field-cases';

const f = (o: Partial<QaField>): QaField => ({ tag: 'input', type: 'text', name: '', ...o });
const PAYMENT_MEANINGS = ['card', 'cvc'];

describe('a card nobody pays with', () => {
    it.each([
        'Insurance card number', 'رقم بطاقة التأمين', 'Student card number', 'رقم البطاقة الجامعية',
        'Health card no', 'Employee card number', 'Civil ID card number', 'رقم البطاقة المدنية',
        'Family card number', 'رقم بطاقة العائلة', 'Loyalty card number', 'رقم بطاقة الولاء',
        'Library card number', 'رقم بطاقة المكتبة', 'Membership card number', 'رقم بطاقة العضوية',
        'رقم البطاقة الوطنية', 'رقم بطاقة الطالب', 'رقم بطاقة الموظف', 'رقم البطاقة الصحية',
        'National card number', 'Patient card number', 'Staff card no',
    ])('«%s» is not a payment card and gets no major «letters» case', name => {
        expect(PAYMENT_MEANINGS).not.toContain(meaningOf(f({ name, inputMode: 'numeric' })));
        expect(casesFor(f({ name })).some(c => /^(?:card|cvc):letters$/.test(c.id))).toBe(false);
    });

    it('a plain «Card number» in a form for a card nobody pays with, and that never pays, is not one', () => {
        expect(meaningOf(f({ name: 'Card number', context: 'Register patient Insurance provider Card number Save' }))).not.toBe('card');
        expect(meaningOf(f({ name: 'رقم البطاقة', context: 'تسجيل طالب جديد الاسم رقم البطاقة حفظ' }))).not.toBe('card');
    });
});

describe('a security code with no card and no payment', () => {
    it.each(['Security code', 'رمز الأمان', 'الرمز الأمني'])('«%s» alone is not a CVC', name => {
        expect(meaningOf(f({ name }))).not.toBe('cvc');
        expect(meaningOf(f({ name, context: 'Sign in Email Password Security code Continue' }))).not.toBe('cvc');
        expect(casesFor(f({ name })).some(c => c.id === 'cvc:letters')).toBe(false);
    });
});

describe('the must-not twin: a checkout card is still a card', () => {
    it('a card number in a checkout, or with a payment word, or by cc-number, is a card', () => {
        expect(meaningOf(f({ name: 'card Card number', inputMode: 'numeric' }))).toBe('card');
        expect(meaningOf(f({ name: 'Credit card number' }))).toBe('card');
        expect(meaningOf(f({ name: 'رقم بطاقة الائتمان' }))).toBe('card');
        expect(meaningOf(f({ name: 'Card number', context: 'Checkout Card number Expiry CVC Pay now' }))).toBe('card');
        expect(meaningOf(f({ name: 'Card number', context: 'Create an account Email Card number Place order' }))).toBe('card');
        //  A checkout that also sells travel insurance pays: its card is still a card.
        expect(meaningOf(f({ name: 'Card number', context: 'Add travel insurance Card number Pay' }))).toBe('card');
        expect(meaningOf(f({ name: 'x', autocomplete: 'cc-number' }))).toBe('card');
        //  «a valid card number» is not «health»: «صحيح» is not «صحي».
        expect(meaningOf(f({ name: 'أدخل رقم بطاقة صحيح' }))).toBe('card');
        expect(casesFor(f({ name: 'Credit card number' })).some(c => c.id === 'card:letters')).toBe(true);
    });

    it('a security code on a card, or in a form that pays or holds a card number, is a CVC', () => {
        expect(meaningOf(f({ name: 'Card security code' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'رمز الأمان للبطاقة' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'Security code', context: 'Payment details Card number Expiry Security code' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'Security code', context: 'Card number Expiry Security code Place order' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'رمز الأمان', context: 'الدفع رقم البطاقة تاريخ الانتهاء رمز الأمان ادفع' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'الرمز الأمني', context: 'ادفع بمدى أو فيزا' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'CVV' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'x', autocomplete: 'cc-csc' }))).toBe('cvc');
        expect(casesFor(f({ name: 'CVC' })).some(c => c.id === 'cvc:letters')).toBe(true);
    });
});
