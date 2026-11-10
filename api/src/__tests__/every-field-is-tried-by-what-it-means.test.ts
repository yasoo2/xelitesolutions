/**
 * ⛔ EVERY FIELD IS TRIED THE WAY A CAREFUL TESTER TRIES IT — BY WHAT IT MEANS (qa-field-cases.ts).
 *
 * The owner, 2026-11-10: «إذا في خيارات لازم يحطها أرقام أحرف، إذا بس الأرقام ها
 * بس الأحرف، يجرب حالات». Pinned: what a field means is read from its type,
 * its constraints and the words beside it in either language; its cases follow
 * from that meaning, with what each expects; and the valid value it is sent
 * with stays inside its own bounds.
 */
import { casesFor, markupFieldOf, meaningOf, validValueFor, type QaField } from '../core/quality/qa-field-cases';

const f = (o: Partial<QaField>): QaField => ({ tag: 'input', type: 'text', name: '', ...o });
const ids = (field: QaField) => casesFor(field).map(c => c.id);

test('what a field means, from its type and from the words a visitor reads beside it', () => {
    expect(meaningOf(f({ type: 'email' }))).toBe('email');
    expect(meaningOf(f({ name: 'البريد الإلكتروني' }))).toBe('email');
    expect(meaningOf(f({ name: 'رقم الجوال' }))).toBe('tel');
    expect(meaningOf(f({ type: 'number', name: 'Price' }))).toBe('money');
    expect(meaningOf(f({ name: 'السعر' }))).toBe('money');
    expect(meaningOf(f({ type: 'number', name: 'الكمية' }))).toBe('quantity');
    expect(meaningOf(f({ name: 'العمر' }))).toBe('age');
    expect(meaningOf(f({ type: 'date', name: 'Due' }))).toBe('date');
    expect(meaningOf(f({ type: 'password' }))).toBe('password');
    expect(meaningOf(f({ name: 'full_name الاسم الكامل' }))).toBe('name');
    expect(meaningOf(f({ tag: 'textarea', type: 'textarea', name: 'Description' }))).toBe('longtext');
    expect(meaningOf(f({ tag: 'select', type: 'select', options: ['a', 'b'] }))).toBe('select');
    expect(meaningOf(f({ type: 'checkbox', name: 'agree' }))).toBe('check');
    //  «الجودة» is not «age», «message» is not «age».
    expect(meaningOf(f({ name: 'message' }))).not.toBe('age');
});

test('a number is tried with letters, a sign and a fraction where its meaning forbids them', () => {
    expect(ids(f({ type: 'number', name: 'الكمية', required: true }))).toEqual(['quantity:empty', 'quantity:letters', 'quantity:negative', 'quantity:fraction']);
    const price = casesFor(f({ type: 'number', name: 'price', min: '0', max: '10000' }));
    expect(price.map(c => c.id)).toEqual(['money:letters', 'money:negative', 'money:above-max']);
    expect(price.find(c => c.id === 'money:negative')!.weight).toBe('major');
    expect(price.find(c => c.id === 'money:above-max')!.value).toBe('10001');
    //  A plain number with no meaning is not forbidden a sign.
    expect(ids(f({ type: 'number', name: 'offset' }))).toEqual(['number:letters']);
});

test('an email, a phone, a link and a date are tried with what breaks their form', () => {
    expect(ids(f({ type: 'email', required: true }))).toEqual(['email:empty', 'email:malformed', 'email:no-domain']);
    expect(ids(f({ type: 'tel' }))).toEqual(['tel:letters']);
    expect(ids(f({ type: 'url' }))).toEqual(['url:malformed']);
    expect(ids(f({ type: 'date', min: '2026-01-01', max: '2026-12-31' }))).toEqual(['date:before-min', 'date:after-max']);
});

test('a name and free text: its limits, and Arabic and markup that must stay text', () => {
    const name = casesFor(f({ name: 'Name', required: true, maxLength: 40 }));
    //  No markup in a name of 40 letters: the probe and the QA's nonce would not fit (markupFieldFits).
    expect(name.map(c => c.id)).toEqual(['name:empty', 'name:digits', 'name:spaces', 'name:too-long', 'name:arabic']);
    expect(name.find(c => c.id === 'name:too-long')!.value).toHaveLength(50);
    expect(name.find(c => c.id === 'name:arabic')!.expect).toBe('accept');
    expect(name.find(c => c.id === 'name:digits')!.weight).toBe('minor');
    const notes = casesFor(f({ tag: 'textarea', type: 'textarea', name: 'Description' }));
    expect(notes.find(c => c.id === 'longtext:markup')!.expect).toBe('inert');
});

test('Arabic fits the field, and a field with a format of its own is not asked to take it', () => {
    //  L451's «Key» (maxlength 10): the Arabic tried is cut to fit, never «refused» for being longer.
    const key = casesFor(f({ name: 'key Key', maxLength: 10 })).find(c => c.id.endsWith(':arabic'))!;
    expect(key.value.length).toBeLessThanOrEqual(10);
    expect(casesFor(f({ name: 'code', pattern: '[A-Z]{3}' })).some(c => c.id.endsWith(':arabic'))).toBe(false);
});

test('a fraction is a defect only where the field says whole numbers', () => {
    //  L451's story points: type=number step=0.5 — 2.5 points is a valid value.
    expect(ids(f({ type: 'number', name: 'Points', step: '0.5' }))).not.toContain('quantity:fraction');
    expect(casesFor(f({ type: 'number', name: 'Points', step: '1' })).find(c => c.id === 'quantity:fraction')!.weight).toBe('major');
    expect(casesFor(f({ type: 'number', name: 'Points' })).find(c => c.id === 'quantity:fraction')!.weight).toBe('minor');
});

test('the markup is tried in free text first, never in a key or a code', () => {
    const fields = [f({ name: 'key', maxLength: 10 }), f({ name: 'Name' }), f({ tag: 'textarea', type: 'textarea', name: 'Description' })];
    expect(markupFieldOf(fields)).toBe(2);
    expect(markupFieldOf([f({ name: 'key', maxLength: 10 }), f({ name: 'code', pattern: '\\d+' })])).toBe(-1);
});

test('a choice is tried only for being left unchosen when it is required', () => {
    expect(ids(f({ tag: 'select', type: 'select', required: true, options: ['a'] }))).toEqual(['select:none']);
    expect(ids(f({ tag: 'select', type: 'select', options: ['a'] }))).toEqual([]);
    expect(ids(f({ type: 'checkbox' }))).toEqual([]);
});

test('every case says what it tries in both languages', () => {
    for (const field of [f({ type: 'number', name: 'السعر', required: true }), f({ type: 'email' }), f({ name: 'الاسم', maxLength: 10 })]) {
        for (const c of casesFor(field)) {
            expect(c.ar).toMatch(/[؀-ۿ]/);
            expect(c.en).toMatch(/[A-Za-z]/);
        }
    }
});

test('the valid value it is sent with stays inside its own bounds', () => {
    expect(validValueFor(f({ type: 'number', name: 'qty', min: '5', max: '9' }))).toBe('5');
    expect(validValueFor(f({ type: 'number', name: 'price', max: '10' }))).toBe('10');
    expect(validValueFor(f({ type: 'email' }))).toBe('qa.tester@example.com');
    expect(validValueFor(f({ name: 'name', maxLength: 6 }), 'n0nce').length).toBeLessThanOrEqual(6);
});
