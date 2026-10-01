import { hasRequestedAction } from '../core/intelligence/requested-action';
import { classifyIntent, clearIntentCache } from '../core/intelligence/intent-classifier';
import { IntentParser } from '../core/intelligence/IntentParser';
import { columnsAnywhereInHisRequest } from '../core/design/app-blueprints';
import * as fs from 'fs';

jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(() => { throw new Error('probe must not call a provider'); }),
}));

const CASES: Array<[string, string]> = [
    ['D1-RUN', 'Run npm test and answer only with the result, no changes.'],
    ['D1-INSPECT', 'Inspect the logs and answer only, no file changes.'],
    ['D1-NODENY', 'Run npm test and answer only with the result.'],
    ['D1-NOTOOL', 'Answer only; no tool execution.'],
    ['D1-VERIFY', 'Please verify the project files and answer only with findings, no modifications.'],
    ['D2-URL', 'Summarize the page at https://example.com. Answer only, no file changes.'],
    ['D2-BARE', 'Describe the page at https://example.com'],
    ['D2-EXAMPLE', 'Use https://example.com as a sample URL in the example config.'],
    ['D3-NEWLINE', 'Explain this specification\nCreate an inventory register with columns name, price and quantity.'],
    ['D3-PERIOD', 'Explain the calculator design. Create a working calculator application.'],
    ['D3-COLON', 'Explain this specification: Create an inventory register with columns name, price and quantity.'],
    ['L1-EXACT', 'DIAGNOSTIC-INTENT-20261001: Answer this conceptual question only, in Arabic. No tool execution or file changes are authorized for this question. Compare two requirements: A) a browser-only bill splitter has numeric inputs for amount, tip percentage and people; it displays calculated total and per-person amount, with no accounts or database. B) an inventory register stores editable records with name, price and quantity in a database. Explain which needs persisted records, which needs an owned backend, and why a list of input labels does not define a CRUD application. Do not perform either requirement.'],
    ['L1-QONLY', 'Answer this conceptual question only: which needs persisted records, a bill splitter or an inventory register?'],
    ['L1-NOWORD', 'DIAGNOSTIC-INTENT-20261001: Give me just the requested comparison of A and B, nothing else.'],
    ['L2-BARE', 'Do not create files. Build me a shed.'],
    ['R1-KAWAFIR', 'بدي صفحة أسجل فيها مواعيد الزبونات: الاسم والتلفون ووقت الموعد'],
    ['R1-MURAJAA', 'أنشئ صفحة مراجعة للطلبات: اسم الطلب والحالة'],
    ['R1-MUQARAN', 'أنشئ صفحة مقارنة للمنتجات: الاسم والسعر'],
    ['R1-VERB', 'راجع هذا التصميم: الألوان والخطوط'],
    ['R2-MEASURED', 'اعمل لي أداة تحسب إيقاع القصيدة العربية'],
    ['R2-ENTWIN', 'Make me a tool that analyzes the rhythm of Arabic poetry'],
    ['R2-POEM', 'Create a poem about the moon'],
    ['R4-SUITE-ROL', 'I want a rolodex where I record my clients: name, phone and email'],
    ['R4-BARE-TEXT', 'I want a rolodex with name and nickname'],
    ['R4-BARE-PHONE', 'I want a rolodex with name and phone'],
    ['R4-CAPITALS', 'I want a list of capitals: Paris, Rome, Madrid'],
    ['R4-LIST-SUITE', 'I need a list of my clients with name and phone'],
    ['R4-KASHF', 'اعمل لي كشف بالديون فيه اسم الزبون والمبلغ'],
    ['R4-QAIMA', 'بدي قائمة مهام أضيف عليها وأشطب منها'],
    ['R4-TABLE-CAP', 'Create a table of European capitals'],
    ['RES-DEPLOY', 'Deploy my app to production'],
    ['RES-GIVEME', 'Give me a dashboard for my sales'],
    ['R6-WEDDING', 'عندي قاعة أفراح، بدي جدول للحجوزات فيه اسم العريس وتاريخ المناسبة والمبلغ'],
    ['R6-ENCOMMA', 'The server is down, build a status page'],
    ['R6-MULTI', 'Buy milk, call Ali, build a tracker'],
    ['R6-PLEASE', 'Please, build me a contact page.'],
    ['T-POLITE', 'Can you create an inventory register with columns name, price and quantity?'],
    ['T-POLITE-AR', 'هل يمكنك إنشاء تطبيق مخزون فيه حقول: الاسم، السعر، الكمية؟'],
    ['T-R3', 'No modifications to existing files. Build a local calculator.'],
    ['T-QUOTED', 'Explain the following specification without implementing it: "Build a CRM with contacts and deals."'],
    ['E-SCOPED', 'Build me a shed. No changes to the garden.'],
    ['E-LONGBUILD', 'Build me a small inventory app. It should have a products page with name and price, a search box to filter products, and a simple checkout form with a clean layout.'],
    ['E-ENGBRIEF', 'Build me a production-grade inventory management system from scratch with a product catalog, search, checkout, user accounts, order history, reporting dashboard, automated tests, and deployment scripts.'],
];

const READER_CASES: Array<[string, string]> = [
    ['M1-LIST-PHONE', 'list of my clients with name and phone'],
    ['M2-LIST-CAPITALS', 'list of capitals: Paris, Rome, Madrid'],
    ['M3-KASHF', 'كشف بالديون فيه اسم الزبون والمبلغ'],
    ['M4-ROLODEX', 'rolodex where I record my clients: name, phone and email'],
];

describe('c3b chain probe (measurement only)', () => {
    it('collects helper+classifier+parser verdicts', async () => {
        const rows: any[] = [];
        for (const [id, text] of CASES) {
            clearIntentCache();
            const helper = hasRequestedAction(text);
            const cls = await classifyIntent(text);
            let parsed: any;
            try {
                parsed = await IntentParser.parse(text, {} as any);
            } catch (e: any) {
                parsed = { error: String(e?.message || e) };
            }
            rows.push({
                id,
                helper: { isBuild: helper.isBuild, requiresAnswerOnly: helper.requiresAnswerOnly, reason: helper.reason },
                classifier: {
                    isBuild: (cls as any).isBuild, isBrowser: (cls as any).isBrowser,
                    isReadOnly: (cls as any).isReadOnly, isKnowledge: (cls as any).isKnowledgeQuestion,
                    reason: (cls as any).reason,
                },
                parser: {
                    tools: (parsed as any).requiredTools || null,
                    agent: (parsed as any).suggestedAgent || null,
                    rawKeys: parsed?.rawIntent ? Object.keys(parsed.rawIntent) : null,
                    error: (parsed as any).error || null,
                },
            });
        }
        const reader: any[] = [];
        for (const [id, text] of READER_CASES) {
            let cols: any = null;
            try {
                cols = columnsAnywhereInHisRequest(text);
            } catch (e: any) {
                cols = { error: String(e?.message || e) };
            }
            reader.push({ id, columns: cols });
        }
        const out = process.env.PROBE_OUT || 'c3b-probe-result.json';
        fs.writeFileSync(out, JSON.stringify({ rows, reader }, null, 1));
        expect(rows.length).toBe(CASES.length);
    });
});
