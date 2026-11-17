/**
 *  «ADD DATE» IS A DATE. «ADD TASKS» IS SOMETHING THE APP DOES.
 *
 *  Measured on the column reader before this:
 *
 *      «Build an inventory tracker: item name, quantity, add date, edit history»
 *          → item name · quantity                       (two of his four)
 *      «Build an asset register: asset name, add date, remove date, status»
 *          → nothing
 *      «Build a contact list with name, phone, email and add date»
 *          → name · phone · «email and»
 *      «Build a releases table with name, latest version and status»
 *          → name · «la»                                («latest» contains «test»)
 *      «نظام مخزون: اسم الصنف، الكمية، تاريخ الإضافة، سجل التعديلات»
 *          → nothing                                    («سجل», found in his fourth
 *                                                         field, read as the container)
 *      «اعمل جدول مهام: اضافة المهام، تعديل المهام، حذف المهام»
 *          → three columns named after three actions
 *
 *  English names «the date it was added» with the verb's own letters, and the
 *  rule «an action on a record is not a column» read the first word. A word
 *  cannot settle it — «add date» and «add task» are one shape — but the list
 *  and the request can (fieldsNamedWithAVerb):
 *
 *    - an action list OPENS with an action; a field named with a verb stands
 *      after a plain name;
 *    - it is the verb's word and ONE bare singular noun — a plural, a pronoun,
 *      an article or a quantity is a verb and its object;
 *    - and its noun is not what the app's actions are done to: that noun is
 *      named again in the request (the thing the table holds, the object of
 *      the next action), unless it is a kind of value («add date, edit date»).
 *
 *  Every neighbour is pinned beside it: the action lists that must stay
 *  actions, in both languages and four dialects, and the colon lists that
 *  name an app's sections rather than its fields.
 */
import { derivedColumns, detectAppKind, hasExplicitRecordSchema, clausesBeyondTheColumns } from '../core/design/app-blueprints';
import { acceptanceFor } from '../core/quality/acceptance';

const labels = (r: string) => (derivedColumns(r) || []).map(f => f.label);
const ids = (r: string) => acceptanceFor(r).map(c => c.id);
const columnCriteria = (r: string) => ids(r).filter(id => id.startsWith('column:'));

describe('a field named with a verb is a column, and the list goes on after it', () => {
    it('the inventory tracker keeps all four, typed, each with its own criterion', () => {
        const request = 'Build an inventory tracker: item name, quantity, add date, edit history';
        const fields = derivedColumns(request) || [];
        expect(fields.map(f => f.label)).toEqual(['item name', 'quantity', 'add date', 'edit history']);
        //  «add date» is a date; «edit history» is text.
        expect(fields.map(f => f.type)).toEqual(['text', 'number', 'date', 'text']);
        expect(hasExplicitRecordSchema(request)).toBe(true);
        expect(detectAppKind(request)).toBe('generic');
        expect(columnCriteria(request)).toEqual(['column:text1', 'column:count1', 'column:date1', 'column:text2']);
    });

    it('…and the field is owed once: «add date» is his column, not also a change he ordered', () => {
        //  The rule reader files a clause that opens with «add» as a change.
        //  Kept beside the column, one field was owed twice — the second time
        //  as a condition no source can prove.
        const rules = (r: string) => ids(r).filter(id => id.startsWith('rule:'));
        expect(rules('Build an inventory tracker: item name, quantity, add date, edit history')).toEqual([]);
        expect(rules('Build an asset register: asset name, add date, remove date, status')).toEqual([]);
        //  Two of them in one clause, joined by «and».
        expect(rules('Build an inventory tracker with item name, quantity, add date and edit history')).toEqual([]);
        expect(clausesBeyondTheColumns('Build an asset register: asset name, add date, remove date, status')).toEqual([]);
    });

    it('…while an action he really ordered is still a condition he is owed', () => {
        const rules = (r: string) => ids(r).filter(id => id.startsWith('rule:'));
        expect(rules('Build a tasks tracker: title, status, add task, delete task')).toEqual(['rule:1', 'rule:2']);
        expect(rules('Build an inventory tracker: item name, quantity, add date. Add a dark theme and remove the footer')).toEqual(['rule:1']);
    });

    it.each([
        ['Build an inventory tracker with item name, quantity, add date and edit history', ['item name', 'quantity', 'add date', 'edit history']],
        ['Build an inventory app with item name, quantity, add date and edit history', ['item name', 'quantity', 'add date', 'edit history']],
        ['Build an inventory app. Columns: item name, quantity, add date, edit history', ['item name', 'quantity', 'add date', 'edit history']],
        ['Create an inventory tracker. Add item name, quantity, add date, and edit history', ['item name', 'quantity', 'add date', 'edit history']],
        ['Create an orders table: customer name, total, create date, delete reason', ['customer name', 'total', 'create date', 'delete reason']],
        ['Build a file register: file name, size, save date, rename count', ['file name', 'size', 'save date', 'rename count']],
        ['Create a tasks tracker: title, due date, create time, edit count', ['title', 'due date', 'create time', 'edit count']],
        ['Create a users table: name, email, create date, delete flag', ['name', 'email', 'create date', 'delete flag']],
        ['Build a document tracker: title, owner, edit history, save count', ['title', 'owner', 'edit history', 'save count']],
        //  Two fields with one noun are two fields when the noun is a kind of value.
        ['Build an asset register: asset name, add date, remove date, status', ['asset name', 'add date', 'remove date', 'status']],
        //  The cut that ends a list at «add» no longer leaves «and» on the column before it…
        ['Build a contact list with name, phone, email and add date', ['name', 'phone', 'email', 'add date']],
        ['Build a small expenses app. Include date, amount, category and note and show totals', ['date', 'amount', 'category', 'note']],
        //  …and it cuts at a word, not inside one.
        ['Build a releases table with name, latest version and status', ['name', 'latest version', 'status']],
    ])('%s', (request, expected) => {
        expect(labels(request)).toEqual(expected);
        expect(columnCriteria(request)).toHaveLength(expected.length);
    });

    it.each([
        //  The same fields said with a participle were never lost; they stay.
        ['Build an inventory tracker: item name, quantity, added date, edited by', ['item name', 'quantity', 'added date', 'edited by']],
    ])('%s (unchanged)', (request, expected) => {
        expect(labels(request)).toEqual(expected);
    });
});

describe('…and in Arabic, where the verb\'s word stands second in the name', () => {
    it.each([
        //  The neighbour the round named, with and without a verb.
        ['نظام مخزون: اسم الصنف، الكمية، تاريخ الإضافة، سجل التعديلات', ['اسم الصنف', 'الكمية', 'تاريخ الإضافة', 'سجل التعديلات']],
        ['ابن نظام مخزون: اسم الصنف، الكمية، تاريخ الإضافة، سجل التعديلات', ['اسم الصنف', 'الكمية', 'تاريخ الإضافة', 'سجل التعديلات']],
        //  A container named: these always read, and still do.
        ['جدول مخزون: اسم الصنف، الكمية، تاريخ الإضافة، سجل التعديلات', ['اسم الصنف', 'الكمية', 'تاريخ الإضافة', 'سجل التعديلات']],
        ['سجل مخزون: اسم الصنف، الكمية، تاريخ الإضافة، سجل التعديلات', ['اسم الصنف', 'الكمية', 'تاريخ الإضافة', 'سجل التعديلات']],
        ['اعمل جدول مخزون فيه اسم الصنف والكمية وتاريخ الإضافة وسجل التعديلات', ['اسم الصنف', 'الكمية', 'تاريخ الإضافة', 'سجل التعديلات']],
        ['ابن نظام مخزون فيه اسم الصنف والكمية وتاريخ الإضافة وسجل التعديلات', ['اسم الصنف', 'الكمية', 'تاريخ الإضافة', 'سجل التعديلات']],
        //  Levantine, Egyptian, Gulf.
        ['بدي جدول للمخزون فيه اسم الصنف والكمية وتاريخ الاضافة وتاريخ التعديل', ['اسم الصنف', 'الكمية', 'تاريخ الاضافة', 'تاريخ التعديل']],
        ['عايز جدول للمنتجات: اسم المنتج، السعر، تاريخ الإضافة، تاريخ الحذف', ['اسم المنتج', 'السعر', 'تاريخ الإضافة', 'تاريخ الحذف']],
        ['ابغى جدول للأصناف: اسم الصنف، الكمية، تاريخ الإنشاء، سبب الحذف', ['اسم الصنف', 'الكمية', 'تاريخ الإنشاء', 'سبب الحذف']],
        //  A masdar that opens a LATER item is left to the tests it already passes.
        ['أنشئ جدول موظفين: الاسم، الراتب، تعديل الراتب', ['الاسم', 'الراتب', 'تعديل الراتب']],
    ])('%s', (request, expected) => {
        expect(labels(request)).toEqual(expected);
    });

    it('the ordered system is his table, and each of his four fields is owed', () => {
        const request = 'ابن نظام مخزون: اسم الصنف، الكمية، تاريخ الإضافة، سجل التعديلات';
        expect(hasExplicitRecordSchema(request)).toBe(true);
        expect(detectAppKind(request)).toBe('generic');
        expect(columnCriteria(request)).toEqual(['column:text1', 'column:count1', 'column:date1', 'column:text2']);
    });
});

describe('a list of actions is still a list of actions', () => {
    it.each([
        //  The two the round named.
        'Build a todo app: add tasks, edit them, delete them, mark done',
        'تطبيق مهام: إضافة مهمة، تعديلها، حذفها',
        //  English: plurals, pronouns, articles, quantities, telegraphic singulars.
        'Build a notes app: add notes, edit notes, delete notes',
        'Build a contacts tracker: add contacts, edit contacts, delete contacts',
        'Build a product tracker: add products, remove products, rename products',
        'Build a tasks board: add task, edit task, delete task',
        'Build a tracker: create a task, edit the task, delete the task',
        'Create a tracker: add new items, edit existing items, remove old items',
        'Build a library tracker: add books, save changes, delete records',
        'Build an inventory tracker: add items, edit quantities, delete items, export data',
        'Create a todo list: add, edit, delete and search tasks',
        'Build an admin table to manage patients: add, edit, delete and search each one',
        'Build a todo app where I can add tasks, edit tasks and delete tasks',
        'Build a todo app with title, due date, add tasks and delete tasks',
        'Use the browser to validate an e-commerce flow: search, open a product, add it to the cart, change quantity, remove it, and verify the total.',
        //  Arabic: MSA, and a masdar with a DEFINITE object, which the article used to let through.
        'ابن تطبيق مهام: إضافة مهمة، تعديل المهمة، حذف المهمة',
        'اعمل جدول مهام: اضافة المهام، تعديل المهام، حذف المهام',
        'ابغى جدول مهام: إضافة المهام، حذف المهام، البحث',
        //  Levantine and Egyptian, with the verb in the first person.
        'بدي تطبيق مهام: اضيف مهمة، اعدلها، احذفها',
        'عايز تطبيق مهام أضيف فيه مهمة وأعدلها وأحذفها',
    ])('%s → no columns, no schema', request => {
        expect(labels(request)).toEqual([]);
        expect(hasExplicitRecordSchema(request)).toBe(false);
        expect(columnCriteria(request)).toEqual([]);
    });

    it.each([
        //  After plain names, an action on the thing the request names again ends the list.
        ['A students table: name, class and grade, add student, delete student', ['name', 'class', 'grade']],
        ['A students table: name, class, grade, add student', ['name', 'class', 'grade']],
        ['Build a tasks tracker: title, status, add task, delete task', ['title', 'status']],
        ['Build an orders tracker: customer, total, status, add order, edit order, delete order', ['customer', 'total', 'status']],
        ['Build a contacts table with name, phone and email, add and delete contacts', ['name', 'phone', 'email']],
        ['Build an inventory tracker: item name, quantity, add it to the cart', ['item name', 'quantity']],
    ])('%s ends at the action', (request, expected) => {
        expect(labels(request)).toEqual(expected);
    });

    it('the limit, stated: one telegraphic action on a thing named nowhere else reads as a column', () => {
        //  «add stock» and «add date» are one shape, and «stock» is named once.
        //  Before this change the list ended there; it is pinned so the limit is seen.
        expect(labels('Build an inventory tracker: item name, quantity, add stock')).toEqual(['item name', 'quantity', 'add stock']);
    });
});

describe('a colon list after an app: his fields, or its sections', () => {
    it.each([
        ['Build an inventory system: item name, quantity, price', ['item name', 'quantity', 'price']],
        ['نظام مخزون: اسم الصنف، الكمية، السعر', ['اسم الصنف', 'الكمية', 'السعر']],
        ['ابن نظام مخزون: اسم الصنف، الكمية، السعر، المورد', ['اسم الصنف', 'الكمية', 'السعر', 'المورد']],
        ['تطبيق مهام: العنوان، تاريخ الاستحقاق، الأولوية', ['العنوان', 'تاريخ الاستحقاق', 'الأولوية']],
        ['اعمل نظام لإدارة العملاء: الاسم، الهاتف، المدينة', ['الاسم', 'الهاتف', 'المدينة']],
        ['نظام حجوزات: التاريخ، الوقت، الخدمة', ['التاريخ', 'الوقت', 'الخدمة']],
        ['Build a notes app: title, body, tags', ['title', 'body', 'tags']],
        //  A field named with a verb, in a list no container word introduced.
        ['Build an inventory system: item name, quantity, add date, edit history', ['item name', 'quantity', 'add date', 'edit history']],
    ])('%s opens with a field: his columns', (request, expected) => {
        expect(labels(request)).toEqual(expected);
    });

    it.each(COLON_LISTS_THAT_ARE_NOT_FIELDS())('%s → no columns', request => {
        expect(labels(request)).toEqual([]);
        expect(columnCriteria(request)).toEqual([]);
    });
});

function COLON_LISTS_THAT_ARE_NOT_FIELDS(): string[] {
    return [
        //  Sections and modules of an app: the list opens with a section.
        'نظام مخزون: الأصناف، الموردين، التقارير',
        'Build a store app: products, cart, checkout',
        'Build a CRM app: contacts, deals, notes',
        'Build a blog app: posts, comments, tags',
        'Build a task manager app. Features: title editing, due dates, priorities',
        //  It opens with fields and goes on to features: more than one item names no kind of value.
        'Build a POS system: name, price, quantity, checkout, receipts',
        //  Values of one field, indefinite in Arabic.
        'متجر بفئات: قهوة، أدوات، حلويات',
        //  A page, a card, a game, a command-line tool: no records engine is being built.
        'صمم بطاقة عمل: الاسم، المسمى الوظيفي، رقم الهاتف',
        'Build a landing page for an inventory app: name, price, features',
        'Build a quiz game about inventory: name, score, time',
        'Write a CLI tool for inventory: name, quantity, price',
        //  One field among settings is not a list of fields.
        'تطبيق مطعم: الاسم التجاري، الشعار، الألوان',
        'نظام مخزون: الاسم StockPro، اللغة عربي، اللون أزرق',
        //  A clause, not a name.
        'Build an inventory app: name it StockPro, price it right, add stock alerts',
    ];
}

describe('existing readings beside the change', () => {
    it.each([
        ['Build a contact list with name, phone and email', ['name', 'phone', 'email']],
        ['Create an expense tracker. Add amount, category, date, and note', ['amount', 'category', 'date', 'note']],
        ['Build a small expenses app. Include date, amount, category and note.', ['date', 'amount', 'category', 'note']],
        ['A students table: name, class and grade, with search by name', ['name', 'class', 'grade']],
        ['بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ', ['رقم الفاتورة', 'المبلغ', 'التاريخ']],
        ['قائمة موظفين: الاسم، القسم، الراتب', ['الاسم', 'القسم', 'الراتب']],
    ])('%s', (request, expected) => {
        expect(labels(request)).toEqual(expected);
    });

    it('a shopping list still holds things', () => {
        expect(derivedColumns('A shopping list with milk, bread and eggs')).toBeNull();
    });
});

describe('the readers on this path stay linear', () => {
    //  The clock is this process's CPU time, not the wall: the suite runs on a
    //  machine saturated by other work, where the wall reads its neighbours.
    //  Measured at 20 KB: 15–160 ms of CPU each. Before the verb's word
    //  stopped being taken to the Arabic language layer, a long English list
    //  of two-word items («due date, due date, …») took 1.6 s at 5 KB.
    const BOUND_MS = 1000;
    const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    const timed = (text: string): number => {
        const t0 = process.cpuUsage();
        derivedColumns(text);
        const spent = process.cpuUsage(t0);
        return (spent.user + spent.system) / 1000;
    };

    it.each([
        ['a long list of fields named with a verb', `Build a tracker: name, ${rep('add date, edit history, ', 20_000)}`],
        ['…handed over by an introducer', `Build a tracker with name, ${rep('add date, ', 20_000)}`],
        ['…joined by «and»', `Build a tracker with name ${rep('and add date ', 20_000)}`],
        ['a record verb repeated', `Build a tracker with name, ${rep('add ', 20_000)}`],
        ['a long list of two-word names', `Build a tracker with name, ${rep('due date, ', 20_000)}`],
        ['one short sentence after another', rep('Build a tracker with name, size, add flag. ', 20_000)],
        ['a colon list after an app', `Build an inventory system: item name, ${rep('add date, edit history, ', 20_000)}`],
        ['colons', rep('system: name: add date: ', 20_000)],
    ] as Array<[string, string]>)('%s', (_label, text) => {
        timed(text.slice(0, 2000)); // warm
        expect(timed(text)).toBeLessThan(BOUND_MS);
    });
});
