'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const COLLECTIONS = ['trips', 'travelers', 'bookings'];
const TRIP_STATUS = ['متاحة', 'مغلقة'];
const BOOKING_STATUS = ['مؤكد', 'معلق', 'ملغي'];
const MAX_BODY = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function createStore(file) {
  let data = { trips: [], travelers: [], bookings: [], seq: 0 };
  if (file && fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      data = { trips: [], travelers: [], bookings: [], seq: 0 };
    }
  }
  for (const k of COLLECTIONS) if (!Array.isArray(data[k])) data[k] = [];
  if (typeof data.seq !== 'number') data.seq = 0;

  function save() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }
  function nextId() {
    data.seq += 1;
    return data.seq;
  }
  return { data, save, nextId };
}

// ---------- validation ----------
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const toNum = (v) => {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function validate(coll, body, data) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'البيانات غير صالحة' };
  }
  if (coll === 'trips') {
    const destination = text(body.destination);
    const departure = text(body.departure);
    const price = toNum(body.price);
    const seats = toNum(body.seats);
    const status = text(body.status);
    if (!destination) return { error: 'الوجهة مطلوبة' };
    if (!isDate(departure)) return { error: 'تاريخ المغادرة غير صالح' };
    if (!(price >= 0)) return { error: 'السعر يجب أن يكون رقماً صفر أو أكبر' };
    if (!(Number.isInteger(seats) && seats >= 0)) return { error: 'عدد المقاعد يجب أن يكون عدداً صحيحاً' };
    if (!TRIP_STATUS.includes(status)) return { error: 'حالة الرحلة غير صالحة' };
    return { value: { destination, departure, price, seats, status } };
  }
  if (coll === 'travelers') {
    const name = text(body.name);
    const phone = text(body.phone);
    const passport = text(body.passport);
    if (!name) return { error: 'اسم المسافر مطلوب' };
    if (!phone) return { error: 'رقم الهاتف مطلوب' };
    if (!passport) return { error: 'رقم الجواز مطلوب' };
    return { value: { name, phone, passport } };
  }
  // bookings
  const tripId = toNum(body.tripId);
  const travelerId = toNum(body.travelerId);
  const date = text(body.date);
  const amount = toNum(body.amount);
  const status = text(body.status);
  if (!data.trips.some((t) => t.id === tripId)) return { error: 'الرحلة غير موجودة' };
  if (!data.travelers.some((t) => t.id === travelerId)) return { error: 'المسافر غير موجود' };
  if (!isDate(date)) return { error: 'تاريخ الحجز غير صالح' };
  if (!(amount >= 0)) return { error: 'المبلغ يجب أن يكون رقماً صفر أو أكبر' };
  if (!BOOKING_STATUS.includes(status)) return { error: 'حالة الحجز غير صالحة' };
  return { value: { tripId, travelerId, date, amount, status } };
}

// ---------- queries ----------
function enrich(coll, item, data) {
  if (coll !== 'bookings') return item;
  const trip = data.trips.find((t) => t.id === item.tripId);
  const traveler = data.travelers.find((t) => t.id === item.travelerId);
  return {
    ...item,
    tripName: trip ? trip.destination : '',
    travelerName: traveler ? traveler.name : '',
  };
}

function listItems(coll, q, data) {
  const items = data[coll].map((i) => enrich(coll, i, data));
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    Object.values(item).some((v) => String(v).toLowerCase().includes(needle))
  );
}

function summary(data) {
  const active = data.bookings.filter((b) => b.status !== 'ملغي');
  const revenue = active.reduce((s, b) => s + b.amount, 0);
  const byDest = new Map();
  for (const t of data.trips) {
    if (!byDest.has(t.destination)) byDest.set(t.destination, { label: t.destination, bookings: 0, revenue: 0 });
  }
  for (const b of active) {
    const trip = data.trips.find((t) => t.id === b.tripId);
    if (!trip) continue;
    const row = byDest.get(trip.destination);
    row.bookings += 1;
    row.revenue += b.amount;
  }
  const byDestination = [...byDest.values()].sort((a, b) => b.revenue - a.revenue);
  return {
    trips: data.trips.length,
    travelers: data.travelers.length,
    bookings: data.bookings.length,
    confirmed: data.bookings.filter((b) => b.status === 'مؤكد').length,
    pending: data.bookings.filter((b) => b.status === 'معلق').length,
    cancelled: data.bookings.filter((b) => b.status === 'ملغي').length,
    revenue,
    averageBooking: active.length ? Math.round((revenue / active.length) * 100) / 100 : 0,
    byDestination,
  };
}

// ---------- http helpers ----------
function sendJson(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('الطلب كبير جداً'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(Object.assign(new Error('JSON غير صالح'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url, store) {
  const parts = url.pathname.split('/').filter(Boolean); // api, coll, id?
  const data = store.data;
  const method = req.method;

  if (parts[1] === 'summary') {
    if (method !== 'GET') return sendJson(res, 405, { error: 'طريقة غير مسموحة' });
    return sendJson(res, 200, summary(data));
  }

  const coll = parts[1];
  if (!COLLECTIONS.includes(coll) || parts.length > 3) {
    return sendJson(res, 404, { error: 'المسار غير موجود' });
  }
  const id = parts[2] !== undefined ? Number(parts[2]) : null;
  if (id !== null && !Number.isInteger(id)) return sendJson(res, 404, { error: 'المعرف غير صالح' });

  if (method === 'GET' && id === null) {
    return sendJson(res, 200, listItems(coll, url.searchParams.get('q') || '', data));
  }

  if (method === 'POST' && id === null) {
    const body = await readBody(req);
    const v = validate(coll, body, data);
    if (v.error) return sendJson(res, 400, { error: v.error });
    const item = { id: store.nextId(), ...v.value };
    data[coll].push(item);
    store.save();
    return sendJson(res, 201, enrich(coll, item, data));
  }

  if (id === null) return sendJson(res, 405, { error: 'طريقة غير مسموحة' });
  const index = data[coll].findIndex((i) => i.id === id);
  if (index === -1) return sendJson(res, 404, { error: 'السجل غير موجود' });

  if (method === 'GET') {
    return sendJson(res, 200, enrich(coll, data[coll][index], data));
  }

  if (method === 'PUT') {
    const body = await readBody(req);
    const v = validate(coll, body, data);
    if (v.error) return sendJson(res, 400, { error: v.error });
    data[coll][index] = { id, ...v.value };
    store.save();
    return sendJson(res, 200, enrich(coll, data[coll][index], data));
  }

  if (method === 'DELETE') {
    data[coll].splice(index, 1);
    // cascade: bookings that point at a deleted trip or traveler are removed too
    if (coll === 'trips') data.bookings = data.bookings.filter((b) => b.tripId !== id);
    if (coll === 'travelers') data.bookings = data.bookings.filter((b) => b.travelerId !== id);
    store.save();
    return sendJson(res, 204);
  }

  return sendJson(res, 405, { error: 'طريقة غير مسموحة' });
}

const PAGES = ['/', '/summary', '/trips', '/bookings', '/travelers'];

function serveStatic(req, res, pathname) {
  let rel = PAGES.includes(pathname) ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(rel)));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('غير موجود');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function createServer(options = {}) {
  const store = createStore(options.dataFile);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
        return await handleApi(req, res, url, store);
      }
      if (req.method !== 'GET') {
        res.writeHead(405);
        return res.end();
      }
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status ? err.message : 'خطأ في الخادم' });
    }
  });
  server.store = store;
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
  createServer({ dataFile }).listen(port, host, () => {
    console.log(`لوحة تحكم وكالة السفر تعمل على http://${host}:${port}/`);
  });
}
