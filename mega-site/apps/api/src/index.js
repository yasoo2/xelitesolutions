const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.disable('x-powered-by');
app.use((req, res, next) => {
  const start = Date.now();
  res.once('finish', () => {
    const ms = Date.now() - start;
    console.log(req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + ms + 'ms');
  });
  next();
});

if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ DB Connected'))
    .catch((e) => console.warn('⚠️ DB Connect Failed:', e && e.message ? e.message : String(e)));
} else {
  console.log('⚠️ DB Disabled (MONGO_URI not set)');
}

app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/api/status', (req, res) => {
  const state = mongoose.connection && mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ ok: true, db: state, uptime: process.uptime(), ts: Date.now() });
});

const Product = mongoose.model('Product', new mongoose.Schema({ name: String, price: Number }));
app.get('/api/products', async (req, res) => res.json(await Product.find()));

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = mongoose.model('User', new mongoose.Schema({ email: { type: String, unique: true }, password: String }));
const signToken = (u) => jwt.sign({ uid: String(u._id) }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
    const hash = await bcrypt.hash(password, 10);
    const u = await User.create({ email, password: hash });
    return res.json({ ok: true, token: signToken(u) });
  } catch (e) {
    return res.status(400).json({ error: 'register_failed', details: String(e.message || e) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const u = await User.findOne({ email });
  if (!u) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  return res.json({ ok: true, token: signToken(u) });
});

const Cart = mongoose.model('Cart', new mongoose.Schema({ uid: String, items: [{ productId: String, qty: Number }] }));
app.post('/api/cart', async (req, res) => {
  const { uid, productId, qty } = req.body || {};
  if (!uid || !productId || !qty) return res.status(400).json({ error: 'missing_fields' });
  const c = (await Cart.findOne({ uid })) || (await Cart.create({ uid, items: [] }));
  const i = c.items.find(x => x.productId === productId);
  if (i) i.qty += qty; else c.items.push({ productId, qty });
  await c.save();
  return res.json({ ok: true, cart: c.items });
});
app.get('/api/cart', async (req, res) => {
  const uid = String(req.query.uid || '').trim();
  const c = await Cart.findOne({ uid });
  return res.json({ ok: true, cart: c?.items || [] });
});

const Order = mongoose.model('Order', new mongoose.Schema({ uid: String, items: [{ productId: String, qty: Number }], total: Number, createdAt: { type: Date, default: Date.now } }));
app.post('/api/orders', async (req, res) => {
  const { uid } = req.body || {};
  const c = await Cart.findOne({ uid });
  if (!c || !c.items.length) return res.status(400).json({ error: 'empty_cart' });
  const total = c.items.reduce((sum, i) => sum + (i.qty * 10), 0);
  const o = await Order.create({ uid, items: c.items, total });
  c.items = []; await c.save();
  return res.json({ ok: true, orderId: String(o._id), total });
});
app.get('/api/orders', async (req, res) => {
  const uid = String(req.query.uid || '').trim();
  const orders = await Order.find({ uid }).sort({ createdAt: -1 }).limit(20);
  return res.json({ ok: true, orders });
});

app.listen(4000, () => console.log('🚀 API on 4000'));
const sseClients = new Set();
const messages = [];
function sseBroadcast(obj) {
  const data = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of sseClients) {
    res.write(data);
  }
}
app.get('/chat/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'history', items: messages.slice(-50) })}\n\n`);
  req.on('close', () => {
    sseClients.delete(res);
    res.end();
  });
});
app.post('/chat/send', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const from = String(req.body?.from || 'user').trim();
  if (!text) return res.status(400).json({ error: 'missing_text' });
  const item = { text, from, ts: Date.now() };
  messages.push(item);
  sseBroadcast({ type: 'message', item });
  return res.json({ ok: true });
});
