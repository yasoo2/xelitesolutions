import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/user';
import { config } from '../config';
import mongoose from 'mongoose';
import { mockDb } from '../mock/db';
import { OAuth2Client } from 'google-auth-library';

const router = Router();

// Corresponds to Section 2 of the JOE MASTER SPEC
// Handles user registration and login.
router.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const emailNormalized = String(email || '').trim().toLowerCase();
  const passwordRaw = String(password || '');
  if (!emailNormalized || !passwordRaw) return res.status(400).json({ error: 'Missing email/password' });
  const passwordHash = await bcrypt.hash(passwordRaw, 10);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const exists = mockDb.findUserByEmail(emailNormalized);
    if (exists) return res.status(409).json({ error: 'Email already exists' });
    const isFirstUser = mockDb.countUsers() === 0;
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const effectiveRole = isFirstUser || (adminEmail && emailNormalized === adminEmail) ? 'OWNER' : 'USER';
    const user = mockDb.createUser(emailNormalized, passwordHash, effectiveRole);
    return res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } else {
    let exists = await User.findOne({ email: emailNormalized }).lean();
    if (!exists) {
      exists = await User.findOne({ email: { $regex: new RegExp(`^${emailNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }).lean();
    }
    if (exists) return res.status(409).json({ error: 'Email already exists' });
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;
    // Block registration if it's not open
    const registrationOpen = process.env.REGISTRATION_OPEN === 'true';
    if (!registrationOpen) {
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      if (!isFirstUser && (!adminEmail || emailNormalized !== adminEmail)) {
        return res.status(403).json({ error: 'Registration is currently closed' });
      }
    }
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const effectiveRole: any = isFirstUser || (adminEmail && emailNormalized === adminEmail) ? 'OWNER' : 'USER';
    const user = await User.create({ email: emailNormalized, passwordHash, role: effectiveRole });
    return res.status(201).json({ id: user._id, email: user.email, role: user.role });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const emailNormalized = String(email || '').trim().toLowerCase();
  const passwordRaw = String(password || '');
  if (!emailNormalized || !passwordRaw) return res.status(400).json({ error: 'Missing email/password' });

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  // Auto-provision specific admin user if they don't exist
  if (adminEmail && adminPassword && emailNormalized === adminEmail && passwordRaw === adminPassword) {
    const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
    if (!useMock) {
      let user = await User.findOne({ email: emailNormalized });
      if (!user) {
        // Try case-insensitive lookup
        user = await User.findOne({ email: { $regex: new RegExp(`^${emailNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
      }

      if (!user) {
        const passwordHash = await bcrypt.hash(passwordRaw, 10);
        await User.create({ email: emailNormalized, passwordHash, role: 'OWNER' });
      } else {
        // Force update password to match what we expect
        let match = false;
        if (user.passwordHash) {
          match = await bcrypt.compare(passwordRaw, user.passwordHash);
        }
        if (!match) {
          const passwordHash = await bcrypt.hash(passwordRaw, 10);
          user.passwordHash = passwordHash;
          user.role = 'OWNER';
          await user.save();
        }
      }
    } else {
      // Provision in Mock DB
      let user = mockDb.findUserByEmail(emailNormalized);
      if (!user) {
        const passwordHash = await bcrypt.hash(passwordRaw, 10);
        mockDb.createUser(emailNormalized, passwordHash, 'OWNER');
      }
    }
  }

  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const isProd = process.env.NODE_ENV === 'production';
    let user = mockDb.findUserByEmail(emailNormalized);
    if (!user && !isProd && mockDb.countUsers() === 0) {
      const passwordHash = await bcrypt.hash(passwordRaw, 10);
      user = mockDb.createUser(emailNormalized, passwordHash, 'OWNER');
    }
    if (!user) {
      return res.status(401).json({ error: isProd ? 'Invalid credentials' : 'No account found. Click Register to create one.' });
    }
    const ok = await bcrypt.compare(passwordRaw, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({
      sub: user.id.toString(),
      role: user.role,
      email: user.email,
      name: user.name || 'User',
      picture: user.picture || ''
    }, config.jwtSecret, { expiresIn: '7d' });
    return res.json({ token });
  } else {
    let user = await User.findOne({ email: emailNormalized });
    if (!user) {
      user = await User.findOne({ email: { $regex: new RegExp(`^${emailNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    }
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(passwordRaw, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name || 'User',
      picture: user.picture || ''
    }, config.jwtSecret, { expiresIn: '7d' });
    return res.json({ token });
  }
});

router.post('/dev', async (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) return res.status(404).json({ error: 'Not found' });

  const ra = String((req.socket as any)?.remoteAddress || '').toLowerCase();
  const ip = String((req as any).ip || '').toLowerCase();

  // Strict checking of loopback IP only. Do NOT trust the 'Host' header.
  const isLoopback =
    ra === '127.0.0.1' ||
    ra === '::1' ||
    ra.startsWith('::ffff:127.0.0.1') ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('::ffff:127.0.0.1');

  if (!isLoopback) return res.status(404).json({ error: 'Not found' });

  const token = jwt.sign({ sub: 'dev-user', role: 'OWNER' }, config.jwtSecret, { expiresIn: '7d' });
  return res.json({ token });
});

/* Google Auth Route */
router.post('/google', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    // Verify Access Token by fetching UserInfo
    // This is compatible with 'useGoogleLogin' which returns an access_token.
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!userInfoRes.ok) {
      return res.status(400).json({ error: 'Invalid Google Token' });
    }

    const payload = await userInfoRes.json();
    console.log('DEBUG: Google Payload:', JSON.stringify(payload, null, 2));

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google Profile' });
    }

    const name = String(payload.name || '').trim();
    const picture = String(payload.picture || '').trim();
    const emailNormalized = payload.email.trim().toLowerCase();

    // ... (rest of logic is same: Find or Create User) ...
    const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
    let user: any;

    if (useMock) {
      user = mockDb.findUserByEmail(emailNormalized);
      if (!user) {
        const passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
        const isFirstUser = mockDb.countUsers() === 0;
        user = mockDb.createUser(emailNormalized, passwordHash, isFirstUser ? 'OWNER' : 'USER');
        // MockDB doesn't persist extra fields by default in this simple impl, but we can try attaching it to object
        user.name = name;
        user.picture = picture;
      }
    } else {
      user = await User.findOne({ email: emailNormalized });
      if (!user) {
        const passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
        const count = await User.countDocuments();
        const role = count === 0 ? 'OWNER' : 'USER';
        user = await User.create({
          email: emailNormalized,
          passwordHash,
          role,
          name,
          picture
        });
      } else {
        // Update existing user with latest Google info if missing or changed
        // ALWAYS sync latest Google info to DB
        // This ensures if user changes picture on Google, it reflects here.
        // And fixes issues where legacy users had missing/empty fields.
        if (name || picture) {
          user.name = name || user.name;
          user.picture = picture || user.picture;
          await user.save();
        }
      }
    }

    const appToken = jwt.sign(
      {
        sub: useMock ? user.id : user._id.toString(),
        role: user.role,
        email: user.email || emailNormalized,
        name: user.name || name,
        picture: user.picture || picture
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json({ token: appToken });
  } catch (error) {
    console.error('Google Auth Error:', error);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
});

export default router;
