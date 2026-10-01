import { classifyIntent, clearIntentCache } from '../core/intelligence/intent-classifier';
import { IntentParser } from '../core/intelligence/IntentParser';
import { hasRequestedAction } from '../core/intelligence/requested-action';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(() => { throw new Error('PROBE_MUST_NOT_CALL_PROVIDER'); }),
}));

const CASES: Array<[string, string]> = [
    ['LIVE-EN-EXACT', 'DIAGNOSTIC-INTENT-20261001: Answer this conceptual question only, in Arabic. No tool execution or file changes are authorized for this question. Compare two requirements: A) a browser-only bill splitter has numeric inputs for amount, tip percentage and people; it displays calculated total and per-person amount, with no accounts or database. B) an inventory register stores editable records with name, price and quantity in a database. Explain which needs persisted records, which needs an owned backend, and why a list of input labels does not define a CRUD application. Do not perform either requirement.'],
    ['LIVE-EN-NOWORD', 'DIAGNOSTIC-INTENT: In Arabic. No tool execution or file changes authorized. Requirement A: browser-only bill splitter, numeric inputs amount, tip, people; shows total and per-person. Requirement B: inventory register, editable records name, price, quantity in a database. State the persistence needs of each.'],
    ['LIVE-AR-EXACT', 'اشرح الفرق بين حاسبة فيها حقول: المبلغ، النسبة، عدد الأشخاص، وسجل يحفظ البيانات. أريد شرحاً فقط بدون إنشاء أو تعديل ملفات.'],
    ['LIVE-EN-SIMPLE', 'Explain why a calculator with fields amount, rate and people is different from a database register. Answer only; do not create files.'],
    ['DIAG-RUN-TESTS', 'Run npm test and answer only with the result, no changes.'],
    ['DIAG-INSPECT', 'Inspect the logs and answer only, no file changes.'],
    ['URL-GENUINE', 'Summarize the page at https://example.com. Answer only, no file changes.'],
    ['REVIEW-FIX', 'Review the code and fix the login bug without changing any tests.'],
    ['DENY-BARE', 'Do not create files. Build me a shed.'],
    ['V2R1-KWAFIR', 'بدي صفحة أسجل فيها مواعيد الزبونات: الاسم والتلفون ووقت الموعد'],
    ['V2R1-NOUN-MURAJAA', 'أنشئ صفحة مراجعة للطلبات: الاسم والهاتف والحالة'],
    ['V2R1-VERB-CTRL', 'راجع هذا التصميم: زر كبير وقائمة علوية'],
    ['V2R2-MEASURED', 'اعمل لي أداة تحسب إيقاع القصيدة العربية'],
    ['V2R3-NEWLINE', 'Explain this specification\nCreate an inventory register with columns name and price'],
    ['V2R3-COLON-CTRL', 'Explain this specification:\nCreate an inventory register with columns name and price'],
    ['R4-ROLODEX', 'I want a rolodex where I record my clients: name, phone and email'],
    ['R4-CAPITALS', 'I want a list of capitals: Paris, Rome, Madrid'],
    ['CTRL-LONGBUILD', 'Create a real working application from scratch with editable inventory records, authentication, a database, API and frontend. Add integration tests and browser screenshot verification, maintain workspace isolation, document safe local startup and all installation requirements. Do not deploy production.'],
    ['CTRL-QUOTED', 'Explain this proposed specification without executing it: "Create a real working production-grade autonomous application from scratch with editable inventory records, authentication, a database, API and frontend, integration tests, browser screenshots, workspace isolation and deployment scripts." No file changes.'],
    ['CTRL-POLITE', 'Can you create an inventory register with columns name, price and quantity?'],
    ['R6-WEDDING', 'عندي قاعة أفراح، بدي جدول للحجوزات فيه اسم العريس وتاريخ المناسبة والمبلغ'],
    ['R2-MARKET', 'Create a multi-vendor marketplace'],
    ['R2-PANEL', 'build an admin panel'],
    ['CTRL-LOGIN-NEG', 'سجّل دخولي بالإيميل'],
];

describe('C3 composed boundary probe', () => {
    it('records the full routing chain for every case', async () => {
        const rows: any[] = [];
        for (const [id, input] of CASES) {
            clearIntentCache();
            const helper = hasRequestedAction(input);
            clearIntentCache();
            const cls = await classifyIntent(input);
            clearIntentCache();
            let parsed: any;
            try {
                const intent = await IntentParser.parse(input, {} as any);
                parsed = { tools: intent.requiredTools, rawKeys: Object.keys(intent.rawIntent || {}) };
            } catch (e: any) {
                parsed = { tools: ['THREW:' + String(e && e.message).slice(0, 40)], rawKeys: [] };
            }
            rows.push({
                id,
                helper: { isBuild: helper.isBuild, requiresAnswerOnly: (helper as any).requiresAnswerOnly, reason: helper.reason },
                cls: { isBuild: cls.isBuild, isBrowser: cls.isBrowser, isReadOnly: cls.isReadOnly, isKnowledge: cls.isKnowledgeQuestion, reason: cls.reason },
                parsed,
            });
        }
        const out = process.env.C3_PROBE_OUT || path.join(__dirname, 'c3-probe-output.json');
        fs.writeFileSync(out, JSON.stringify(rows, null, 1));
    });
});
