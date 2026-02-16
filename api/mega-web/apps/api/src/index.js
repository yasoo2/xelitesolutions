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

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/app')
  .then(() => console.log('✅ DB Connected'));

app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/api/status', (req, res) => {
  const state = mongoose.connection && mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ ok: true, db: state, uptime: process.uptime(), ts: Date.now() });
});

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

app.listen(4000, () => console.log('🚀 API on 4000'));