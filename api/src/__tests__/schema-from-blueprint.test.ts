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
import { apiColumnsForRequest, apiPrimaryColumnsForApp, CATALOGUE_COLUMNS } from '../modules/tools/definitions/ApiProjectTool';
import { blueprintFor, detectAppKind, APP_KIND_SIGNALS, maskNegatedSpans } from '../core/design/app-blueprints';
import { extractRunReceiptEvidence } from '../modules/services/AgentLoopService';
import { designDataModel } from '../core/design/schema-designer';
import { fileFinanceAppJsx } from '../modules/tools/definitions/react-app-templates';
import { transform } from 'esbuild';

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
            .toEqual(expect.arrayContaining(['source', 'amount', 'category', 'date', 'description']));
        expect(model.find(entity => entity.key === 'expenses')!.fields.map(field => field.key))
            .toEqual(expect.arrayContaining(['description', 'amount', 'category', 'date']));
        expect(model.find(entity => entity.key === 'budgets')!.fields.map(field => field.key))
            .toEqual(expect.arrayContaining(['category', 'limit_amount', 'period']));
        expect(model.find(entity => entity.key === 'incomes')!.fields.find(field => field.key === 'amount')!.type).toBe('REAL');
        expect(model.find(entity => entity.key === 'expenses')!.fields.find(field => field.key === 'amount')!.type).toBe('REAL');
        expect(model.find(entity => entity.key === 'budgets')!.fields.find(field => field.key === 'limit_amount')!.type).toBe('REAL');
    });

    it('the finance primary API table uses the designed income contract, not catalogue columns', async () => {
        const request = 'Build a complete personal finance app called MoneyTrack. Track income and expenses, create budgets by category, show dashboard charts and monthly totals.';
        const model = await designDataModel(request);
        const columns = apiPrimaryColumnsForApp('finance', 'incomes', model);
        expect(columns.map(column => column.key)).toEqual(['source', 'amount', 'category', 'date', 'description']);
        expect(columns.find(column => column.key === 'amount')!.type).toBe('REAL');
        expect(columns.map(column => column.key)).not.toEqual(expect.arrayContaining(['name', 'details', 'price']));
        expect(apiPrimaryColumnsForApp('finance', 'missing', model)).toEqual([]);
    });

    it('FinanceApp emits a closed JSX expression for the editor heading', () => {
        const jsx = fileFinanceAppJsx(false);
        expect(jsx).toContain("<h2>{editing ? 'Edit entry' : 'New entry'}</h2>");
        expect(jsx).not.toContain("'New entry'</h2>");
        expect(jsx).not.toContain("</h2>}");
        expect(jsx).toContain('Date filtering');
        expect(jsx).toContain('Spending by category');
        expect(jsx).toContain('Budget progress');
        expect(jsx).toContain('Category management');
        expect(jsx).toContain('const formatMoney =');
        expect(jsx).toContain('const filteredBalance =');
        expect(jsx).toContain('const budgetSpent =');
        expect(jsx).toContain('const budgetPercent =');
        expect(jsx).toContain('Intl.NumberFormat');
        expect(jsx).toContain("input('description'");
    });

    it('the generated FinanceApp is valid JSX', async () => {
        const result = await transform(fileFinanceAppJsx(false), { loader: 'jsx', jsx: 'automatic', format: 'esm' });
        expect(result.code).toContain('function FinanceApp');
    });

    it('049 uses the exported signal registry and masks negated domain spans', () => {
        expect(APP_KIND_SIGNALS.find(([kind]) => kind === 'weather')?.[1].test('open-meteo forecast')).toBe(true);
        expect(detectAppKind('Build a records dashboard, not a weather app, with search and CSV export')).toBe('generic');
        expect(detectAppKind('Build a live open-meteo weather forecast app')).toBe('weather');
        expect(maskNegatedSpans('Build an app, not a weather dashboard')).not.toMatch(/weather/i);
    });

    it('049 treats Arabic negation markers as standalone words, not substrings', () => {
        expect(maskNegatedSpans('نظام إدارة علاقات العملاء')).toContain('علاقات');
        expect(maskNegatedSpans('نظام إدارة صلاحيات المستخدمين')).toContain('صلاحيات');
        expect(maskNegatedSpans('نظام إدارة لوحة إعلانات')).toContain('إعلانات');
        expect(detectAppKind('نظام إدارة علاقات العملاء')).toBe('crm');
        expect(detectAppKind('نظام إدارة صلاحيات المستخدمين')).toBe('generic');
        expect(detectAppKind('نظام إدارة لوحة إعلانات')).toBe('generic');
        expect(maskNegatedSpans('لا أريد كتيّباً، ابنِ تطبيقاً حقيقياً')).not.toMatch(/كتيّب/);
        expect(maskNegatedSpans('Build a real app, not a brochure')).not.toMatch(/brochure/i);
        expect(detectAppKind('Build a brochure for my bakery')).toBeNull();
    });

    it('048c extracts structural evidence from nested orchestrator and phase envelopes', () => {
        const receipt = extractRunReceiptEvidence({
            result: {
                steps: [{
                    output: {
                        results: [{
                            phaseName: 'Project Setup',
                            projectRoot: '/tmp/weathergo',
                            projectRootRuntimeBound: true,
                            results: [{ tool: 'ai_write_file', ok: false, error: 'authored files never landed' }],
                            honestBlocker: true,
                            selfFixFailureReason: 'self-fix exhausted',
                        }],
                    },
                }],
            },
        }, 'run-048c', 'session-048c', 'failed');
        expect(receipt.projectRoot).toBe('/tmp/weathergo');
        expect(receipt.taskReceipts).toEqual([{ tool: 'ai_write_file', ok: false, error: 'authored files never landed' }]);
        expect(receipt.selfFixReason).toBe('self-fix exhausted');
        expect(receipt.honestBlocker).toBe(true);
    });

    it('an online store stores price, image, category and stock', () => {
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
