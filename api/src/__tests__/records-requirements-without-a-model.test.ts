import { requirementsFromRequestClauses, verifyNamed, type NamedRequirement } from '../core/quality/named-requirements';
import { detectAppKind } from '../core/design/app-blueprints';

const source = `
const content = { fields: [
  { key: 'title', primary: true, type: 'text' },
  { key: 'amount', type: 'number', min: 0, minExclusive: true },
  { key: 'category', type: 'select' }, { key: 'date', type: 'date' }
], metrics: [{ kind: 'sum', field: 'amount' }] };
function createStore() { localStorage.getItem('rows'); return { write() { localStorage.setItem('rows', '[]'); } }; }
function computeMetric(m, rows) { switch (m.kind) { case 'sum': return rows.reduce((total, row) => total + row.amount, 0); } }
function invalidNumericField(field, value) { return !Number.isFinite(value) || (field.minExclusive ? value <= field.min : value < field.min); }
function RecordsApp() {
  const [rows, setRows] = useState([]); const [editing, setEditing] = useState(''); const store = createStore();
  const submit = () => { fields.map(field => field.key); setRows(rows); store.write(rows); };
  const edit = row => { setEditing(row.id); };
  const remove = row => { if (!window.confirm('Delete?')) return; setRows(rows.filter(item => item.id !== row.id)); };
  return <form onSubmit={submit}></form>;
}
`;

const requirements: NamedRequirement[] = [
  { id: 'add', text: 'Add an expense with name, amount, date, and category', quote: 'Add an expense with name, amount, date, and category' },
  { id: 'validation', text: 'Reject non-numeric or non-positive amount', quote: 'Reject non-numeric or non-positive amount' },
  { id: 'total', text: 'Calculate the total', quote: 'Calculate the total' },
  { id: 'edit-delete', text: 'Edit and delete with confirmation', quote: 'Edit and delete with confirmation' },
  { id: 'persistence', text: 'Save data after page reload', quote: 'Save data after page reload' },
];

const pocketLedgerRequirements: NamedRequirement[] = [
  { id: 'amount', text: 'Add amount (numeric only)', quote: 'Add amount (numeric only)' },
  { id: 'category', text: 'Add category', quote: 'Add category' },
  { id: 'date', text: 'Add date', quote: 'Add date' },
  { id: 'note', text: 'Add note', quote: 'Add note' },
  { id: 'required', text: 'Validate required fields', quote: 'Validate required fields' },
  { id: 'delete', text: 'Add and delete transactions', quote: 'Add and delete transactions' },
  { id: 'total', text: 'Show the total', quote: 'Show the total' },
  { id: 'persist', text: 'Persist after refresh', quote: 'Persist after refresh' },
];

const pocketLedgerSource = source
  .replace("{ key: 'title', primary: true, type: 'text' }", "{ key: 'title', primary: true, type: 'text' }, { key: 'amount', label: 'amount', type: 'number' }, { key: 'category', label: 'category', type: 'text' }, { key: 'date', label: 'date', type: 'date' }, { key: 'note', label: 'note', type: 'textarea' }")
  .replace('return <form onSubmit={submit}></form>;', 'const required = true; const setError = () => {}; return <form onSubmit={submit}></form>;');

describe('records acceptance does not depend on a model to read explicit code', () => {
    it('keeps a named expense tracker on its own domain engine when fields are explicit', () => {
        const request = 'Create a small personal expense tracker named Pocket Ledger. Add amount (numeric only), category, date, and note; validate required fields; add and delete transactions; show the total; persist after refresh.';
        expect(detectAppKind(request)).toBe('expenses');
    });

  it('keeps explicit clauses from the user request when no provider can read them', () => {
    const read = requirementsFromRequestClauses('Create a small personal expense tracker named Pocket Ledger. Add amount (numeric only), category, date, and note; validate required fields; add and delete transactions; show the total; persist after refresh. Test it in the browser on desktop and mobile.');
    expect(read.map(item => item.text)).toEqual([
      'Add amount (numeric only), category, date, and note',
      'validate required fields',
      'add and delete transactions',
      'show the total',
      'persist after refresh',
    ]);
    expect(read.every(item => item.quote === item.text && item.id.startsWith('request-clause-'))).toBe(true);
  });

  it('does not lose field contracts when the user says an app needs them', () => {
    const read = requirementsFromRequestClauses(
      'Create a compact personal expense tracker. It needs an amount field that rejects letters, a category, date and note fields, validation, add/delete controls, a running total, and saved transactions after refresh.',
    );
    const named = read.map(item => item.text.toLowerCase());
    expect(named).toEqual(expect.arrayContaining([
      'amount field that rejects letters',
      'category',
      'date',
      'note fields',
      'add/delete controls',
      'a running total',
      'saved transactions after refresh',
    ]));
  });

  it('proves the reusable records contract while the provider is unavailable', async () => {
    const judged = await verifyNamed(requirements, source, false, async () => {
      throw new Error('provider unavailable');
    });
    expect(judged.map(item => item.verdict)).toEqual(['met', 'met', 'met', 'met', 'met']);
  });

  it('does not certify a requested capability without its implementation contract', async () => {
    const judged = await verifyNamed([requirements[1]], source.replace('minExclusive ? value <= field.min : value < field.min', 'value < field.min'), false, async () => {
      throw new Error('provider unavailable');
    });
    expect(judged[0].verdict).toBe('unprovable');
  });

  it('proves typed fields and add/delete behavior without asking the provider to restate source evidence', async () => {
    const judged = await verifyNamed(pocketLedgerRequirements, pocketLedgerSource, false, async () => {
      throw new Error('provider unavailable');
    });
    expect(judged.map(item => item.verdict)).toEqual(['met', 'met', 'met', 'met', 'met', 'met', 'met', 'met']);
  });

  it('proves a declarative numeric field without an unavailable-model fallback', async () => {
    const judged = await verifyNamed([
      { id: 'amount', text: 'provide a numeric-only amount', quote: 'provide a numeric-only amount' },
    ], pocketLedgerSource, false, async () => {
      throw new Error('provider unavailable');
    });
    expect(judged[0].verdict).toBe('met');
  });
});
