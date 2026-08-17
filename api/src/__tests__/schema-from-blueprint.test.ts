/**
 * THE SERVER STORES WHAT THE APP SENDS — THE WHOLE ROW, NOT ITS NAME.
 *
 * «اريد نظام حقيقي وليس فقط شغل كلام … اريد بلدر فتاكاً يبني اي شيء».
 *
 * Every generated backend stored name/details/price, whatever the system was
 * about. A clinic's React app posts {name, phone, service, date, time, status}
 * and the database kept `name`: five of six fields dropped on the floor,
 * silently, on every single save. The two halves of the "full stack" agreed on
 * the resource's NAME and on nothing else.
 *
 * The columns now come from the same blueprint the interface renders from.
 */
import { apiColumnsForRequest, CATALOGUE_COLUMNS } from '../modules/tools/definitions/ApiProjectTool';
import { blueprintFor, detectAppKind } from '../core/design/app-blueprints';
import { designDataModel } from '../core/design/schema-designer';

describe('the schema follows the app, not a fixed guess', () => {
    it('a clinic booking system stores date, time and status', () => {
        const cols = apiColumnsForRequest('نظام حجز مواعيد لعيادة أسنان مع قاعدة بيانات');
        const keys = cols.map(c => c.key);
        expect(keys).toEqual(expect.arrayContaining(['name', 'phone', 'service', 'date', 'time', 'status']));
        expect(cols.find(c => c.key === 'name')!.required).toBe(true);
    });

    it('an expense tracker stores its amount as a NUMBER', () => {
        const cols = apiColumnsForRequest('تطبيق لتتبّع المصاريف الشخصية');
        const amount = cols.find(c => c.type === 'REAL');
        expect(amount).toBeTruthy();
    });

    it('a complete finance request gets income, expense and budget resources', async () => {
        const model = await designDataModel(`Build a complete personal finance app called MoneyTrack. Track income and expenses, create budgets by category, show dashboard charts and monthly totals.`);
        expect(model.map(entity => entity.key)).toEqual(['incomes', 'expenses', 'budgets']);
        expect(model.find(entity => entity.key === 'incomes')!.fields.map(field => field.key))
            .toEqual(expect.arrayContaining(['source', 'amount', 'category', 'date']));
        expect(model.find(entity => entity.key === 'expenses')!.fields.map(field => field.key))
            .toEqual(expect.arrayContaining(['title', 'amount', 'category', 'date']));
        expect(model.find(entity => entity.key === 'budgets')!.fields.map(field => field.key))
            .toEqual(expect.arrayContaining(['category', 'limit_amount', 'period']));
        expect(model.find(entity => entity.key === 'incomes')!.fields.find(field => field.key === 'amount')!.type).toBe('REAL');
        expect(model.find(entity => entity.key === 'expenses')!.fields.find(field => field.key === 'amount')!.type).toBe('REAL');
        expect(model.find(entity => entity.key === 'budgets')!.fields.find(field => field.key === 'limit_amount')!.type).toBe('REAL');
    });

    it('and an online store stores price, image, category and stock', () => {
        const keys = apiColumnsForRequest('متجر إلكتروني لبيع العطور مع سلة').map(c => c.key);
        expect(keys).toEqual(expect.arrayContaining(['name', 'price', 'category', 'image', 'stock']));
    });

    it('every column matches the blueprint the FRONTEND renders', () => {
        // This is the whole point: one source of truth for both halves — the
        // blueprint's own fields, plus the link column when the blueprint
        // declares a parent table («طبيب ← مواعيده»).
        const req = 'نظام حجز مواعيد لعيادة';
        const kind = detectAppKind(req)!;
        const bp = blueprintFor(kind, req, true);
        const keys = apiColumnsForRequest(req).map(c => c.key);
        expect(keys).toEqual([...bp.fields.map(f => f.key), bp.relation!.key]);
    });

    it('a presentation site keeps the catalogue shape it really posts', () => {
        // A boutique's page and a restaurant menu are section builders; their
        // frontends genuinely send name/details/price, and changing that would
        // break a chain that works.
        expect(apiColumnsForRequest('موقع لمحل عطور فاخر')).toBe(CATALOGUE_COLUMNS);
        expect(apiColumnsForRequest('')).toBe(CATALOGUE_COLUMNS);
    });

    it('and a column name can never be anything but a safe identifier', () => {
        for (const c of apiColumnsForRequest('نظام إدارة عملاء')) {
            expect(c.key).toMatch(/^[a-zA-Z0-9_]{1,40}$/);
        }
    });
});
