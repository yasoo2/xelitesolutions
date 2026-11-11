import { useEffect, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { useLoader, Message } from './shared.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const NEW = { patient_id: '', description: '', amount: '', issued_date: today() };

function PaymentForm({ invoice, call, onDone, setMsg }) {
  const { t, errorText, money } = useI18n();
  const balance = (invoice.balance_cents || 0) / 100;
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '');
  const [paidDate, setPaidDate] = useState(today());

  async function pay(e) {
    e.preventDefault();
    try {
      await call(`/invoices/${invoice.id}/payments`, { method: 'POST', body: { amount: Number(amount), paid_date: paidDate } });
      setMsg({ ok: true, text: t('invoices.paymentSaved') });
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  return (
    <form className="inline-form" onSubmit={pay}>
      <label>{t('invoices.payment')}
        <input type="number" min="0.01" step="0.01" max={balance} required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label>{t('invoices.paymentDate')}
        <input type="date" required value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
      </label>
      <button type="submit" className="primary" disabled={balance <= 0}>{t('invoices.recordPayment')}</button>
      <span className="muted">{t('invoices.balance')}: {money(invoice.balance_cents)}</span>
    </form>
  );
}

function Payments({ id, call }) {
  const { t, money, dateTime } = useI18n();
  const { data, error, loading } = useLoader(() => call(`/invoices/${id}`), [id]);
  if (loading && !data) return <p>{t('loading')}</p>;
  if (error) return <p className="error">{error.message}</p>;
  if (!data.payments.length) return <p className="muted">{t('invoices.noPayments')}</p>;
  return (
    <ul className="plain">
      {data.payments.map((p) => (
        <li key={p.id}>{p.paid_date} — {money(p.amount_cents)} <span className="muted">({p.created_by}, {dateTime(p.created_at)})</span></li>
      ))}
    </ul>
  );
}

export default function Invoices({ call, can }) {
  const { t, errorText, money } = useI18n();
  const canWrite = can('invoices:write');
  const canDelete = can('invoices:delete');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [openId, setOpenId] = useState(null); // invoice whose payment panel is open
  const [msg, setMsg] = useState(null);
  const [reload, setReload] = useState(0);
  const [patients, setPatients] = useState([]);

  const { data: rows, error, loading } = useLoader(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return call(`/invoices?${p.toString()}`);
  }, [status, q, from, to, reload]);

  useEffect(() => {
    if (canWrite) call('/patients').then(setPatients).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditId(null);
    setForm({ ...NEW });
  }

  function openEdit(inv) {
    setEditId(inv.id);
    setForm({ patient_id: String(inv.patient_id), description: inv.description, amount: String(inv.amount_cents / 100), issued_date: inv.issued_date });
  }

  async function save(e) {
    e.preventDefault();
    try {
      if (editId) {
        await call(`/invoices/${editId}`, { method: 'PUT', body: { description: form.description, amount: Number(form.amount), issued_date: form.issued_date } });
      } else {
        await call('/invoices', { method: 'POST', body: { ...form, patient_id: Number(form.patient_id), amount: Number(form.amount) } });
      }
      setForm(null);
      setEditId(null);
      setMsg({ ok: true, text: t('invoices.saved') });
      setReload((n) => n + 1);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  async function remove(inv) {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await call(`/invoices/${inv.id}`, { method: 'DELETE' });
      setReload((n) => n + 1);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  return (
    <section>
      <div className="page-head">
        <h2>{t('invoices.title')}</h2>
        {canWrite && <button className="primary" onClick={openNew}>{t('invoices.new')}</button>}
      </div>
      <Message msg={msg} />

      <div className="toolbar">
        <input className="search" type="search" placeholder={t('invoices.searchHint')} value={q}
          onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
        <label>{t('status')}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('invoices.allStatuses')}</option>
            {['unpaid', 'partial', 'paid'].map((s) => <option key={s} value={s}>{t(`payStatus.${s}`)}</option>)}
          </select>
        </label>
        <label>{t('from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>{t('to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {form && canWrite && (
        <form className="card form-grid" onSubmit={save}>
          <h3>{editId ? t('invoices.edit') : t('invoices.new')}</h3>
          <label>{t('appointments.patient')}
            <select required disabled={!!editId} value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
              <option value="">{t('appointments.choose')}</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </label>
          <label>{t('invoices.amount')}
            <input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label>{t('invoices.issued')}
            <input type="date" required value={form.issued_date} onChange={(e) => setForm({ ...form, issued_date: e.target.value })} />
          </label>
          <label>{t('invoices.description')}
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="actions span-2">
            <button type="submit" className="primary">{t('save')}</button>
            <button type="button" onClick={() => { setForm(null); setEditId(null); }}>{t('cancel')}</button>
          </div>
        </form>
      )}

      {error && <div className="error">{errorText(error)}</div>}
      {loading && !rows ? <p>{t('loading')}</p> : (
        <table>
          <thead>
            <tr>
              <th>{t('invoices.number')}</th><th>{t('appointments.patient')}</th><th>{t('invoices.issued')}</th>
              <th>{t('invoices.description')}</th><th>{t('invoices.amount')}</th><th>{t('invoices.paid')}</th>
              <th>{t('invoices.balance')}</th><th>{t('status')}</th><th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((inv) => (
              <FragmentRow key={inv.id}>
                <tr>
                  <td>{inv.number}</td>
                  <td>{inv.patient_name}</td>
                  <td>{inv.issued_date}</td>
                  <td>{inv.description}</td>
                  <td>{money(inv.amount_cents)}</td>
                  <td>{money(inv.paid_cents)}</td>
                  <td>{money(inv.balance_cents)}</td>
                  <td><span className={`badge p-${inv.status}`}>{t(`payStatus.${inv.status}`)}</span></td>
                  <td className="nowrap">
                    <button onClick={() => setOpenId(openId === inv.id ? null : inv.id)}>{t('invoices.showPayments')}</button>{' '}
                    {canWrite && <button onClick={() => openEdit(inv)}>{t('edit')}</button>}{' '}
                    {canDelete && inv.paid_cents === 0 && <button className="danger" onClick={() => remove(inv)}>{t('delete')}</button>}
                  </td>
                </tr>
                {openId === inv.id && (
                  <tr className="detail">
                    <td colSpan={9}>
                      {canWrite && inv.status !== 'paid' && (
                        <PaymentForm invoice={inv} call={call} setMsg={setMsg} onDone={() => setReload((n) => n + 1)} />
                      )}
                      <Payments key={`${inv.id}-${reload}`} id={inv.id} call={call} />
                    </td>
                  </tr>
                )}
              </FragmentRow>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={9}>{t('invoices.none')}</td></tr>}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FragmentRow({ children }) {
  return <>{children}</>;
}
