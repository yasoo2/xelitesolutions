const fs = require('fs');
const vm = require('vm');
const ts = require('D:/Joe/muse-worktree/api/node_modules/typescript');
function load(file) {
  const src = fs.readFileSync(file, 'utf8');
  const c = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const sb = { exports: {} };
  vm.runInNewContext(c.outputText, sb, { timeout: 5000 });
  return sb.exports.hasRequestedAction;
}
const v2 = load('D:/Joe/muse-worktree/tmp/team-consultation/v2-pristine-166bea99/api/src/core/intelligence/requested-action.ts');
const b7832 = load('D:/Joe/muse-worktree/tmp/team-consultation/v2-pristine-7832base/api/src/core/intelligence/requested-action.ts');
const cases = [
  ['MEASURED_REQUEST', 'اعمل لي أداة تحسب إيقاع القصيدة العربية'],
  ['EN-twin', 'Make me a tool that measures the metre of Arabic poetry'],
  ['EN-clinic', 'I run a clinic. I want a table to record appointments: patient name, phone, appointment time and amount paid'],
  ['clinic-brief', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.'],
];
for (const [n, s] of cases) {
  console.log(n, '| 7832:', JSON.stringify(b7832(s).isBuild), '| v2:', JSON.stringify(v2(s).isBuild));
}
