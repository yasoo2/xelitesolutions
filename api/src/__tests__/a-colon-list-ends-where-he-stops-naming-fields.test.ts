/**
 * «نظام مخزون: اسم الصنف، الكمية، السعر، وأبغاه بالعربي» HAS THREE COLUMNS.
 *
 * The colon reader (theFieldsOfTheAppHeNamed) hangs a list of fields from the
 * app he named. The third pre-merge review (2026-11-12) measured it the day it
 * was written:
 *
 *     …، السعر، وأبغاه بالعربي     → a 4th column «وأبغاه بالعربي»
 *     …، الكمية، حذف الصنف         → a 3rd column «حذف الصنف»
 *     …، السعر، والمورد            → nothing at all
 *     تطبيق مصاريف: …، ملاحظات     → nothing at all
 *     …، الكمية، آخر تعديل         → nothing at all
 *     the fields on separate lines → nothing at all
 *     crm with name, email, create date, delete date → kind generic («create» read as the order to build)
 *
 * A list ends where he stops naming fields: at a wish, a rule, or an action on
 * the record, wherever it stands.
 */
import { derivedColumns, columnsAnywhereInHisRequest, detectAppKind } from '../core/design/app-blueprints';

const labels = (text: string): string[] => (derivedColumns(text) || []).map(column => String(column.label));
const anywhere = (text: string): string[] => (columnsAnywhereInHisRequest(text) || []).map(column => String(column.label));

describe('the list ends at a wish, an order or a rule', () => {
    it.each([
        ['نظام مخزون: اسم الصنف، الكمية، السعر، وأبغاه بالعربي'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، وبدي يكون سريع'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، وأبغى الواجهة عربية'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، وخلي الألوان هادئة'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، وأضف زر للطباعة'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، أبغاه بالعربي'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر ولا تنشره'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، ويكون بالعربي'],
    ])('%s → his three fields, and nothing after them', text => {
        expect(labels(text)).toEqual(['اسم الصنف', 'الكمية', 'السعر']);
        expect(anywhere(text)).toEqual(['اسم الصنف', 'الكمية', 'السعر']);
    });
});

describe('an action on the record is not a field of it, anywhere in the list', () => {
    it.each([
        ['نظام مخزون: اسم الصنف، الكمية، السعر، حذف الصنف'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، إضافة صنف، تعديل الصنف'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، بحث بالاسم'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، والبحث عن صنف'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، وحذف الصنف'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، الحذف، التعديل'],
    ])('%s → three fields', text => {
        expect(labels(text)).toEqual(['اسم الصنف', 'الكمية', 'السعر']);
    });

    it('with two fields before the action there is no list of three', () => {
        expect(derivedColumns('نظام مخزون: اسم الصنف، الكمية، حذف الصنف')).toBeNull();
        expect(detectAppKind('نظام مخزون: اسم الصنف، الكمية، حذف الصنف')).toBe('inventory');
    });

    it('a list that opens with an action was never a list of fields', () => {
        expect(derivedColumns('نظام مخزون: إضافة صنف، تعديل الصنف، حذف الصنف')).toBeNull();
    });

    it.each([
        ['نظام مخزون: اسم الصنف، الكمية، تاريخ الإضافة، سجل التعديلات', ['اسم الصنف', 'الكمية', 'تاريخ الإضافة', 'سجل التعديلات']],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، تاريخ الحذف', ['اسم الصنف', 'الكمية', 'السعر', 'تاريخ الحذف']],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، سبب الحذف', ['اسم الصنف', 'الكمية', 'السعر', 'سبب الحذف']],
    ])('standing second the word names a field: %s', (text, expected) => {
        expect(labels(text)).toEqual(expected);
    });

    it('the older readers keep what they pinned', () => {
        expect(labels('بدي جدول فيه الاسم، الراتب، تعديل الراتب')).toEqual(['الاسم', 'الراتب', 'تعديل الراتب']);
        expect(derivedColumns('اعمل جدول مهام: اضافة المهام، تعديل المهام، حذف المهام')).toBeNull();
    });
});

describe('the fields the reader lost', () => {
    it.each([
        ['نظام مخزون: اسم الصنف، الكمية، السعر، والمورد', ['اسم الصنف', 'الكمية', 'السعر', 'المورد']],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، وصورة', ['اسم الصنف', 'الكمية', 'السعر', 'صورة']],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، واسم المورد', ['اسم الصنف', 'الكمية', 'السعر', 'اسم المورد']],
        ['تطبيق مصاريف: التاريخ، المبلغ، الفئة، وملاحظات', ['التاريخ', 'المبلغ', 'الفئة', 'ملاحظات']],
    ])('«و» after a comma is the conjunction: %s', (text, expected) => {
        expect(labels(text)).toEqual(expected);
    });

    it('«وزن» and «وحدة» are words, and keep their first letter', () => {
        expect(labels('نظام مخزون: اسم الصنف، الكمية، وزن الصنف، وحدة القياس'))
            .toEqual(['اسم الصنف', 'الكمية', 'وزن الصنف', 'وحدة القياس']);
        expect(labels('نظام مخزون: اسم الصنف، الكمية، السعر، وصف المنتج'))
            .toEqual(['اسم الصنف', 'الكمية', 'السعر', 'وصف المنتج']);
    });

    it.each([
        ['تطبيق مصاريف: التاريخ، المبلغ، الفئة، ملاحظات', ['التاريخ', 'المبلغ', 'الفئة', 'ملاحظات'], 'expenses'],
        ['تطبيق مهام: العنوان، تاريخ الاستحقاق، الأولوية، تم', ['العنوان', 'تاريخ الاستحقاق', 'الأولوية', 'تم'], 'tasks'],
        ['نظام مخزون: اسم الصنف، الكمية، آخر تعديل', ['اسم الصنف', 'الكمية', 'آخر تعديل'], 'inventory'],
        ['نظام مخزون: اسم الصنف، الكمية، تاريخ الإضافة، آخر تعديل', ['اسم الصنف', 'الكمية', 'تاريخ الإضافة', 'آخر تعديل'], 'inventory'],
        ['نظام عملاء: الاسم، رقم تلفونه، عنوانه', ['الاسم', 'رقم تلفونه', 'عنوانه'], 'crm'],
    ])('a bare word, a yes-or-no, a superlative, a possessive: %s', (text, expected, kind) => {
        expect(labels(text)).toEqual(expected);
        expect(detectAppKind(text)).toBe(kind);
    });

    it.each([
        ['نظام مخزون:\nاسم الصنف\nالكمية\nالسعر'],
        ['نظام مخزون:\n- اسم الصنف\n- الكمية\n- السعر'],
        ['نظام مخزون:\n1. اسم الصنف\n2. الكمية\n3. السعر'],
        ['نظام مخزون:\n\nاسم الصنف\n\nالكمية\n\nالسعر'],
    ])('the fields on the lines under the colon: %j', text => {
        expect(labels(text)).toEqual(['اسم الصنف', 'الكمية', 'السعر']);
    });

    it('a diacritized list reads like the plain one', () => {
        expect(labels('نِظام مَخزون: اِسم الصنف، الكَمية، السِعر')).toEqual(['اسم الصنف', 'الكمية', 'السعر']);
        //  …and where the marked request already reads, his spelling stays in his label.
        expect(labels('اِعمَل جَدوَل فيه الاسم والعُمر والمَدينة')).toEqual(['الاسم', 'العُمر', 'المَدينة']);
        expect(detectAppKind('نِظام مَخزون: اِسم الصنف، الكَمية، السِعر')).toBe(detectAppKind('نظام مخزون: اسم الصنف، الكمية، السعر'));
    });

    it('an app he named with no engine of its own still hangs its fields from the colon', () => {
        expect(labels('recipe app: name, ingredients, cook time, edit date')).toEqual(['name', 'ingredients', 'cook time', 'edit date']);
        expect(detectAppKind('build a recipe app: name, ingredients, cook time')).toBe('generic');
    });
});

describe('the kind of the app, beside a list he wrote', () => {
    it.each([
        ['نظام مخزون: اسم الصنف، الكمية، السعر', 'inventory'],
        ['نظام مخزون: اسم الصنف، الكمية، السعر، وأبغاه بالعربي', 'inventory'],
        ['crm with name, email, phone', 'crm'],
        ['crm with name, email, create date, delete date', 'crm'],
    ])('named and not ordered, the app keeps its kind: %s → %s', (text, kind) => {
        expect(detectAppKind(text)).toBe(kind);
        expect(labels(text).length).toBeGreaterThanOrEqual(3);
    });

    it('«create date» is the name of a field, not the order to build', () => {
        expect(labels('crm with name, email, create date, delete date')).toEqual(['name', 'email', 'create date', 'delete date']);
        expect(detectAppKind('crm with name, email, create date, delete date')).toBe(detectAppKind('crm with name, email, phone'));
    });

    it.each([
        ['ابن نظام مخزون: اسم الصنف، الكمية، تاريخ الإضافة، سجل التعديلات'],
        ['Build an inventory system: item name, quantity, price'],
        ['build a contacts app: name, phone, email, add note'],
        ['Build an inventory tracker: item name, quantity, add date, edit history'],
        ['أريد جدولاً فيه اسم المريض ورقم تلفونه ووقت الموعد'],
    ])('ordered with his own list, it is his table (the rule a-field-named-with-a-verb pins): %s → generic', text => {
        expect(detectAppKind(text)).toBe('generic');
    });

    it('the doubtful one, decided: a field named with a verb after plain names is a field', () => {
        expect(labels('build a contacts app: name, phone, email, add note')).toEqual(['name', 'phone', 'email', 'add note']);
    });
});

describe('what was never a list of fields stays unread', () => {
    it.each([
        ['متجر بفئات: قهوة، أدوات، حلويات'],
        ['اعمل صفحة فيها: الاسم والسعر'],
        ['نظام مخزون: لوحة التحكم، التقارير، الإعدادات'],
        ['inventory app: dashboard, reports, settings'],
    ])('%s → no columns', text => {
        expect(derivedColumns(text)).toBeNull();
    });

    it('«تطبيق مطعم: القائمة، الطلبات، الحجوزات» lists sections: the colon reader takes none of them', () => {
        expect(labels('تطبيق مطعم: القائمة، الطلبات، الحجوزات')).not.toContain('القائمة');
        expect(detectAppKind('تطبيق مطعم: القائمة، الطلبات، الحجوزات')).toBe('booking');
    });
});
