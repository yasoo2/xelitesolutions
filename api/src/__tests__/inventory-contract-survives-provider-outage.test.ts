import { verifyNamed } from '../core/quality/named-requirements';

const recordsSource = `
export const RecordsView = () => (
  <form onSubmit={submit}>{fields.map(field => <input key={field.key} />)}</form>
);
const fields = [
  { key: 'name', primary: true, type: 'text' },
  { key: 'quantity', type: 'number' },
  { key: 'category', type: 'select' },
];
setRows(nextRows); setQuery(value); setFilters(nextFilters); content.statusField;
setSelected(row); setEditing(row.id);
<section className="record-modal" role="dialog" />;
`;

describe('inventory contracts survive an unavailable acceptance provider', () => {
  it('proves the requested records interactions directly from their implementation', async () => {
    const call = jest.fn(async () => { throw new Error('provider unavailable'); });
    const requirements = [
      { id: 'filter', text: 'a table of items with search and filtering by status', quote: 'a table of items with search and filtering by status' },
      { id: 'add', text: 'an add model with item name, quantity, price, and category fields', quote: 'an add model with item name, quantity, price, and category fields' },
      { id: 'details', text: 'details and edit window', quote: 'details and edit window' },
    ];

    const judged = await verifyNamed(requirements, recordsSource, false, call);

    expect(judged.map(item => item.verdict)).toEqual(['met', 'met', 'met']);
    expect(call).not.toHaveBeenCalled();
  });

  it('proves Arabic add-form and details-edit requirements from the same records contract', async () => {
    const call = jest.fn(async () => { throw new Error('provider unavailable'); });
    const requirements = [
      { id: 'add-ar', text: 'نموذج إضافة فيه اسم المادة والكمية والسعر والفئة', quote: 'نموذج إضافة فيه اسم المادة والكمية والسعر والفئة' },
      { id: 'details-ar', text: 'نافذة تفاصيل وتعديل', quote: 'نافذة تفاصيل وتعديل' },
    ];

    const judged = await verifyNamed(requirements, recordsSource, false, call);

    expect(judged.map(item => item.verdict)).toEqual(['met', 'met']);
    expect(call).not.toHaveBeenCalled();
  });
});