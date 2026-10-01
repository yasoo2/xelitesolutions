const fs = require('fs');
const vm = require('vm');
const ts = require('D:/Joe/muse-worktree/api/node_modules/typescript');
const file = 'C:/Users/home/.codex/worktrees/requested-action-contract/xelitesolutions/api/src/core/intelligence/requested-action.ts';
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const sandbox = { exports: {} };
vm.runInNewContext(compiled.outputText, sandbox, { timeout: 2000 });
const fn = sandbox.exports.hasRequestedAction;

const cases = [
  // [name, input, expected]
  ['help-me build', 'Help me build a website for my shop.', true],
  ['lets build', "Let's build a habit tracker.", true],
  ['we need', 'We need a dashboard for sales.', true],
  ['please comma', 'Please, build me a contact page.', true],
  ['want the bug fixed', 'I want the login bug fixed today.', true],
  ['dont backend just static', "Don't build a backend, just a static landing page.", true],
  ['bare create app', 'Create an app.', true],
  ['fix failing tests', 'Fix all failing tests in the shopcart folder.', true],
  ['polite add feature', 'Can you please add a search box to the site?', true],
  ['run tests', 'Run the test suite.', true],
  ['deploy site', 'Deploy the site to production.', true],
  ['delete temp', 'Delete the temp files.', true],
  ['crash report', 'My app crashes when I click save. Why?', true],
  ['build failed report', 'The build failed with an error in auth.ts.', true],
  ['what is api', 'What is a REST API?', false],
  ['how db stores', 'How does a database store records?', false],
  ['is site fast', 'Is this website fast?', false],
  ['remember fact', 'Remember that my project uses Postgres.', false],
  ['how-to advice', 'Explain how to build a calculator.', false],
  ['empty', '', false],
  ['anaphora build it', 'Build it.', false],
  ['anaphora create it', 'Create it now.', false],
];

let pass = 0;
const rows = cases.map(([name, input, expected]) => {
  let got;
  try {
    got = fn(input).isBuild;
  } catch (e) {
    got = 'THREW:' + e.message;
  }
  const ok = got === expected;
  if (ok) pass++;
  return { name, expected, got, ok };
});
console.log(JSON.stringify({ pass, total: rows.length, rows }, null, 1));
fs.writeFileSync(__dirname + '/requested-action-adversarial-20261001.json', JSON.stringify({ pass, total: rows.length, rows }, null, 1));
