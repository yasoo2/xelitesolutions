import { verifyNamed, type NamedRequirement } from '../core/quality/named-requirements';

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

describe('records acceptance does not depend on a model to read explicit code', () => {
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
});
