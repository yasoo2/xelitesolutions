const fs = require('fs');
const vm = require('vm');
const ts = require('D:/Joe/muse-worktree/api/node_modules/typescript');
// PRISTINE 166bea99 bytes (overlay extracted via git archive; hash-verified 916C...).
const file = 'D:/Joe/muse-worktree/tmp/team-consultation/v2-pristine-166bea99/api/src/core/intelligence/requested-action.ts';
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const sandbox = { exports: {} };
vm.runInNewContext(compiled.outputText, sandbox, { timeout: 5000 });
const fn = sandbox.exports.hasRequestedAction;

const cases = [
  // [section, name, input, expected]
  // --- T: Codex transfer-10 (must be 10/10 at v2) ---
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
  // --- R: 001 rework items R1-R6 status at v2 ---
  ['R', 'R1 login must not build', 'سجّل دخولي بالإيميل', false],
  ['R', 'R1 control desire-record builds', 'بدي سجل لرعاية الإبل', true],
  ['R', 'R2 marketplace', 'Create a multi-vendor marketplace', true],
  ['R', 'R2 panel', 'build an admin panel', true],
  ['R', 'R2 portal', 'create a booking portal', true],
  ['R', 'R2 platform HIS', 'Create a hospital information platform', true],
  ['R', 'R2 Arabic need verb', 'محتاج تطبيق لإدارة المخزون', true],
  ['R', 'R2 Arabic bare-alef make', 'اصنع تطبيق حاسبة بسيط', true],
  ['R', 'R4 ask-contents unknown noun', 'اريد دفتر عائلة فيه الأسماء وأعياد الميلاد والعناوين', true],
  ['R', 'R4 bill builds via verb-artifact', 'Build a bill-splitting calculator with fields: total, tip, people. No login, no database.', true],
  ['R', 'R5 colon-less framing must stay inert', 'Explain this specification\nCreate an inventory register with columns name, price and quantity', false],
  ['R', 'R6 wedding Arabic comma', 'عندي قاعة أفراح، بدي جدول للحجوزات فيه اسم العريس وتاريخ المناسبة والمبلغ', true],
  ['R', 'R6 English bare comma', 'I have a small shop, create a stock tracking application', true],
  // --- N: new transfer/adversarial per consultation review targets ---
  ['N', 'mixed review-then-fix', 'Review this code and fix the bug', null],
  ['N', 'rebuild verb', 'Compare the old and new designs, then rebuild the dashboard', null],
  ['N', 'now-transition fix', 'Now fix the failing tests', true],
  ['N', 'single-quoted suggestion inert', "'Build a hospital platform,' he suggested. Is that feasible?", false],
  ['N', 'contraction targeted exclusion', "Don't create a database. Build a local calculator.", true],
  ['N', 'logo request', 'Create a logo for my shop', null],
  ['N', 'icons for website', 'Design icons for the website', null],
  ['N', 'inspect-only show schema', 'Show me the database schema', false],
  ['N', 'diagnostic find bug', 'Find the bug in auth.ts', null],
  ['N', 'incremental add feature', 'Add a search box to the site', null],
  ['N', 'single-quoted no-execute', "Explain only, do not execute: 'Build a store with checkout'", false],
  ['N', 'adopted quoted spec', 'Implement this specification: "Create an inventory app with columns name, price, quantity."', true],
  ['N', 'pure question', 'What is a REST API?', false],
  ['N', 'crash report question', 'My app crashes when I click save. Why?', null],
  ['N', 'delete temp files', 'Delete the temp files.', null],
  ['N', 'run test suite', 'Run the test suite.', null],
  ['N', 'Arabic framing with colon', 'اشرح لي هذا التصميم: ابن متجرا الكترونيا', false],
  ['N', 'Arabic portal noun', 'صمم بوابة للحجوزات', null],
  ['N', 'anaphoric fix with context', 'Fix it. The dashboard is broken.', null],
  ['N', 'bare create-it', 'Create it now.', false],
  ['N', 'want bug fixed', 'I want the login bug fixed today.', true],
  ['N', 'backend refusal plus static', "Don't build a backend, just a static landing page.", null],
  ['N', 'please comma build', 'Please, build me a contact page.', null],
  ['N', 'help-me build', 'Help me build a website for my shop.', null],
  ['N', 'blockquote does not veto real request', 'Build a dashboard.\n> Create an inventory website', true],
  ['N', 'no tool execution', 'No tool execution. Just answer the question.', false],
  ['N', 'never modify files', 'Never modify any files. Explain the code instead.', false],
  ['N', 'without implementing it', 'Without implementing it, explain the design', false],
  ['N', 'update headline', 'Update the homepage headline to the new slogan', null],
  ['N', 'refactor module', 'Refactor the auth module to use sessions', null],
];

let pass = 0, decided = 0;
const rows = cases.map(([section, name, input, expected]) => {
  let got, reason = '';
  try {
    const r = fn(input);
    got = r.isBuild; reason = r.reason;
  } catch (e) { got = 'THREW:' + e.message; }
  let ok = null;
  if (expected !== null) { ok = got === expected; decided++; if (ok) pass++; }
  return { section, name, expected, got, reason, ok };
});
const out = { pass, decided, total: rows.length, rows };
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(__dirname + '/requested-action-transfer-002-probe-20261001.json', JSON.stringify(out, null, 1));
