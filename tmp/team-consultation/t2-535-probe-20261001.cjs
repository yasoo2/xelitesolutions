const fs = require('fs');
const vm = require('vm');
const ts = require('D:/Joe/muse-worktree/api/node_modules/typescript');
// PRISTINE bytes: t2 overlays extracted via git archive (535d07d8 / 166bea99);
// 535 overlay hash-verified vs live tree (clean HEAD=535); 166 overlay vs tar bytes.
function loadFn(overlay) {
  const file = 'D:/Joe/muse-worktree/tmp/team-consultation/' + overlay + '/api/src/core/intelligence/requested-action.ts';
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const sandbox = { exports: {} };
  vm.runInNewContext(compiled.outputText, sandbox, { timeout: 5000 });
  return sandbox.exports.hasRequestedAction;
}
const f535 = loadFn('t2-pristine-535');
const f166 = loadFn('t2-pristine-166base');

const cases = [
  // [section, name, input, expectedAt535]
  // --- T: transfer-10 must hold 10/10 at 535 ---
  ['T', 'unquoted explanatory body', 'Explain this specification:\nCreate an inventory register with columns name, price and quantity.', false],
  ['T', 'unquoted proposed design', 'Summarize this proposed design:\nBuild a website with a backend and frontend.', false],
  ['T', 'software-themed poem', 'Create a short poem about software.', false],
  ['T', 'dashboard illustration', 'Create an illustration of an API dashboard.', false],
  ['T', 'anaphoric implementation', 'Explain the calculator design, then implement it.', true],
  ['T', 'global file prohibition', 'Do not create files.\nCreate a calculator.', false],
  ['T', 'existing-file scope only', 'No modifications to existing files. Create a new calculator project.', true],
  ['T', 'polite control', 'Could you build a website?', true],
  ['T', 'Arabic information control', 'اريد معرفة كيفية إنشاء موقع.', false],
  ['T', 'affirmative desired dashboard', 'I need you to create a dashboard.', true],
  // --- R: 001/002 items status at 535 ---
  ['R', 'R1 login must not build', 'سجّل دخولي بالإيميل', false],
  ['R', 'R1 control desire-record builds', 'بدي سجل لرعاية الإبل', true],
  ['R', 'R2 marketplace', 'Create a multi-vendor marketplace', true],
  ['R', 'R2 panel', 'build an admin panel', true],
  ['R', 'R2 portal', 'create a booking portal', true],
  ['R', 'R2 platform HIS', 'Create a hospital information platform', true],
  ['R', 'R2 Arabic need verb', 'محتاج تطبيق لإدارة المخزون', true],
  ['R', 'R2 Arabic bare-alef make', 'اصنع تطبيق حاسبة بسيط', true],
  ['R', 'R2 residue deploy', 'Deploy the app to staging tonight', true],
  ['R', 'R2 residue give-me', 'Give me a dashboard for daily sales', true],
  ['R', 'R2 Arabic statement list', 'اعمل كشف حساب للعملاء', true],
  ['R', 'R4 ask-contents unknown noun', 'اريد دفتر عائلة فيه الأسماء وأعياد الميلاد والعناوين', true],
  ['R', 'R4 bill builds via verb-artifact', 'Build a bill-splitting calculator with fields: total, tip, people. No login, no database.', true],
  ['R', 'V2R3 colon-less framing must stay inert', 'Explain this specification\nCreate an inventory register with columns name, price and quantity', false],
  ['R', 'R6 wedding Arabic comma', 'عندي قاعة أفراح، بدي جدول للحجوزات فيه اسم العريس وتاريخ المناسبة والمبلغ', true],
  ['R', 'R6 English bare comma', 'I have a small shop, create a stock tracking application', true],
  ['R', 'V2R1 kuafor-page colon', 'بدي صفحة أسجل فيها مواعيد الزبونات: الاسم، الهاتف، الموعد', true],
  ['R', 'V2R1 review-noun page', 'أنشئ صفحة مراجعة للطلبات: الاسم، الحالة، المبلغ', true],
  ['R', 'V2R1 compare-noun page', 'أنشئ صفحة مقارنة للمنتجات: الاسم، السعر، التقييم', true],
  ['R', 'V2R1 verb control stays inert', 'راجع هذا التصميم: الألوان، الخطوط، الأزرار', false],
  ['R', 'V2R2 measured request', 'اعمل لي أداة تحسب إيقاع القصيدة العربية', true],
  ['R', 'V2R2 EN twin', 'Build me a tool that analyzes the rhythm of Arabic poetry', true],
  // --- S: 535-targeted adversarial (restored nouns / comma split / Arabic verbs) ---
  ['S', 'poem about marketplace', 'Write a poem about the marketplace', false],
  ['S', 'explain portal how-it-works', 'Explain how the booking portal works', false],
  ['S', 'platform slow question', 'The platform is slow today, what should I do?', false],
  ['S', 'liking marketplace', 'I love this marketplace design', false],
  ['S', 'genuine portal repair', 'Fix the portal login', true],
  ['S', 'outage then status page', 'The server is down, build a status page', true],
  ['S', 'comma list question', 'apples, oranges, and a quick question: what is 2+2?', false],
  ['S', 'need help no artifact', 'محتاج مساعدة في الإعدادات', false],
  ['S', 'make coffee no artifact', 'اصنع لي قهوة', false],
  ['S', 'desire travel no artifact', 'ارغب في السفر إلى جدة', false],
  ['S', 'want-learn programming', 'ابغي أتعلم البرمجة', false],
  ['S', 'multi-imperative tracker', 'Buy milk, call Ali, build a tracker', true],
  ['S', 'denial comma explain', 'No database, just explain the schema', false],
  ['S', 'new pin version-build', 'version 2, build 5', false],
  ['S', 'desire-an-explanation dashboard', 'I want an explanation of the dashboard', null],
  ['S', 'help-me build', 'Help me build a website for my shop.', null],
  ['S', 'please comma build', 'Please, build me a contact page.', null],
];

let pass = 0, decided = 0, flips = 0;
const rows = cases.map(([section, name, input, expected]) => {
  let g535, g166, r535 = '';
  try { const r = f535(input); g535 = r.isBuild; r535 = r.reason; } catch (e) { g535 = 'THREW:' + e.message; }
  try { g166 = f166(input).isBuild; } catch (e) { g166 = 'THREW:' + e.message; }
  let ok = null;
  if (expected !== null) { ok = g535 === expected; decided++; if (ok) pass++; }
  const flip = g535 !== g166;
  if (flip) flips++;
  return { section, name, expected, got535: g535, got166: g166, flip, reason535: r535, ok };
});
const out = { pass, decided, total: rows.length, flips535vs166: flips, rows };
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(__dirname + '/t2-535-probe-20261001.json', JSON.stringify(out, null, 1));
