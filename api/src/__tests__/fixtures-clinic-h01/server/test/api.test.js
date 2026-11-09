import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { seed } from '../seed.js';

// Monday 2030-01-07 and Sunday 2030-01-06 (verified weekdays).
const MON = '2030-01-07';
const SUN = '2030-01-06';
const SAT = '2030-01-12';

let server;
let base;
let db;
const tokens = {};

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(username, password) {
  const r = await call('POST', '/api/auth/login', { body: { username, password } });
  assert.equal(r.status, 200, `login failed for ${username}`);
  return r.body.token;
}

before(async () => {
  db = openDb(':memory:');
  seed(db);
  const app = createApp(db);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  tokens.admin = await login('admin', 'admin123');
  tokens.smith = await login('dr.smith', 'doctor123');
  tokens.lee = await login('dr.lee', 'doctor123');
  tokens.reception = await login('reception', 'reception123');
});

after(() => new Promise((resolve) => server.close(resolve)));

// Helpers that look up seeded ids through the API itself.
async function doctorId(name) {
  const list = (await call('GET', '/api/doctors', { token: tokens.admin })).body;
  return list.find((d) => d.full_name.includes(name)).id;
}

async function newPatient(first = 'Test', last = 'Patient', extra = {}) {
  const r = await call('POST', '/api/patients', { token: tokens.reception, body: { first_name: first, last_name: last, phone: '555-0100', ...extra } });
  assert.equal(r.status, 201);
  return r.body;
}

describe('authentication and roles', () => {
  test('login with the right password returns a token and the user role', async () => {
    const r = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, 'admin');
    assert.ok(r.body.token.length > 20);
  });

  test('login with a wrong password is refused', async () => {
    const r = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'nope' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'invalid_credentials');
  });

  test('API data is refused without a token', async () => {
    const r = await call('GET', '/api/patients');
    assert.equal(r.status, 401);
  });

  test('each demo account has its own role', async () => {
    const r = await call('GET', '/api/auth/me', { token: tokens.smith });
    assert.equal(r.body.user.role, 'doctor');
    const rec = await call('GET', '/api/auth/me', { token: tokens.reception });
    assert.equal(rec.body.user.role, 'receptionist');
  });

  test('logout ends the session', async () => {
    const t = await login('reception', 'reception123');
    await call('POST', '/api/auth/logout', { token: t });
    const r = await call('GET', '/api/auth/me', { token: t });
    assert.equal(r.status, 401);
  });
});

describe('role permissions', () => {
  test('receptionist cannot read the revenue report', async () => {
    const r = await call('GET', '/api/reports/revenue?year=2030', { token: tokens.reception });
    assert.equal(r.status, 403);
  });

  test('doctor cannot create a patient', async () => {
    const r = await call('POST', '/api/patients', { token: tokens.smith, body: { first_name: 'A', last_name: 'B' } });
    assert.equal(r.status, 403);
  });

  test('receptionist cannot manage users or read the audit log', async () => {
    assert.equal((await call('GET', '/api/users', { token: tokens.reception })).status, 403);
    assert.equal((await call('GET', '/api/audit', { token: tokens.reception })).status, 403);
  });

  test('doctor cannot read invoices', async () => {
    const r = await call('GET', '/api/invoices', { token: tokens.smith });
    assert.equal(r.status, 403);
  });

  test('a doctor sees only their own appointments', async () => {
    const smith = await doctorId('Smith');
    const p = await newPatient('Scope', 'Check');
    await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: MON, time: '09:00' } });
    const r = await call('GET', '/api/appointments?date=' + MON, { token: tokens.lee });
    assert.ok(r.body.every((a) => a.doctor_id !== smith));
  });

  test('a doctor cannot change another doctor\'s appointment status', async () => {
    const smith = await doctorId('Smith');
    const p = await newPatient('Other', 'Doc');
    const appt = (await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: MON, time: '11:00' } })).body;
    const r = await call('PUT', `/api/appointments/${appt.id}`, { token: tokens.lee, body: { status: 'completed' } });
    assert.equal(r.status, 403);
  });

  test('a doctor cannot change working hours of another doctor', async () => {
    const smith = await doctorId('Smith');
    const r = await call('PUT', `/api/doctors/${smith}/hours`, { token: tokens.lee, body: { days: [] } });
    assert.equal(r.status, 403);
  });
});

describe('patients', () => {
  test('a patient can be added and found by name search', async () => {
    const p = await newPatient('Nadia', 'Rahman', { email: 'nadia@example.com' });
    const r = await call('GET', '/api/patients?q=Rahman', { token: tokens.reception });
    assert.ok(r.body.some((x) => x.id === p.id));
  });

  test('search also matches phone numbers', async () => {
    await newPatient('Phone', 'Searchable', { phone: '777-998877' });
    const r = await call('GET', '/api/patients?q=998877', { token: tokens.reception });
    assert.ok(r.body.some((x) => x.first_name === 'Phone'));
  });

  test('a patient record can be edited', async () => {
    const p = await newPatient('Edit', 'Me');
    const r = await call('PUT', `/api/patients/${p.id}`, { token: tokens.reception, body: { phone: '999-000' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.phone, '999-000');
    assert.equal(r.body.first_name, 'Edit');
  });

  test('a patient without records can be deleted', async () => {
    const p = await newPatient('Delete', 'Me');
    const r = await call('DELETE', `/api/patients/${p.id}`, { token: tokens.reception });
    assert.equal(r.status, 204);
    const g = await call('GET', `/api/patients/${p.id}`, { token: tokens.reception });
    assert.equal(g.status, 404);
  });

  test('a patient with an invoice cannot be deleted', async () => {
    const p = await newPatient('Billed', 'Patient');
    await call('POST', '/api/invoices', { token: tokens.reception, body: { patient_id: p.id, amount: 50, issued_date: MON } });
    const r = await call('DELETE', `/api/patients/${p.id}`, { token: tokens.reception });
    assert.equal(r.status, 409);
  });
});

describe('appointments and double-booking', () => {
  test('an appointment can be booked inside working hours', async () => {
    const smith = await doctorId('Smith');
    const p = await newPatient('Book', 'Ok');
    const r = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: MON, time: '10:00', duration_min: 30 } });
    assert.equal(r.status, 201);
    assert.equal(r.body.time, '10:00');
  });

  test('the same doctor cannot be booked twice at the same time (no double-booking)', async () => {
    const smith = await doctorId('Smith');
    const p1 = await newPatient('Double1', 'Book');
    const p2 = await newPatient('Double2', 'Book');
    const first = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p1.id, doctor_id: smith, date: MON, time: '13:00' } });
    assert.equal(first.status, 201);
    const second = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p2.id, doctor_id: smith, date: MON, time: '13:00' } });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'slot_conflict');
  });

  test('a partly overlapping appointment for the same doctor is refused', async () => {
    const lee = await doctorId('Lee');
    const p1 = await newPatient('Overlap1', 'X');
    const p2 = await newPatient('Overlap2', 'X');
    await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p1.id, doctor_id: lee, date: MON, time: '11:00', duration_min: 60 } });
    const r = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p2.id, doctor_id: lee, date: MON, time: '11:30', duration_min: 30 } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'slot_conflict');
  });

  test('two different doctors can see the same time slot', async () => {
    const smith = await doctorId('Smith');
    const lee = await doctorId('Lee');
    const p1 = await newPatient('Parallel1', 'X');
    const p2 = await newPatient('Parallel2', 'X');
    await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p1.id, doctor_id: smith, date: MON, time: '15:00' } });
    const r = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p2.id, doctor_id: lee, date: MON, time: '15:00' } });
    assert.equal(r.status, 201);
  });

  test('a cancelled appointment frees its slot', async () => {
    const smith = await doctorId('Smith');
    const p1 = await newPatient('Cancel1', 'X');
    const p2 = await newPatient('Cancel2', 'X');
    const a = (await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p1.id, doctor_id: smith, date: MON, time: '16:00' } })).body;
    await call('PUT', `/api/appointments/${a.id}`, { token: tokens.reception, body: { status: 'cancelled' } });
    const r = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p2.id, doctor_id: smith, date: MON, time: '16:00' } });
    assert.equal(r.status, 201);
  });

  test('the same patient cannot be in two places at once', async () => {
    const smith = await doctorId('Smith');
    const lee = await doctorId('Lee');
    const p = await newPatient('Busy', 'Patient');
    await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: MON, time: '12:00' } });
    const r = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: lee, date: MON, time: '12:00' } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'patient_conflict');
  });

  test('a doctor\'s appointment status can be set by the doctor', async () => {
    const smith = await doctorId('Smith');
    const p = await newPatient('Status', 'Change');
    const a = (await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: MON, time: '14:00' } })).body;
    const r = await call('PUT', `/api/appointments/${a.id}`, { token: tokens.smith, body: { status: 'completed' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'completed');
  });

  test('appointments can be searched by patient name and status', async () => {
    const r = await call('GET', '/api/appointments?q=Status&status=completed', { token: tokens.admin });
    assert.ok(r.body.length >= 1);
    assert.ok(r.body.every((a) => a.status === 'completed'));
  });
});

describe('per-doctor working hours', () => {
  test('a booking outside the doctor\'s hours is refused', async () => {
    const smith = await doctorId('Smith');
    const p = await newPatient('Late', 'Visit');
    const r = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: MON, time: '16:45', duration_min: 30 } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'outside_hours');
  });

  test('a doctor with no hours on that weekday cannot be booked', async () => {
    const smith = await doctorId('Smith');
    const p = await newPatient('Weekend', 'Visit');
    const r = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: SUN, time: '10:00' } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'outside_hours');
  });

  test('hours differ per doctor: Dr. Lee works Sunday, Dr. Smith does not', async () => {
    const lee = await doctorId('Lee');
    const p = await newPatient('Sunday', 'Lee');
    const r = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: lee, date: SUN, time: '10:00' } });
    assert.equal(r.status, 201);
  });

  test('availability shows the doctor\'s open hours and marks booked slots', async () => {
    const smith = await doctorId('Smith');
    const r = await call('GET', `/api/doctors/${smith}/availability?date=${MON}&duration=30`, { token: tokens.reception });
    assert.equal(r.body.open, true);
    assert.equal(r.body.start, '09:00');
    assert.equal(r.body.end, '17:00');
    const slot = r.body.slots.find((s) => s.time === '10:00');
    assert.equal(slot.free, false);
    const off = await call('GET', `/api/doctors/${smith}/availability?date=${SAT}&duration=30`, { token: tokens.reception });
    assert.equal(off.body.open, false);
  });

  test('a doctor can change their own working hours and the booking rules follow', async () => {
    const smith = await doctorId('Smith');
    const set = await call('PUT', `/api/doctors/${smith}/hours`, {
      token: tokens.smith,
      body: { days: [{ weekday: 0, start: '08:00', end: '12:00' }] },
    });
    assert.equal(set.status, 200);
    const p = await newPatient('New', 'Hours');
    const ok = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: SUN, time: '08:30' } });
    assert.equal(ok.status, 201);
    const outside = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: MON, time: '10:00' } });
    assert.equal(outside.body.error, 'outside_hours');
    // restore the seeded schedule for later tests
    await call('PUT', `/api/doctors/${smith}/hours`, {
      token: tokens.admin,
      body: { days: [1, 2, 3, 4, 5].map((w) => ({ weekday: w, start: '09:00', end: '17:00' })) },
    });
  });

  test('a doctor cannot set another doctor\'s hours even when the receptionist asks', async () => {
    const lee = await doctorId('Lee');
    const r = await call('PUT', `/api/doctors/${lee}/hours`, { token: tokens.reception, body: { days: [] } });
    assert.equal(r.status, 403);
  });
});

describe('invoices and payment status', () => {
  test('a new invoice is unpaid, a partial payment makes it partial and the full amount makes it paid', async () => {
    const p = await newPatient('Pay', 'Status');
    const inv = (await call('POST', '/api/invoices', { token: tokens.reception, body: { patient_id: p.id, amount: 200, description: 'Consultation', issued_date: MON } })).body;
    assert.equal(inv.status, 'unpaid');
    assert.match(inv.number, /^INV-\d{5}$/);
    const partial = await call('POST', `/api/invoices/${inv.id}/payments`, { token: tokens.reception, body: { amount: 50, paid_date: MON } });
    assert.equal(partial.body.status, 'partial');
    assert.equal(partial.body.balance_cents, 15000);
    const full = await call('POST', `/api/invoices/${inv.id}/payments`, { token: tokens.reception, body: { amount: 150, paid_date: MON } });
    assert.equal(full.body.status, 'paid');
    assert.equal(full.body.balance_cents, 0);
  });

  test('a payment larger than the balance is refused', async () => {
    const p = await newPatient('Over', 'Pay');
    const inv = (await call('POST', '/api/invoices', { token: tokens.reception, body: { patient_id: p.id, amount: 10, issued_date: MON } })).body;
    const r = await call('POST', `/api/invoices/${inv.id}/payments`, { token: tokens.reception, body: { amount: 11 } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'overpayment');
  });

  test('invoices can be filtered by payment status and searched by patient', async () => {
    const r = await call('GET', '/api/invoices?status=paid&q=Status', { token: tokens.admin });
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 1);
    assert.ok(r.body.every((i) => i.status === 'paid'));
  });
});

describe('monthly revenue report', () => {
  test('the report has twelve months with invoiced and collected amounts', async () => {
    const p = await newPatient('Report', 'Rev');
    const inv = (await call('POST', '/api/invoices', { token: tokens.reception, body: { patient_id: p.id, amount: 300, issued_date: '2031-04-10' } })).body;
    await call('POST', `/api/invoices/${inv.id}/payments`, { token: tokens.reception, body: { amount: 120, paid_date: '2031-05-02' } });
    const r = await call('GET', '/api/reports/revenue?year=2031', { token: tokens.admin });
    assert.equal(r.status, 200);
    assert.equal(r.body.months.length, 12);
    const apr = r.body.months.find((m) => m.month === '2031-04');
    const may = r.body.months.find((m) => m.month === '2031-05');
    assert.equal(apr.invoiced_cents, 30000);
    assert.equal(apr.collected_cents, 0);
    assert.equal(may.collected_cents, 12000);
    assert.equal(r.body.totals.outstanding_cents, 18000);
  });

  test('the revenue report is available to the admin only', async () => {
    assert.equal((await call('GET', '/api/reports/revenue?year=2031', { token: tokens.smith })).status, 403);
    assert.equal((await call('GET', '/api/reports/revenue?year=2031', { token: tokens.reception })).status, 403);
  });
});

describe('audit log', () => {
  test('creating, editing and deleting a patient each leave an audit entry', async () => {
    const p = await newPatient('Audit', 'Trail');
    await call('PUT', `/api/patients/${p.id}`, { token: tokens.reception, body: { notes: 'updated' } });
    await call('DELETE', `/api/patients/${p.id}`, { token: tokens.reception });
    const r = await call('GET', '/api/audit?entity=patient&limit=500', { token: tokens.admin });
    const actions = r.body.filter((e) => e.entity === 'patient' && e.entity_id === String(p.id)).map((e) => e.action);
    assert.deepEqual(actions.sort(), ['create', 'delete', 'update']);
    const upd = r.body.find((e) => e.action === 'update' && e.entity_id === String(p.id));
    assert.equal(upd.username, 'reception');
    assert.ok(upd.details.changes.notes);
  });

  test('invoice creation and payments are logged', async () => {
    const p = await newPatient('Log', 'Invoice');
    const inv = (await call('POST', '/api/invoices', { token: tokens.reception, body: { patient_id: p.id, amount: 20, issued_date: MON } })).body;
    await call('POST', `/api/invoices/${inv.id}/payments`, { token: tokens.reception, body: { amount: 20 } });
    const r = await call('GET', `/api/audit?entity=invoice`, { token: tokens.admin });
    const mine = r.body.filter((e) => e.entity_id === String(inv.id)).map((e) => e.action);
    assert.ok(mine.includes('create'));
    assert.ok(mine.includes('payment'));
  });

  test('booking and cancelling an appointment each leave an audit entry', async () => {
    const smith = await doctorId('Smith');
    const p = await newPatient('Audit', 'Appt');
    const booked = await call('POST', '/api/appointments', { token: tokens.reception, body: { patient_id: p.id, doctor_id: smith, date: '2030-01-08', time: '09:30' } });
    assert.equal(booked.status, 201);
    await call('DELETE', `/api/appointments/${booked.body.id}`, { token: tokens.reception });
    const r = await call('GET', '/api/audit?entity=appointment&limit=500', { token: tokens.admin });
    const actions = r.body.filter((e) => e.entity_id === String(booked.body.id)).map((e) => e.action);
    assert.deepEqual(actions.sort(), ['create', 'delete']);
  });

  test('the audit log is read-only through the API', async () => {
    const r = await call('DELETE', '/api/audit/1', { token: tokens.admin });
    assert.equal(r.status, 404);
  });
});

describe('users and logins', () => {
  test('the admin can create a user who can then sign in with their role', async () => {
    const r = await call('POST', '/api/users', { token: tokens.admin, body: { username: 'new.doc', password: 'secret1', role: 'doctor', full_name: 'Dr. New', specialty: 'Dental' } });
    assert.equal(r.status, 201);
    const t = await login('new.doc', 'secret1');
    const me = await call('GET', '/api/auth/me', { token: t });
    assert.equal(me.body.user.role, 'doctor');
  });

  test('a duplicate username is refused', async () => {
    const r = await call('POST', '/api/users', { token: tokens.admin, body: { username: 'admin', password: 'secret1', role: 'admin', full_name: 'Dup' } });
    assert.equal(r.status, 409);
  });
});
