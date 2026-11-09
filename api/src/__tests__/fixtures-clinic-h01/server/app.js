import express from 'express';
import { hashPassword, verifyPassword, newToken } from './security.js';
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}


// Appointments that hold a slot. Cancelled and no-show bookings free it.
export const BLOCKING = "('scheduled','completed')";

export const weekdayOf = (d) => new Date(d + 'T00:00:00Z').getUTCDay();

// Rejects a booking that is outside the doctor's working hours or overlaps
// another booking of the same doctor (slot_conflict) or the same patient
// (patient_conflict). Call it inside the same transaction as the write.
export function assertBookable(db, { doctorId, patientId, date, startMin, duration, excludeId = 0 }) {
  const hours = db.prepare('SELECT start_min, end_min FROM doctor_hours WHERE doctor_id=? AND weekday=?').get(doctorId, weekdayOf(date));
  if (!hours || startMin < hours.start_min || startMin + duration > hours.end_min) {
    throw new HttpError(409, 'outside_hours', "Outside the doctor's working hours");
  }
  const overlaps = (column, id) => db.prepare(
    `SELECT id FROM appointments WHERE ${column}=? AND date=? AND status IN ${BLOCKING}
       AND id<>? AND start_min < ? AND start_min + duration_min > ? LIMIT 1`,
  ).get(id, date, excludeId, startMin + duration, startMin);
  if (overlaps('doctor_id', doctorId)) {
    throw new HttpError(409, 'slot_conflict', 'This doctor already has an appointment at that time');
  }
  if (overlaps('patient_id', patientId)) {
    throw new HttpError(409, 'patient_conflict', 'This patient already has an appointment at that time');
  }
}

import { audit } from './audit.js';

export const ROLES = ['admin', 'doctor', 'receptionist'];
export const PERMS = {
  admin: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write', 'appointments:status',
    'invoices:read', 'invoices:write', 'invoices:delete',
    'reports:read', 'audit:read', 'users:manage', 'schedules:manage',
  ],
  doctor: ['patients:read', 'appointments:read', 'appointments:status', 'schedules:own'],
  receptionist: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write', 'appointments:status',
    'invoices:read', 'invoices:write',
  ],
};
const APPT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];

const bad = (message) => new HttpError(400, 'validation', message);
const now = () => new Date().toISOString();
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
const parseTime = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(typeof t === 'string' ? t : '');
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
};
const fmtTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const toCents = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};
const idParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'not_found', 'Not found');
  return n;
};
const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, full_name: u.full_name, specialty: u.specialty ?? '' });

function diff(before, after, keys) {
  const out = {};
  for (const k of keys) {
    const a = before?.[k] ?? null;
    const b = after?.[k] ?? null;
    if (String(a) !== String(b)) out[k] = { from: a, to: b };
  }
  return out;
}


function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}



function recalcInvoice(db, invoiceId) {
  const inv = db.prepare('SELECT amount_cents FROM invoices WHERE id=?').get(invoiceId);
  const paid = db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS s FROM payments WHERE invoice_id=?').get(invoiceId).s;
  const status = paid <= 0 ? 'unpaid' : paid >= inv.amount_cents ? 'paid' : 'partial';
  db.prepare('UPDATE invoices SET paid_cents=?, status=?, updated_at=? WHERE id=?').run(paid, status, now(), invoiceId);
}

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // Resolve the bearer token to a user on every API call.
  app.use('/api', (req, res, next) => {
    const header = req.headers.authorization || '';
    req.user = null;
    if (header.startsWith('Bearer ')) {
      const row = db.prepare(
        'SELECT u.id, u.username, u.role, u.full_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
      ).get(header.slice(7));
      if (row) req.user = row;
    }
    next();
  });

  const requireUser = (req) => {
    if (!req.user) throw new HttpError(401, 'unauthorized', 'Sign in required');
    return req.user;
  };
  const can = (user, perm) => PERMS[user.role]?.includes(perm) === true;
  const need = (...perms) => (req, res, next) => {
    const user = requireUser(req);
    if (!perms.every((p) => can(user, p))) {
      return next(new HttpError(403, 'forbidden', 'Your role is not allowed to do this'));
    }
    next();
  };

  // ---------- Auth ----------
  app.post('/api/auth/login', (req, res) => {
    const username = text(req.body?.username, 60);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'invalid_credentials', 'Wrong username or password');
    }
    const token = newToken();
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, user.id, now());
    audit(db, user, 'login', 'session', user.id, {});
    res.json({ token, user: publicUser(user) });
  });

  app.post('/api/auth/logout', need(), (req, res) => {
    const header = req.headers.authorization || '';
    db.prepare('DELETE FROM sessions WHERE token = ?').run(header.slice(7));
    audit(db, req.user, 'logout', 'session', req.user.id, {});
    res.status(204).end();
  });

  app.get('/api/auth/me', need(), (req, res) => {
    res.json({ user: publicUser(req.user), permissions: PERMS[req.user.role] });
  });

  // ---------- Doctors and working hours ----------
  const hoursFor = (doctorId) => db.prepare(
    'SELECT weekday, start_min, end_min FROM doctor_hours WHERE doctor_id=? ORDER BY weekday',
  ).all(doctorId).map((h) => ({ weekday: h.weekday, start: fmtTime(h.start_min), end: fmtTime(h.end_min) }));

  app.get('/api/doctors', need(), (req, res) => {
    const doctors = db.prepare("SELECT id, full_name, specialty FROM users WHERE role='doctor' ORDER BY full_name").all();
    res.json(doctors.map((d) => ({ ...d, hours: hoursFor(d.id) })));
  });

  app.put('/api/doctors/:id/hours', (req, res) => {
    const user = requireUser(req);
    const id = idParam(req.params.id);
    const isSelf = user.role === 'doctor' && user.id === id;
    if (!can(user, 'schedules:manage') && !(isSelf && can(user, 'schedules:own'))) {
      throw new HttpError(403, 'forbidden', 'Your role is not allowed to change these hours');
    }
    const doctor = db.prepare("SELECT id FROM users WHERE id=? AND role='doctor'").get(id);
    if (!doctor) throw new HttpError(404, 'not_found', 'Doctor not found');
    const days = req.body?.days;
    if (!Array.isArray(days)) throw bad('days must be a list');
    const rows = days.map((d) => {
      const weekday = Number(d.weekday);
      const start = parseTime(d.start);
      const end = parseTime(d.end);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw bad('Weekday must be 0 (Sunday) to 6 (Saturday)');
      if (start === null || end === null || end <= start) throw bad('Each day needs a start and a later end time (HH:MM)');
      return { weekday, start, end };
    });
    const seen = new Set(rows.map((r) => r.weekday));
    if (seen.size !== rows.length) throw bad('Each weekday can only appear once');
    tx(db, () => {
      const before = hoursFor(id);
      db.prepare('DELETE FROM doctor_hours WHERE doctor_id=?').run(id);
      const ins = db.prepare('INSERT INTO doctor_hours (doctor_id, weekday, start_min, end_min) VALUES (?,?,?,?)');
      for (const r of rows) ins.run(id, r.weekday, r.start, r.end);
      audit(db, user, 'update', 'doctor_hours', id, { before, after: hoursFor(id) });
    });
    res.json(hoursFor(id));
  });

  app.get('/api/doctors/:id/availability', need(), (req, res) => {
    const id = idParam(req.params.id);
    const date = req.query.date;
    if (!isDate(date)) throw bad('date must be YYYY-MM-DD');
    const duration = Number(req.query.duration ?? 30);
    if (!Number.isInteger(duration) || duration < 5 || duration > 240) throw bad('Duration must be 5â€“240 minutes');
    const doctor = db.prepare("SELECT id FROM users WHERE id=? AND role='doctor'").get(id);
    if (!doctor) throw new HttpError(404, 'not_found', 'Doctor not found');
    const hours = db.prepare('SELECT start_min, end_min FROM doctor_hours WHERE doctor_id=? AND weekday=?').get(id, weekdayOf(date));
    if (!hours) return res.json({ date, open: false, slots: [] });
    const booked = db.prepare(
      `SELECT start_min, duration_min FROM appointments WHERE doctor_id=? AND date=? AND status IN ${BLOCKING}`,
    ).all(id, date);
    const slots = [];
    for (let s = hours.start_min; s + duration <= hours.end_min; s += 15) {
      const free = !booked.some((b) => s < b.start_min + b.duration_min && s + duration > b.start_min);
      slots.push({ time: fmtTime(s), free });
    }
    res.json({ date, open: true, start: fmtTime(hours.start_min), end: fmtTime(hours.end_min), slots });
  });

  // ---------- Users (admin) ----------
  const userRow = (id) => db.prepare('SELECT id, username, role, full_name, specialty, created_at FROM users WHERE id=?').get(id);

  app.get('/api/users', need('users:manage'), (req, res) => {
    res.json(db.prepare('SELECT id, username, role, full_name, specialty, created_at FROM users ORDER BY id').all());
  });

  app.post('/api/users', need('users:manage'), (req, res) => {
    const b = req.body || {};
    const username = text(b.username, 40);
    const fullName = text(b.full_name, 120);
    const password = typeof b.password === 'string' ? b.password : '';
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) throw bad('Username: 3â€“40 letters, digits, . _ -');
    if (!ROLES.includes(b.role)) throw bad('Role must be admin, doctor or receptionist');
    if (!fullName) throw bad('Full name is required');
    if (password.length < 6) throw bad('Password must be at least 6 characters');
    if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) throw new HttpError(409, 'duplicate', 'Username already exists');
    const id = tx(db, () => {
      const r = db.prepare('INSERT INTO users (username, password_hash, role, full_name, specialty, created_at) VALUES (?,?,?,?,?,?)')
        .run(username, hashPassword(password), b.role, fullName, text(b.specialty, 120), now());
      audit(db, req.user, 'create', 'user', r.lastInsertRowid, { username, role: b.role, full_name: fullName });
      return Number(r.lastInsertRowid);
    });
    res.status(201).json(userRow(id));
  });

  app.put('/api/users/:id', need('users:manage'), (req, res) => {
    const id = idParam(req.params.id);
    const before = userRow(id);
    if (!before) throw new HttpError(404, 'not_found', 'User not found');
    const b = req.body || {};
    const role = b.role ?? before.role;
    if (!ROLES.includes(role)) throw bad('Role must be admin, doctor or receptionist');
    if (id === req.user.id && role !== 'admin') throw bad('You cannot remove your own admin role');
    const fullName = b.full_name !== undefined ? text(b.full_name, 120) : before.full_name;
    if (!fullName) throw bad('Full name is required');
    const specialty = b.specialty !== undefined ? text(b.specialty, 120) : before.specialty;
    const password = typeof b.password === 'string' && b.password !== '' ? b.password : null;
    if (password !== null && password.length < 6) throw bad('Password must be at least 6 characters');
    tx(db, () => {
      db.prepare('UPDATE users SET role=?, full_name=?, specialty=? WHERE id=?').run(role, fullName, specialty, id);
      if (password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), id);
      const after = userRow(id);
      audit(db, req.user, 'update', 'user', id, { changes: diff(before, after, ['role', 'full_name', 'specialty']), password_changed: !!password });
    });
    res.json(userRow(id));
  });

  app.delete('/api/users/:id', need('users:manage'), (req, res) => {
    const id = idParam(req.params.id);
    const before = userRow(id);
    if (!before) throw new HttpError(404, 'not_found', 'User not found');
    if (id === req.user.id) throw bad('You cannot delete your own account');
    const used = db.prepare('SELECT COUNT(*) AS n FROM appointments WHERE doctor_id=?').get(id).n;
    if (used > 0) throw new HttpError(409, 'has_records', 'This user has appointments and cannot be deleted');
    tx(db, () => {
      db.prepare('DELETE FROM users WHERE id=?').run(id);
      audit(db, req.user, 'delete', 'user', id, { username: before.username, role: before.role });
    });
    res.status(204).end();
  });

  // ---------- Patients ----------
  const patientInput = (b, current = {}) => {
    const first = text(b.first_name ?? current.first_name, 80);
    const last = text(b.last_name ?? current.last_name, 80);
    if (!first || !last) throw bad('First and last name are required');
    const dob = b.date_of_birth ?? current.date_of_birth ?? '';
    if (dob !== '' && !isDate(dob)) throw bad('Date of birth must be YYYY-MM-DD');
    const email = text(b.email ?? current.email ?? '', 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Email looks invalid');
    return {
      first_name: first,
      last_name: last,
      phone: text(b.phone ?? current.phone ?? '', 30),
      email,
      date_of_birth: dob,
      notes: text(b.notes ?? current.notes ?? '', 2000),
    };
  };
  const PATIENT_KEYS = ['first_name', 'last_name', 'phone', 'email', 'date_of_birth', 'notes'];

  app.get('/api/patients', need('patients:read'), (req, res) => {
    const q = text(req.query.q, 100);
    const where = [];
    const params = [];
    if (q) {
      where.push("(first_name || ' ' || last_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const sql = `SELECT * FROM patients ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY last_name, first_name LIMIT 500`;
    res.json(db.prepare(sql).all(...params));
  });

  app.get('/api/patients/:id', need('patients:read'), (req, res) => {
    const p = db.prepare('SELECT * FROM patients WHERE id=?').get(idParam(req.params.id));
    if (!p) throw new HttpError(404, 'not_found', 'Patient not found');
    res.json(p);
  });

  app.post('/api/patients', need('patients:write'), (req, res) => {
    const data = patientInput(req.body || {});
    const id = tx(db, () => {
      const ts = now();
      const r = db.prepare(`INSERT INTO patients (first_name, last_name, phone, email, date_of_birth, notes, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(data.first_name, data.last_name, data.phone, data.email, data.date_of_birth, data.notes, ts, ts);
      audit(db, req.user, 'create', 'patient', r.lastInsertRowid, data);
      return Number(r.lastInsertRowid);
    });
    res.status(201).json(db.prepare('SELECT * FROM patients WHERE id=?').get(id));
  });

  app.put('/api/patients/:id', need('patients:write'), (req, res) => {
    const id = idParam(req.params.id);
    const before = db.prepare('SELECT * FROM patients WHERE id=?').get(id);
    if (!before) throw new HttpError(404, 'not_found', 'Patient not found');
    const data = patientInput(req.body || {}, before);
    tx(db, () => {
      db.prepare(`UPDATE patients SET first_name=?, last_name=?, phone=?, email=?, date_of_birth=?, notes=?, updated_at=? WHERE id=?`)
        .run(data.first_name, data.last_name, data.phone, data.email, data.date_of_birth, data.notes, now(), id);
      audit(db, req.user, 'update', 'patient', id, { changes: diff(before, data, PATIENT_KEYS) });
    });
    res.json(db.prepare('SELECT * FROM patients WHERE id=?').get(id));
  });

  app.delete('/api/patients/:id', need('patients:write'), (req, res) => {
    const id = idParam(req.params.id);
    const before = db.prepare('SELECT * FROM patients WHERE id=?').get(id);
    if (!before) throw new HttpError(404, 'not_found', 'Patient not found');
    const linked = db.prepare('SELECT (SELECT COUNT(*) FROM appointments WHERE patient_id=?) + (SELECT COUNT(*) FROM invoices WHERE patient_id=?) AS n').get(id, id).n;
    if (linked > 0) throw new HttpError(409, 'has_records', 'This patient has appointments or invoices and cannot be deleted');
    tx(db, () => {
      db.prepare('DELETE FROM patients WHERE id=?').run(id);
      audit(db, req.user, 'delete', 'patient', id, { name: `${before.first_name} ${before.last_name}` });
    });
    res.status(204).end();
  });

  // ---------- Appointments ----------
  const APPT_SELECT = `SELECT a.*, p.first_name || ' ' || p.last_name AS patient_name, u.full_name AS doctor_name
    FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN users u ON u.id = a.doctor_id`;
  const presentAppt = (r) => ({ ...r, time: fmtTime(r.start_min) });

  app.get('/api/appointments', need('appointments:read'), (req, res) => {
    const where = [];
    const params = [];
    const user = req.user;
    if (user.role === 'doctor') {
      where.push('a.doctor_id = ?');
      params.push(user.id);
    } else if (req.query.doctor_id) {
      where.push('a.doctor_id = ?');
      params.push(idParam(req.query.doctor_id));
    }
    if (req.query.date) {
      if (!isDate(req.query.date)) throw bad('date must be YYYY-MM-DD');
      where.push('a.date = ?');
      params.push(req.query.date);
    }
    if (req.query.from) {
      if (!isDate(req.query.from)) throw bad('from must be YYYY-MM-DD');
      where.push('a.date >= ?');
      params.push(req.query.from);
    }
    if (req.query.to) {
      if (!isDate(req.query.to)) throw bad('to must be YYYY-MM-DD');
      where.push('a.date <= ?');
      params.push(req.query.to);
    }
    if (req.query.status) {
      if (!APPT_STATUSES.includes(req.query.status)) throw bad('Unknown status');
      where.push('a.status = ?');
      params.push(req.query.status);
    }
    if (req.query.patient_id) {
      where.push('a.patient_id = ?');
      params.push(idParam(req.query.patient_id));
    }
    const q = text(req.query.q, 100);
    if (q) {
      where.push("(p.first_name || ' ' || p.last_name LIKE ? OR p.phone LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    const sql = `${APPT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.date, a.start_min LIMIT 1000`;
    res.json(db.prepare(sql).all(...params).map(presentAppt));
  });

  const readAppt = (b, current = null) => {
    const patientId = Number(b.patient_id ?? current?.patient_id);
    const doctorId = Number(b.doctor_id ?? current?.doctor_id);
    const date = b.date ?? current?.date;
    const time = b.time ?? (current ? fmtTime(current.start_min) : undefined);
    const duration = Number(b.duration_min ?? current?.duration_min ?? 30);
    const status = b.status ?? current?.status ?? 'scheduled';
    if (!db.prepare('SELECT id FROM patients WHERE id=?').get(patientId)) throw bad('Choose a valid patient');
    if (!isDate(date)) throw bad('Date must be YYYY-MM-DD');
    const startMin = parseTime(time);
    if (startMin === null) throw bad('Time must be HH:MM');
    if (!Number.isInteger(duration) || duration < 5 || duration > 240) throw bad('Duration must be 5â€“240 minutes');
    if (!APPT_STATUSES.includes(status)) throw bad('Unknown status');
    const reason = b.reason !== undefined ? text(b.reason, 300) : (current?.reason ?? '');
    return { patient_id: patientId, doctor_id: doctorId, date, start_min: startMin, duration_min: duration, status, reason };
  };

  app.post('/api/appointments', need('appointments:write'), (req, res) => {
    const data = readAppt(req.body || {});
    const id = tx(db, () => {
      if (data.status === 'scheduled') {
        assertBookable(db, { doctorId: data.doctor_id, patientId: data.patient_id, date: data.date, startMin: data.start_min, duration: data.duration_min });
      }
      const ts = now();
      const r = db.prepare(`INSERT INTO appointments (patient_id, doctor_id, date, start_min, duration_min, status, reason, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(data.patient_id, data.doctor_id, data.date, data.start_min, data.duration_min, data.status, data.reason, ts, ts);
      audit(db, req.user, 'create', 'appointment', r.lastInsertRowid, { ...data, time: fmtTime(data.start_min) });
      return Number(r.lastInsertRowid);
    });
    res.status(201).json(presentAppt(db.prepare(`${APPT_SELECT} WHERE a.id=?`).get(id)));
  });

  app.put('/api/appointments/:id', need('appointments:status'), (req, res) => {
    const user = req.user;
    const id = idParam(req.params.id);
    const before = db.prepare('SELECT * FROM appointments WHERE id=?').get(id);
    if (!before) throw new HttpError(404, 'not_found', 'Appointment not found');
    const body = req.body || {};
    if (user.role === 'doctor') {
      // Doctors may only change the status of their own appointments.
      if (before.doctor_id !== user.id) throw new HttpError(403, 'forbidden', 'This is not your appointment');
      const other = Object.keys(body).filter((k) => k !== 'status');
      if (other.length) throw new HttpError(403, 'forbidden', 'Doctors can only change the status');
    } else if (!can(user, 'appointments:write')) {
      throw new HttpError(403, 'forbidden', 'Your role is not allowed to edit appointments');
    }
    const data = readAppt(body, before);
    tx(db, () => {
      if (data.status === 'scheduled') {
        assertBookable(db, { doctorId: data.doctor_id, patientId: data.patient_id, date: data.date, startMin: data.start_min, duration: data.duration_min, excludeId: id });
      }
      db.prepare(`UPDATE appointments SET patient_id=?, doctor_id=?, date=?, start_min=?, duration_min=?, status=?, reason=?, updated_at=? WHERE id=?`)
        .run(data.patient_id, data.doctor_id, data.date, data.start_min, data.duration_min, data.status, data.reason, now(), id);
      const after = db.prepare('SELECT * FROM appointments WHERE id=?').get(id);
      audit(db, user, 'update', 'appointment', id, { changes: diff(before, after, ['patient_id', 'doctor_id', 'date', 'start_min', 'duration_min', 'status', 'reason']) });
    });
    res.json(presentAppt(db.prepare(`${APPT_SELECT} WHERE a.id=?`).get(id)));
  });

  app.delete('/api/appointments/:id', need('appointments:write'), (req, res) => {
    const id = idParam(req.params.id);
    const before = db.prepare('SELECT * FROM appointments WHERE id=?').get(id);
    if (!before) throw new HttpError(404, 'not_found', 'Appointment not found');
    tx(db, () => {
      db.prepare('DELETE FROM appointments WHERE id=?').run(id);
      audit(db, req.user, 'delete', 'appointment', id, { date: before.date, time: fmtTime(before.start_min), status: before.status });
    });
    res.status(204).end();
  });

  // ---------- Invoices ----------
  const INVOICE_SELECT = `SELECT i.*, p.first_name || ' ' || p.last_name AS patient_name,
    (i.amount_cents - i.paid_cents) AS balance_cents
    FROM invoices i JOIN patients p ON p.id = i.patient_id`;

  app.get('/api/invoices', need('invoices:read'), (req, res) => {
    const where = [];
    const params = [];
    if (req.query.status) {
      if (!['unpaid', 'partial', 'paid'].includes(req.query.status)) throw bad('Unknown payment status');
      where.push('i.status = ?');
      params.push(req.query.status);
    }
    for (const key of ['from', 'to']) {
      if (req.query[key]) {
        if (!isDate(req.query[key])) throw bad(`${key} must be YYYY-MM-DD`);
        where.push(key === 'from' ? 'i.issued_date >= ?' : 'i.issued_date <= ?');
        params.push(req.query[key]);
      }
    }
    const q = text(req.query.q, 100);
    if (q) {
      where.push("(i.number LIKE ? OR p.first_name || ' ' || p.last_name LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    const sql = `${INVOICE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.issued_date DESC, i.id DESC LIMIT 500`;
    res.json(db.prepare(sql).all(...params));
  });

  app.get('/api/invoices/:id', need('invoices:read'), (req, res) => {
    const id = idParam(req.params.id);
    const inv = db.prepare(`${INVOICE_SELECT} WHERE i.id=?`).get(id);
    if (!inv) throw new HttpError(404, 'not_found', 'Invoice not found');
    const payments = db.prepare('SELECT * FROM payments WHERE invoice_id=? ORDER BY paid_date, id').all(id);
    res.json({ ...inv, payments });
  });

  const invoiceAmount = (v) => {
    const cents = toCents(v);
    if (cents === null || cents <= 0) throw bad('Amount must be a positive number');
    return cents;
  };
  const invoiceDate = (v) => {
    if (!isDate(v)) throw bad('Issue date must be YYYY-MM-DD');
    return v;
  };

  app.post('/api/invoices', need('invoices:write'), (req, res) => {
    const b = req.body || {};
    const patientId = Number(b.patient_id);
    if (!db.prepare('SELECT id FROM patients WHERE id=?').get(patientId)) throw bad('Choose a valid patient');
    const appointmentId = b.appointment_id ? idParam(b.appointment_id) : null;
    if (appointmentId && !db.prepare('SELECT id FROM appointments WHERE id=?').get(appointmentId)) throw bad('Appointment not found');
    const amount = invoiceAmount(b.amount);
    const issued = b.issued_date ? invoiceDate(b.issued_date) : new Date().toISOString().slice(0, 10);
    const description = text(b.description, 300);
    const id = tx(db, () => {
      const ts = now();
      const r = db.prepare(`INSERT INTO invoices (patient_id, appointment_id, description, amount_cents, paid_cents, issued_date, status, created_at, updated_at)
        VALUES (?,?,?,?,0,?,'unpaid',?,?)`).run(patientId, appointmentId, description, amount, issued, ts, ts);
      const newId = Number(r.lastInsertRowid);
      db.prepare('UPDATE invoices SET number=? WHERE id=?').run(`INV-${String(newId).padStart(5, '0')}`, newId);
      audit(db, req.user, 'create', 'invoice', newId, { patient_id: patientId, amount_cents: amount, issued_date: issued, description });
      return newId;
    });
    res.status(201).json(db.prepare(`${INVOICE_SELECT} WHERE i.id=?`).get(id));
  });

  app.put('/api/invoices/:id', need('invoices:write'), (req, res) => {
    const id = idParam(req.params.id);
    const before = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    if (!before) throw new HttpError(404, 'not_found', 'Invoice not found');
    const b = req.body || {};
    const amount = b.amount !== undefined ? invoiceAmount(b.amount) : before.amount_cents;
    if (amount < before.paid_cents) throw new HttpError(409, 'validation', 'Amount cannot be lower than what is already paid');
    const issued = b.issued_date !== undefined ? invoiceDate(b.issued_date) : before.issued_date;
    const description = b.description !== undefined ? text(b.description, 300) : before.description;
    tx(db, () => {
      db.prepare('UPDATE invoices SET amount_cents=?, issued_date=?, description=?, updated_at=? WHERE id=?').run(amount, issued, description, now(), id);
      recalcInvoice(db, id);
      const after = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
      audit(db, req.user, 'update', 'invoice', id, { changes: diff(before, after, ['amount_cents', 'issued_date', 'description', 'status']) });
    });
    res.json(db.prepare(`${INVOICE_SELECT} WHERE i.id=?`).get(id));
  });

  app.post('/api/invoices/:id/payments', need('invoices:write'), (req, res) => {
    const id = idParam(req.params.id);
    const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    if (!inv) throw new HttpError(404, 'not_found', 'Invoice not found');
    const amount = invoiceAmount(req.body?.amount);
    const paidDate = req.body?.paid_date ? invoiceDate(req.body.paid_date) : new Date().toISOString().slice(0, 10);
    const balance = inv.amount_cents - inv.paid_cents;
    if (amount > balance) throw new HttpError(409, 'overpayment', 'Payment is larger than the remaining balance');
    tx(db, () => {
      db.prepare('INSERT INTO payments (invoice_id, amount_cents, paid_date, created_by, created_at) VALUES (?,?,?,?,?)')
        .run(id, amount, paidDate, req.user.username, now());
      recalcInvoice(db, id);
      audit(db, req.user, 'payment', 'invoice', id, { amount_cents: amount, paid_date: paidDate });
    });
    res.status(201).json(db.prepare(`${INVOICE_SELECT} WHERE i.id=?`).get(id));
  });

  app.delete('/api/invoices/:id', need('invoices:delete'), (req, res) => {
    const id = idParam(req.params.id);
    const before = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    if (!before) throw new HttpError(404, 'not_found', 'Invoice not found');
    if (before.paid_cents > 0) throw new HttpError(409, 'has_records', 'An invoice with payments cannot be deleted');
    tx(db, () => {
      db.prepare('DELETE FROM invoices WHERE id=?').run(id);
      audit(db, req.user, 'delete', 'invoice', id, { number: before.number, amount_cents: before.amount_cents });
    });
    res.status(204).end();
  });

  // ---------- Reports ----------
  app.get('/api/reports/revenue', need('reports:read'), (req, res) => {
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw bad('Year must be between 2000 and 2100');
    const y = String(year);
    const invoiced = db.prepare(`SELECT substr(issued_date,1,7) AS m, COUNT(*) AS n, SUM(amount_cents) AS total
      FROM invoices WHERE substr(issued_date,1,4)=? GROUP BY m`).all(y);
    const collected = db.prepare(`SELECT substr(paid_date,1,7) AS m, SUM(amount_cents) AS total
      FROM payments WHERE substr(paid_date,1,4)=? GROUP BY m`).all(y);
    const months = [];
    for (let i = 1; i <= 12; i++) {
      const key = `${y}-${String(i).padStart(2, '0')}`;
      const inv = invoiced.find((r) => r.m === key);
      const col = collected.find((r) => r.m === key);
      months.push({
        month: key,
        invoice_count: inv?.n ?? 0,
        invoiced_cents: inv?.total ?? 0,
        collected_cents: col?.total ?? 0,
      });
    }
    const outstanding = db.prepare(`SELECT COALESCE(SUM(amount_cents - paid_cents),0) AS s FROM invoices WHERE substr(issued_date,1,4)=?`).get(y).s;
    const totals = months.reduce((t, m) => ({
      invoice_count: t.invoice_count + m.invoice_count,
      invoiced_cents: t.invoiced_cents + m.invoiced_cents,
      collected_cents: t.collected_cents + m.collected_cents,
    }), { invoice_count: 0, invoiced_cents: 0, collected_cents: 0 });
    res.json({ year, months, totals: { ...totals, outstanding_cents: outstanding } });
  });

  // ---------- Audit log ----------
  app.get('/api/audit', need('audit:read'), (req, res) => {
    const where = [];
    const params = [];
    if (req.query.entity) {
      where.push('entity = ?');
      params.push(text(req.query.entity, 40));
    }
    if (req.query.action) {
      where.push('action = ?');
      params.push(text(req.query.action, 40));
    }
    const q = text(req.query.q, 100);
    if (q) {
      where.push('(username LIKE ? OR details LIKE ? OR entity_id LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const sql = `SELECT * FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    res.json(db.prepare(sql).all(...params, limit).map((r) => ({ ...r, details: JSON.parse(r.details || '{}') })));
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'validation', message: 'Invalid JSON' });
    if (/UNIQUE constraint/.test(String(err.message))) return res.status(409).json({ error: 'duplicate', message: 'Duplicate value' });
    console.error(err);
    return res.status(500).json({ error: 'server', message: 'Server error' });
  });

  return app;
}
