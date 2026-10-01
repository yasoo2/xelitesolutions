const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('D:/Joe/muse-worktree/api/node_modules/typescript');
const snowball = require('D:/Joe/xelitesolutions/api/node_modules/snowball-stemmers');

const CAND = 'C:/Users/home/.codex/worktrees/requested-action-contract/xelitesolutions/api/src';
const BASELINE_CLASSIFIER = 'D:/Joe/muse-worktree/tmp/team-consultation/baseline-intent-classifier.ts';

function loadTS(absFile, shim) {
    const source = fs.readFileSync(absFile, 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const m = new Module(absFile, null);
    m.filename = absFile;
    m.paths = Module._nodeModulePaths(path.dirname(absFile));
    const localRequire = (spec) => {
        if (shim && Object.prototype.hasOwnProperty.call(shim, spec)) return shim[spec];
        throw new Error('unmapped require: ' + spec + ' from ' + absFile);
    };
    const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', js);
    fn(localRequire, m, m.exports, absFile, path.dirname(absFile));
    return m.exports;
}

const promptNormalizer = loadTS(path.join(CAND, 'core/orchestrator/promptNormalizer.ts'), {});
const arabicLib = loadTS(path.join(CAND, 'core/language/arabic.ts'), { 'snowball-stemmers': snowball });
const pageHead = loadTS(path.join(CAND, 'core/design/page-head.ts'), {});
const subjectPhrase = loadTS(path.join(CAND, 'core/design/subject-phrase.ts'), {});
const blueprints = loadTS(path.join(CAND, 'core/design/app-blueprints.ts'), {
    '../orchestrator/promptNormalizer': promptNormalizer,
    '../language/arabic': arabicLib,
    './page-head': pageHead,
    './subject-phrase': subjectPhrase,
    typescript: ts,
});
const routerStub = { routeToModel: () => { throw new Error('no provider in probe'); } };
const oldClassifier = loadTS(BASELINE_CLASSIFIER, {
    '../orchestrator/promptNormalizer': promptNormalizer,
    '../design/app-blueprints': blueprints,
    '../llm/intelligent-router': routerStub,
});
const reqAction = loadTS(path.join(CAND, 'core/intelligence/requested-action.ts'), {});
const newClassifier = loadTS(path.join(CAND, 'core/intelligence/intent-classifier.ts'), {
    '../orchestrator/promptNormalizer': promptNormalizer,
    '../design/app-blueprints': blueprints,
    '../llm/intelligent-router': routerStub,
    './requested-action': reqAction,
});

const HIS = `Build a world-class e-commerce platform similar to Shopify.

Features:

Multi-vendor marketplace AI product generation Inventory management Payments Shipping Coupons Loyalty program Mobile app Analytics Customer support Marketing automation SEO Multi-language Multi-currency Generate complete production-ready code.`;

const cases = [
    ['people-45 muhtaj', 'محتاج تطبيق لإدارة المخزون', true],
    ['people-52 isna', 'اصنع صفحة فيها قائمة', true],
    ['build-HIS', HIS, true],
    ['build-marketplace', 'Create a multi-vendor marketplace', true],
    ['build-panel', 'build an admin panel', true],
    ['build-portal', 'create a booking portal', true],
    ['noun-wedding', 'عندي قاعة أفراح، بدي جدول للحجوزات فيه اسم العريس وتاريخ المناسبة والمبلغ', true],
    ['noun-kashf', 'اعمل لي كشف بالديون فيه اسم الزبون والمبلغ', true],
    ['noun-list', 'I need a list of my clients with name and phone', true],
    ['noun-login-NEG', 'سجّل دخولي بالإيميل', false],
    ['noun-kurrasa', 'بدي كرّاسة أدوّن فيها الشتلات: اسم الشتلة والكمية والسعر', true],
    ['noun-fatura', 'اعمل لي فاتورة فيها: اسم الصنف والكمية والسعر والإجمالي', true],
    ['noun-rolodex', 'I want a rolodex where I record my clients: name, phone and email', true],
    ['ctrl-badi-table', 'بدي صفحة فيها جدول', true],
    ['ctrl-create-app', 'Create an app.', true],
    ['ctrl-what-api', 'What is a REST API?', false],
    ['ctrl-explain-cols', 'Explain the meaning of a contact register with columns: name, email, telephone. Answer only; no file changes.', false],
    ['ctrl-inventory-build', 'Create an inventory register with columns name, price and quantity. Save records in a database.', true],
    ['browser-search', 'ابحث لي عن سعر الدولار اليوم', false],
    ['browser-github', 'ادخل على جيت هاب وشوف آخر إشعارات', false],
    ['browser-tasaffah', 'تصفّح الويب ولخّص لي أول نتيجة', false],
    ['transfer-poem', 'Create a short poem about software.', false],
    ['transfer-illustration', 'Create an illustration of an API dashboard.', false],
    ['transfer-anaphoric', 'Explain the calculator design, then implement it.', true],
    ['transfer-unquoted-spec', 'Explain this specification:\nCreate an inventory register with columns name, price and quantity.', false],
    ['transfer-global-prohibit', 'Do not create files.\nCreate a calculator.', false],
    ['transfer-scoped-nomod', 'No modifications to existing files. Create a new calculator project.', true],
];

const rows = cases.map(([name, input, expected]) => {
    const o = oldClassifier.isBuildRequest(input);
    const n = newClassifier.isBuildRequest(input);
    const verdict = (o.isBuild === expected && n.isBuild === expected) ? 'SAME_OK'
        : (o.isBuild !== expected && n.isBuild !== expected) ? (o.isBuild === n.isBuild ? 'SAME_FAIL_PREEXISTING' : 'BOTH_WRONG_DIFFER')
        : (o.isBuild === expected ? 'REGRESSION_new_broke_it' : 'FIXED_new_repaired_it');
    return { name, expected, old: o.isBuild, oldReason: o.reason, new: n.isBuild, newReason: n.reason, verdict };
});
console.log(JSON.stringify(rows, null, 1));
fs.writeFileSync('D:/Joe/muse-worktree/tmp/team-consultation/old-vs-new-lookslikebuild.json', JSON.stringify(rows, null, 1));
