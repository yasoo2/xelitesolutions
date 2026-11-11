import { useEffect, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { useLoader, Message } from './shared.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];
const BLANK = { patient_id: '', doctor_id: '', date: today(), time: '', duration_min: 30, reason: '' };

export default function Appointments({ call, can, session }) {
  const { t, errorText } = useI18n();
  const isDoctor = session.user.role === 'doctor';
  const canWrite = can('appointments:write');
  const canStatus = can('appointments:status');

  const [date, setDate] = useState(today());
  const [doctorFilter, setDoctorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // null = closed, otherwise the form values
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [reload, setReload] = useState(0);
  const [slots, setSlots] = useState(null); // {open, slots:[{time,free}]} for the chosen doctor/date
  const [refs, setRefs] = useState({ patients: [], doctors: [] });

  const { data: rows, error, loading } = useLoader(() => {
    const p = new URLSearchParams({ date });
    if (doctorFilter) p.set('doctor_id', doctorFilter);
    if (statusFilter) p.set('status', statusFilter);
    if (q) p.set('q', q);
    return call(`/appointments?${p.toString()}`);
  }, [date, doctorFilter, statusFilter, q, reload]);

  useEffect(() => {
    Promise.all([call('/patients'), call('/doctors')])
      .then(([patients, doctors]) => setRefs({ patients, doctors }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh the free slots whenever doctor, date or duration changes in the form.
  useEffect(() => {
    if (!form || !form.doctor_id || !form.date) { setSlots(null); return; }
    const p = new URLSearchParams({ date: form.date, duration: String(form.duration_min || 30) });
    call(`/doctors/${form.doctor_id}/availability?${p.toString()}`)
      .then(setSlots)
      .catch(() => setSlots(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.doctor_id, form?.date, form?.duration_min]);

  function openNew() {
    setEditId(null);
    setForm({ ...BLANK, doctor_id: isDoctor ? String(session.user.id) : '' });
  }

  function openEdit(a) {
    setEditId(a.id);
    setForm({ patient_id: String(a.patient_id), doctor_id: String(a.doctor_id), date: a.date, time: a.time,
      duration_min: a.duration_min, reason: a.reason || '' });
  }

  async function save(e) {
    e.preventDefault();
    if (!form.time) { setMsg({ ok: false, text: t('appointments.slot') }); return; }
    try {
      const body = { ...form, patient_id: Number(form.patient_id), doctor_id: Number(form.doctor_id), duration_min: Number(form.duration_min) };
      if (editId) await call(`/appointments/${editId}`, { method: 'PUT', body });
      else await call('/appointments', { method: 'POST', body });
      setForm(null);
      setEditId(null);
      setMsg({ ok: true, text: t('appointments.saved') });
      setReload((n) => n + 1);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
      // the slot list may be stale after a conflict
      if (form.doctor_id && form.date) {
        call(`/doctors/${form.doctor_id}/availability?date=${form.date}&duration=${form.duration_min || 30}`).then(setSlots).catch(() => {});
      }
    }
  }

  async function setStatus(a, status) {
    try {
      await call(`/appointments/${a.id}`, { method: 'PUT', body: { status } });
      setReload((n) => n + 1);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  async function remove(a) {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await call(`/appointments/${a.id}`, { method: 'DELETE' });
      setReload((n) => n + 1);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  const freeSlots = slots?.slots?.filter((s) => s.free) || [];

  return (
    <section>
      <div className="page-head">
        <h2>{t('appointments.title')}</h2>
        {canWrite && <button className="primary" onClick={openNew}>{t('appointments.new')}</button>}
      </div>
      <Message msg={msg} />

      <div className="toolbar">
        <label>{t('appointments.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {!isDoctor && (
          <label>{t('appointments.doctor')}
            <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
              <option value="">{t('appointments.allDoctors')}</option>
              {refs.doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </label>
        )}
        <label>{t('status')}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('appointments.allStatuses')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`apptStatus.${s}`)}</option>)}
          </select>
        </label>
        <input className="search" type="search" placeholder={t('appointments.searchHint')} value={q}
          onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
      </div>

      {form && canWrite && (
        <form className="card form-grid" onSubmit={save}>
          <h3>{editId ? t('appointments.edit') : t('appointments.new')}</h3>
          <label>{t('appointments.patient')}
            <select required value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
              <option value="">{t('appointments.choose')}</option>
              {refs.patients.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </label>
          <label>{t('appointments.doctor')}
            <select required value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value, time: '' })}>
              <option value="">{t('appointments.choose')}</option>
              {refs.doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}{d.specialty ? ` (${d.specialty})` : ''}</option>)}
            </select>
          </label>
          <label>{t('appointments.date')}
            <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, time: '' })} />
          </label>
          <label>{t('appointments.duration')}
            <input type="number" min={5} max={240} step={5} value={form.duration_min}
              onChange={(e) => setForm({ ...form, duration_min: e.target.value, time: '' })} />
          </label>
          <label className="span-2">{t('appointments.slot')}
            {!form.doctor_id ? <select disabled><option>{t('appointments.chooseDoctor')}</option></select> : (
              slots && !slots.open ? <div className="notice bad">{t('appointments.closed')}</div> :
              freeSlots.length === 0 && slots ? <div className="notice bad">{t('appointments.noSlots')}</div> :
              <select required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}>
                <option value="">{t('appointments.choose')}</option>
                {freeSlots.map((s) => <option key={s.time} value={s.time}>{s.time}</option>)}
                {editId && form.time && !freeSlots.some((s) => s.time === form.time) && <option value={form.time}>{form.time}</option>}
              </select>
            )}
          </label>
          {slots?.open && <p className="muted span-2">{t('appointments.hoursOf')}: {slots.start}–{slots.end}</p>}
          <label className="span-2">{t('appointments.reason')}
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <div className="actions span-2">
            <button type="submit" className="primary">{editId ? t('appointments.update') : t('appointments.book')}</button>
            <button type="button" onClick={() => { setForm(null); setEditId(null); }}>{t('cancel')}</button>
          </div>
        </form>
      )}

      {error && <div className="error">{errorText(error)}</div>}
      {loading && !rows ? <p>{t('loading')}</p> : (
        <table>
          <thead>
            <tr>
              <th>{t('appointments.time')}</th><th>{t('appointments.patient')}</th><th>{t('appointments.doctor')}</th>
              <th>{t('appointments.duration')}</th><th>{t('appointments.reason')}</th><th>{t('status')}</th>
              {(canWrite || canStatus) && <th>{t('actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((a) => (
              <tr key={a.id}>
                <td>{a.time}</td>
                <td>{a.patient_name}</td>
                <td>{a.doctor_name}</td>
                <td>{a.duration_min} {t('appointments.minutes')}</td>
                <td>{a.reason}</td>
                <td><span className={`badge s-${a.status}`}>{t(`apptStatus.${a.status}`)}</span></td>
                {(canWrite || canStatus) && (
                  <td className="nowrap">
                    {canStatus && (
                      <select value={a.status} onChange={(e) => setStatus(a, e.target.value)} aria-label={t('status')}>
                        {STATUSES.map((s) => <option key={s} value={s}>{t(`apptStatus.${s}`)}</option>)}
                      </select>
                    )}{' '}
                    {canWrite && <button onClick={() => openEdit(a)}>{t('edit')}</button>}{' '}
                    {canWrite && <button className="danger" onClick={() => remove(a)}>{t('delete')}</button>}
                  </td>
                )}
              </tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={7}>{t('appointments.none')}</td></tr>}
          </tbody>
        </table>
      )}
    </section>
  );
}
