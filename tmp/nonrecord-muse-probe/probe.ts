/* Independent Muse probe: NONRECORD-FIELD-ROUTING-001 against MUSE-branch source.
 * Read-only contract experiment; no tools executed, no network, no files written. */
import { hasExplicitRecordSchema, blueprintFor } from '../../api/src/core/design/app-blueprints';
import { isBuildRequest, classifyIntent } from '../../api/src/core/intelligence/intent-classifier';
import { PlanningEngine } from '../../api/src/core/orchestrator/PlanningEngine';

const cases: Array<{ name: string; request: string; expectSchema: boolean; expectScope: string }> = [
  { name: 'bill inputs', request: 'Build a bill-splitting page with bill amount, tip percentage and number of people. Show total and amount per person.', expectSchema: false, expectScope: 'page' },
  { name: 'bill comma exclusions', request: 'Build a bill-splitting page with bill amount, tip percentage and number of people. No login, database, payments, or unnecessary features.', expectSchema: false, expectScope: 'page' },
  { name: 'unit converter', request: 'Create a unit converter with value, source unit and target unit. Calculate conversions in the browser without a database.', expectSchema: false, expectScope: 'page' },
  { name: 'contact form', request: 'Build a contact form with name, email and message. Validate inputs locally; do not submit or save them.', expectSchema: false, expectScope: 'page' },
  { name: 'loan calculation', request: 'Create a loan calculator with principal, annual interest rate and duration. Calculate repayments locally. No accounts or database.', expectSchema: false, expectScope: 'page' },
  { name: 'Arabic inputs', request: 'اعمل حاسبة تقسيم فاتورة فيها حقول: مبلغ الفاتورة، نسبة البقشيش، عدد الأشخاص. احسب الإجمالي وحصة كل شخص. بدون تسجيل دخول أو قاعدة بيانات.', expectSchema: false, expectScope: 'page' },
  { name: 'static brochure', request: 'Build a modern coffee landing page with a hero, menu and contact section. No login or database.', expectSchema: false, expectScope: 'page' },
  { name: 'persistent inventory', request: 'Build an inventory application with records containing name, price and quantity, stored in a database.', expectSchema: true, expectScope: 'system' },
  { name: 'mixed positive storage', request: 'Build an inventory application. No login, but store records containing name, price and quantity in a database.', expectSchema: true, expectScope: 'system' },
  { name: 'persistent CSV import', request: 'Build an inventory application that imports CSV into a database with columns name, price and quantity. Allow editing saved records.', expectSchema: true, expectScope: 'system' },
  { name: 'local saved register', request: 'Create a contact register with columns name, email and telephone. Save records in browser local storage; no backend.', expectSchema: true, expectScope: 'app' },
  { name: 'point of sale', request: 'Build a point of sale system with inventory, sales and receipts stored in a database.', expectSchema: false, expectScope: 'system' },
];

async function main() {
  const rows = cases.map((c) => {
    const schema = hasExplicitRecordSchema(c.request);
    const scope = PlanningEngine.classifyBuildScope(c.request);
    const schemaPass = schema === c.expectSchema;
    const scopePass = scope === c.expectScope;
    return { name: c.name, schema, scope, expectSchema: c.expectSchema, expectScope: c.expectScope, schemaPass, scopePass, passes: schemaPass && scopePass };
  });
  const pass = rows.filter((r) => r.passes).length;
  console.log(JSON.stringify({ total: rows.length, pass, fail: rows.length - pass, rows }, null, 1));

  // Downstream counterfactual: force custom blueprint for a non-record request.
  const bill = cases[0].request;
  const bp = blueprintFor('custom' as any, bill, false);
  console.log(JSON.stringify({
    downstream: {
      kind: 'custom', fields: (bp.fields || []).map((f: any) => f.key),
      metrics: (bp.metrics || []).map((m: any) => m.label),
      hasRecordsMetric: (bp.metrics || []).some((m: any) => /records|السجلات/i.test(String(m.label || ''))),
    },
  }));

  // Intent consistency: direct helper vs classifier on a conceptual question.
  const q = 'DIAGNOSTIC-INTENT-20261001: Answer this conceptual question only, in Arabic. No tool execution or file changes are authorized for this question. Compare two requirements: A) a browser-only bill splitter has numeric inputs for amount, tip percentage and people; it displays calculated total and per-person amount, with no accounts or database. B) an inventory register stores editable records with name, price and quantity in a database. Explain which needs persisted records, which needs an owned backend, and why a list of input labels does not define a CRUD application. Do not perform either requirement.';
  const direct = isBuildRequest(q);
  const cls = await classifyIntent(q);
  console.log(JSON.stringify({ intent: { directBuild: direct, classifier: { isBuild: cls.isBuild, isKnowledgeQuestion: cls.isKnowledgeQuestion, isReadOnly: cls.isReadOnly, reason: cls.reason } } }));
}

main().catch((e) => { console.error('PROBE_FAILED', e); process.exit(1); });
