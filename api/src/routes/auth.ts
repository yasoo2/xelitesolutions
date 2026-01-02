import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/user';
import { config } from '../config';
import mongoose from 'mongoose';
import { mockDb } from '../mock/db';

const router = Router();

// Corresponds to Section 2 of the JOE MASTER SPEC
// Handles user registration and login.
router.post('/register', async (req: Request, res: Response) => {
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
    // Block registration if it's not open
    const registrationOpen = process.env.REGISTRATION_OPEN === 'true';
    if (!registrationOpen) {
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      if (!adminEmail || email.toLowerCase() !== adminEmail) {
        return res.status(403).json({ error: 'Registration is currently closed' });
      }
    }
    const user = await User.create({ email, passwordHash, role: role || 'USER' });
    return res.status(201).json({ id: user._id, email: user.email, role: user.role });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing email/password' });

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  // Auto-provision specific admin user if they don't exist
  if (adminEmail && adminPassword && email.toLowerCase() === adminEmail && password === adminPassword) {
    const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
    if (!useMock) {
      let user = await User.findOne({ email });
      if (!user) {
        // Try case-insensitive lookup
        user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
      }

      if (!user) {
        const passwordHash = await bcrypt.hash(password, 10);
        await User.create({ email, passwordHash, role: 'OWNER' });
      } else {
        // Force update password to match what we expect
        let match = false;
        if (user.passwordHash) {
          match = await bcrypt.compare(password, user.passwordHash);
        }
        if (!match) {
          const passwordHash = await bcrypt.hash(password, 10);
          user.passwordHash = passwordHash;
          user.role = 'OWNER';
          await user.save();
        }
      }
    } else {
        // Provision in Mock DB
        let user = mockDb.findUserByEmail(email);
        if (!user) {
            const passwordHash = await bcrypt.hash(password, 10);
            mockDb.createUser(email, passwordHash, 'OWNER');
        }
    }
  }

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
