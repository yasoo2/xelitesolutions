import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/user';
import { config } from '../config';
import mongoose from 'mongoose';
import { mockDb } from '../mock/db';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing email/password' });
  const passwordHash = await bcrypt.hash(password, 10);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const exists = mockDb.findUserByEmail(email);
    if (exists) return res.status(409).json({ error: 'Email already exists' });
    const user = mockDb.createUser(email, passwordHash, role || 'USER');
    return res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } else {
    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(409).json({ error: 'Email already exists' });
    const user = await User.create({ email, passwordHash, role: role || 'USER' });
    return res.status(201).json({ id: user._id, email: user.email, role: user.role });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing email/password' });
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const user = mockDb.findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: user.id.toString(), role: user.role }, config.jwtSecret, { expiresIn: '7d' });
    return res.json({ token });
  } else {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, { expiresIn: '7d' });
    return res.json({ token });
  }
});

export default router;
