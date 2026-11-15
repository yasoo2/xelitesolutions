/**
 * ⛔ A CARD FIELD IS GIVEN A CARD (qa-field-cases.ts).
 *
 * run500 on Claude, 2026-11-12/13: P230, P236, P238, P246 and P250 were sound
 * stores whose «Card number» checks 16 digits (P238 Luhn too). The QA had no
 * meaning for a card: inputMode="numeric" made it a number, filled «3»; the CVC
 * «3»; a text card field «Joe QA <nonce>». The checkout refused, rightly, and
 * «Place order» was called dead. Pinned: a card number, a CVC, an expiry (whole,
 * or a month and a year apart) and a cardholder are read from the autocomplete
 * token, the words in English or Arabic, or a placeholder shaped like a card,
 * and each is sent a value a checkout takes, in the field's own form and length.
 */
import { casesFor, fillValueFor, luhnValid, meaningOf, selectValueFor, TEST_CARD_NUMBER, validValueFor, type QaField } from '../core/quality/qa-field-cases';

const f = (o: Partial<QaField>): QaField => ({ tag: 'input', type: 'text', name: '', ...o });
const fill = (o: Partial<QaField>) => fillValueFor(f(o), 'mwdtsde1-cm098', 'en');
const ids = (o: Partial<QaField>) => casesFor(f(o)).map(c => c.id);
const year = new Date().getFullYear();
const yy = String(year + 3).slice(2);

describe('the Luhn check', () => {
    it('passes the test card and fails a changed digit', () => {
        expect(luhnValid(TEST_CARD_NUMBER)).toBe(true);
        expect(luhnValid('4242 4242 4242 4242')).toBe(true);
        expect(luhnValid('5555555555554444')).toBe(true);
        expect(luhnValid('378282246310005')).toBe(true);
        expect(luhnValid('4242424242424241')).toBe(false);
        expect(luhnValid('1234567890123456')).toBe(false);
        expect(luhnValid('4242')).toBe(false);
    });
});

describe('a card number', () => {
    it('is read from its autocomplete, its words in either language, or a placeholder shaped like a card', () => {
        //  The five stores' own fields.
        expect(meaningOf(f({ name: 'card Card number', inputMode: 'numeric' }))).toBe('card');                       // P230, P246
        expect(meaningOf(f({ name: 'card Card number (16 digits)', inputMode: 'numeric' }))).toBe('card');          // P236
        expect(meaningOf(f({ name: 'cardNumber Card number 4242 4242 4242 4242', inputMode: 'numeric' }))).toBe('card'); // P238
        expect(meaningOf(f({ name: 'card card Card number' }))).toBe('card');                                       // P250
        expect(meaningOf(f({ type: 'tel', name: 'pay', autocomplete: 'cc-number' }))).toBe('card');
        expect(meaningOf(f({ name: 'card-number' }))).toBe('card');
        expect(meaningOf(f({ name: 'ccnum' }))).toBe('card');
        expect(meaningOf(f({ name: 'Credit card' }))).toBe('card');
        expect(meaningOf(f({ name: 'رقم البطاقة' }))).toBe('card');
        expect(meaningOf(f({ name: 'رقم بطاقة الائتمان' }))).toBe('card');
        expect(meaningOf(f({ name: 'البطاقة الائتمانية' }))).toBe('card');
        expect(meaningOf(f({ name: 'pan 1234 5678 9012 3456', maxLength: 19 }))).toBe('card');
        expect(meaningOf(f({ name: 'x', placeholder: '•••• •••• •••• ••••' }))).toBe('card');
    });

    it('is not a kanban card, a gift card, an identity card, an IBAN or a barcode', () => {
        expect(meaningOf(f({ name: 'Card title' }))).toBe('text');
        expect(meaningOf(f({ name: 'Card description', tag: 'textarea', type: 'textarea' }))).toBe('longtext');
        expect(meaningOf(f({ name: 'Gift card number' }))).not.toBe('card');
        expect(meaningOf(f({ name: 'رقم بطاقة الهوية' }))).not.toBe('card');
        expect(meaningOf(f({ name: 'IBAN SA03 8000 0000 6080 1016 7519' }))).not.toBe('card');
        expect(meaningOf(f({ name: 'Barcode 5901234123457', inputMode: 'numeric' }))).not.toBe('card');
        expect(meaningOf(f({ name: 'Story points', type: 'number' }))).toBe('quantity');
    });

    it('is sent the Luhn-valid test card, never «3», in the form the field shows', () => {
        expect(fill({ name: 'card Card number', inputMode: 'numeric' })).toBe(TEST_CARD_NUMBER);
        expect(fill({ name: 'card Card number', type: 'tel' })).toBe(TEST_CARD_NUMBER);
        //  Its own example, when it is itself a valid test card.
        expect(fill({ name: 'cardNumber Card number 4242 4242 4242 4242', inputMode: 'numeric' })).toBe('4242 4242 4242 4242');
        //  Its way of writing one, when its example is not a card.
        expect(fill({ name: 'card', placeholder: '1234-5678-9012-3456' })).toBe('4242-4242-4242-4242');
        expect(fill({ name: 'card', placeholder: '1234 5678 9012 3456' })).toBe('4242 4242 4242 4242');
        //  Its length and its pattern decide.
        expect(fill({ name: 'Card number', maxLength: 16, placeholder: '1234 5678 9012 3456' })).toBe(TEST_CARD_NUMBER);
        expect(fill({ name: 'Card number', pattern: '\\d{4} \\d{4} \\d{4} \\d{4}' })).toBe('4242 4242 4242 4242');
        expect(fill({ name: 'Card number', maxLength: 15 })).toBe('378282246310005');
        expect(fill({ name: 'Card number', type: 'number' })).toBe(TEST_CARD_NUMBER);
        expect(luhnValid(validValueFor(f({ name: 'رقم البطاقة' })))).toBe(true);
        //  Never the run's mark: a card is not a record's anchor.
        expect(fill({ name: 'Card number' })).not.toContain('mwdtsde1');
    });

    it('is tried with letters (a defect), and a short or Luhn-failing number (told, never refusing)', () => {
        const cases = casesFor(f({ name: 'Card number', required: true, inputMode: 'numeric' }));
        expect(cases.map(c => c.id)).toEqual(['card:empty', 'card:letters', 'card:short', 'card:luhn']);
        expect(cases.find(c => c.id === 'card:letters')!.weight).toBe('major');
        expect(cases.find(c => c.id === 'card:short')!.weight).toBe('minor');
        expect(cases.find(c => c.id === 'card:luhn')!.weight).toBe('minor');
        expect(luhnValid(cases.find(c => c.id === 'card:luhn')!.value)).toBe(false);
        //  No negative, no fraction, no Arabic, no markup: a card is not a number or free text.
        expect(ids({ name: 'Card number', inputMode: 'numeric' }).some(id => /negative|fraction|arabic|markup/.test(id))).toBe(false);
    });
});

describe('a CVC', () => {
    it('is read from cc-csc, CVC, CVV, security code, or «الرمز السري للبطاقة» — even typed as a password', () => {
        expect(meaningOf(f({ name: 'cvc CVC', inputMode: 'numeric' }))).toBe('cvc');                 // P230
        expect(meaningOf(f({ name: 'CVV', type: 'password', maxLength: 3 }))).toBe('cvc');
        expect(meaningOf(f({ name: 'x', autocomplete: 'cc-csc' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'cardCvc' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'Security code' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'الرمز السري للبطاقة' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'رمز الأمان' }))).toBe('cvc');
        expect(meaningOf(f({ name: 'رمز التحقق من البطاقة' }))).toBe('cvc');
        //  A password stays a password, a plain verification code is not a card's.
        expect(meaningOf(f({ type: 'password', name: 'Password' }))).toBe('password');
        expect(meaningOf(f({ type: 'password', name: 'كلمة المرور' }))).toBe('password');
    });

    it('is sent three digits, or four where the field wants four', () => {
        expect(fill({ name: 'cvc CVC', inputMode: 'numeric' })).toBe('123');
        expect(fill({ name: 'CVV', type: 'password', maxLength: 3 })).toBe('123');
        expect(fill({ name: 'CVC', pattern: '\\d{4}' })).toBe('1234');
        expect(fill({ name: 'CVC (Amex: 4 digits)', maxLength: 4, minLength: 4 })).toBe('1234');
        expect(ids({ name: 'CVC', required: true, maxLength: 4 })).toEqual(['cvc:empty', 'cvc:letters', 'cvc:short', 'cvc:too-long']);
    });
});

describe('an expiry', () => {
    it('is read whole (MM/YY) or as a month and a year apart, in English or Arabic', () => {
        expect(meaningOf(f({ name: 'expiry Card expiry date', type: 'date' }))).toBe('expiry');      // P230
        expect(meaningOf(f({ name: 'expiry Expiry date', type: 'date', autocomplete: 'cc-exp' }))).toBe('expiry');
        expect(meaningOf(f({ name: 'exp Expiry MM/YY', maxLength: 5 }))).toBe('expiry');
        expect(meaningOf(f({ name: 'تاريخ الانتهاء MM/YY', maxLength: 5 }))).toBe('expiry');
        expect(meaningOf(f({ name: 'تاريخ انتهاء البطاقة' }))).toBe('expiry');
        expect(meaningOf(f({ name: 'Valid thru', maxLength: 5 }))).toBe('expiry');
        expect(meaningOf(f({ name: 'expMonth Month', type: 'number' }))).toBe('expiry-month');
        expect(meaningOf(f({ name: 'x', autocomplete: 'cc-exp-month' }))).toBe('expiry-month');
        expect(meaningOf(f({ name: 'شهر الانتهاء' }))).toBe('expiry-month');
        expect(meaningOf(f({ name: 'exp-year YY', maxLength: 2 }))).toBe('expiry-year');
        expect(meaningOf(f({ name: 'Expiry year' }))).toBe('expiry-year');
        expect(meaningOf(f({ name: 'x', autocomplete: 'cc-exp-year' }))).toBe('expiry-year');
        expect(meaningOf(f({ name: 'سنة الانتهاء' }))).toBe('expiry-year');
    });

    it('leaves a medicine\'s expiry date, a task\'s end date and a birth date as dates', () => {
        expect(meaningOf(f({ name: 'Expiry date', type: 'date' }))).toBe('date');
        expect(meaningOf(f({ name: 'تاريخ الانتهاء', type: 'date' }))).toBe('date');
        expect(meaningOf(f({ name: 'Date of birth dd/mm/yyyy' }))).toBe('date');
        expect(meaningOf(f({ name: 'Year', type: 'number' }))).toBe('year');
    });

    it('is sent a date three years ahead, in the field\'s own form', () => {
        expect(fill({ name: 'expiry Card expiry date', type: 'date' })).toBe(`${year + 3}-12-31`);
        expect(fill({ name: 'expiry Card expiry', type: 'month' })).toBe(`${year + 3}-12`);
        expect(fill({ name: 'expiry Card expiry date', type: 'date', max: `${year + 1}-06-30` })).toBe(`${year + 1}-06-30`);
        expect(fill({ name: 'exp Expiry MM/YY', maxLength: 5 })).toBe(`12/${yy}`);
        expect(fill({ name: 'Card expiry MM/YYYY' })).toBe(`12/${year + 3}`);
        expect(fill({ name: 'Card expiry', placeholder: 'MM / YY' })).toBe(`12 / ${yy}`);
        expect(fill({ name: 'Card expiry', placeholder: 'MMYY', maxLength: 4 })).toBe(`12${yy}`);
        expect(fill({ name: 'Card expiry', placeholder: '08/27' })).toBe(`12/${yy}`);
        expect(fill({ name: 'Card expiry', pattern: '(0[1-9]|1[0-2])\\/\\d{2}' })).toBe(`12/${yy}`);
        expect(fill({ name: 'Card expiry', maxLength: 4 })).toBe(`12${yy}`);
        expect(fill({ name: 'expMonth Month', type: 'number', min: '1', max: '12' })).toBe('12');
        expect(fill({ name: 'exp-year YY', maxLength: 2 })).toBe(yy);
        expect(fill({ name: 'Expiry year' })).toBe(String(year + 3));
        expect(fill({ name: 'Expiry year', type: 'number', min: String(year), max: String(year + 10) })).toBe(String(year + 3));
    });

    it('is tried with a past date and a month that does not exist, told and never refusing', () => {
        const whole = casesFor(f({ name: 'exp Expiry MM/YY', maxLength: 5, required: true }));
        expect(whole.map(c => c.id)).toEqual(['expiry:empty', 'expiry:past', 'expiry:month-13', 'expiry:too-long']);
        expect(whole.find(c => c.id === 'expiry:past')!.weight).toBe('minor');
        expect(ids({ name: 'expiry Card expiry date', type: 'date' })).toEqual(['expiry:past']);
        expect(casesFor(f({ name: 'expiry Card expiry date', type: 'date' }))[0].value).toBe('2020-01-31');
        expect(ids({ name: 'expMonth Month', type: 'number' })).toEqual(['expiry-month:month-13']);
        expect(ids({ name: 'exp-year YY', maxLength: 2 })).toEqual(['expiry-year:past', 'expiry-year:too-long']);
    });

    it('as selects: a year ahead and the last month, never this year\'s January', () => {
        const years = Array.from({ length: 10 }, (_, i) => String(year + i));
        expect(selectValueFor(f({ tag: 'select', type: 'select', name: 'expYear Year', options: years }))).toBe(String(year + 2));
        expect(selectValueFor(f({ tag: 'select', type: 'select', name: 'exp-year', options: years.map(y => y.slice(2)) }))).toBe(String(year + 2).slice(2));
        expect(selectValueFor(f({ tag: 'select', type: 'select', name: 'x', autocomplete: 'cc-exp-year', options: [String(year), String(year + 1)] }))).toBe(String(year + 1));
        const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
        expect(selectValueFor(f({ tag: 'select', type: 'select', name: 'expMonth Month', options: months }))).toBe('12');
        expect(selectValueFor(f({ tag: 'select', type: 'select', name: 'شهر الانتهاء', options: ['1', '2', '3'] }))).toBe('3');
        //  Any other select keeps its first option, through every entry point.
        expect(selectValueFor(f({ tag: 'select', type: 'select', name: 'Country', options: ['JO', 'SA'] }))).toBe('JO');
        expect(validValueFor(f({ tag: 'select', type: 'select', name: 'Country', options: ['JO', 'SA'] }))).toBe('JO');
        expect(fill({ tag: 'select', type: 'select', name: 'expYear', options: years })).toBe(String(year + 2));
        expect(meaningOf(f({ tag: 'select', type: 'select', name: 'expYear', options: years }))).toBe('select');
    });
});

describe('a cardholder', () => {
    it('is read in English or Arabic and sent Latin letters, the way a card is embossed', () => {
        expect(meaningOf(f({ name: 'Cardholder name' }))).toBe('cardholder');
        expect(meaningOf(f({ name: 'Name on card' }))).toBe('cardholder');
        expect(meaningOf(f({ name: 'x', autocomplete: 'cc-name' }))).toBe('cardholder');
        expect(meaningOf(f({ name: 'اسم حامل البطاقة' }))).toBe('cardholder');
        expect(meaningOf(f({ name: 'الاسم على البطاقة' }))).toBe('cardholder');
        expect(fill({ name: 'Cardholder name' })).toBe('Joe QA Tester');
        expect(fillValueFor(f({ name: 'اسم حامل البطاقة' }), 'mwdtsde1-cm098', 'ar')).toBe('Joe QA Tester');
        expect(fill({ name: 'Cardholder name', pattern: '[A-Z ]+' })).toBe('JOE QA TESTER');
        expect(ids({ name: 'Cardholder name', required: true })).toEqual(['cardholder:empty', 'cardholder:digits', 'cardholder:spaces']);
        //  A kanban «Card name» or a customer's name keeps the run's mark.
        expect(meaningOf(f({ name: 'Card name' }))).not.toBe('cardholder');
        expect(fill({ name: 'Full name' })).toContain('mwdtsde1-cm098');
    });
});

describe('a number with a form of its own', () => {
    it('is sent digits that fit its pattern and its length, not «3»', () => {
        expect(fill({ name: 'otp', inputMode: 'numeric', pattern: '\\d{6}' })).toBe('123456');
        expect(fill({ name: 'pin', inputMode: 'numeric', minLength: 4, maxLength: 4 })).toBe('1234');
        expect(fill({ name: 'Qty', inputMode: 'numeric', pattern: '[1-9][0-9]*' })).toBe('2');
        //  A plain number keeps its value, and its bounds still decide.
        expect(fill({ type: 'number', name: 'offset' })).toBe('3');
        expect(fill({ type: 'number', name: 'offset', min: '10' })).toBe('10');
        expect(fill({ type: 'number', name: 'Year' })).toBe('2024');
    });
});
