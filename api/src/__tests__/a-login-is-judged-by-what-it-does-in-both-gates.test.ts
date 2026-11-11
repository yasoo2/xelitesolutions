import fs from 'fs';
import os from 'os';
import path from 'path';
import { hasServerLoginEvidence, scopeReport } from '../core/quality/scope-audit';

/**
 * The hard exam, 2026-11-05, H11 — «… comments with moderation, and an admin
 * login»: refused four times with «missing: user accounts». The blog's server
 * had a real login: POST /api/admin/login, the password compared with
 * crypto.timingSafeEqual, five failures lock the address for fifteen minutes,
 * and a random token kept as the session in an HttpOnly cookie.
 *
 * The named-requirements gate already judged a login by what it does — a
 * server route, a password check that is not a plain comparison, a session
 * it issues. The scope audit still wanted the words «/api/auth/login»,
 * «bearer» or «jwt». One login, two gates, two answers. Now both read it the
 * same way.
 */
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-login-gates-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

const H11 = 'Build a markdown blog engine: write posts in markdown with a live preview, tags, full-text search, drafts and published posts, an RSS feed, SEO meta tags, comments with moderation, and an admin login.';

// The H11 server's login, as it was written.
const SESSION_LOGIN = `const express = require('express');
const crypto = require('crypto');
const app = express();
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const sessions = new Map();
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
app.post('/api/admin/login', (req, res) => {
  const username = String((req.body && req.body.username) || '');
  const password = String((req.body && req.body.password) || '');
  if (!sameSecret(username, ADMIN_USER) || !sameSecret(password, ADMIN_PASSWORD)) return res.status(401).json({ error: 'Invalid username or password' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 3600000);
  res.setHeader('Set-Cookie', 'sid=' + token + '; HttpOnly; SameSite=Lax; Path=/');
  res.json({ ok: true });
});
app.listen(3000);
`;

describe('a login is judged by what it does, in both gates', () => {
    it('H11: a session login on /api/admin/login is the login the request asked for', () => {
        expect(hasServerLoginEvidence(SESSION_LOGIN)).toBe(true);
        const report = scopeReport(H11, [tree({ 'server.js': SESSION_LOGIN })]);
        expect(report.built.map(c => c.id)).toContain('accounts');
        expect(report.missing.map(c => c.id)).not.toContain('accounts');
    });

    it('a login route that compares the password in plain text and issues nothing is still missing', () => {
        const plain = `const app = require('express')();
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === 'admin') return res.json({ ok: true });
  res.status(401).end();
});
app.listen(3000);
`;
        expect(hasServerLoginEvidence(plain)).toBe(false);
        expect(scopeReport(H11, [tree({ 'server.js': plain })]).missing.map(c => c.id)).toContain('accounts');
    });

    it('a client that only calls a login route is not a login', () => {
        const client = `async function signIn(user, pass) {
  const res = await api.post('/api/auth/signin', { user, pass });
  localStorage.setItem('session', res.data.id);
}
`;
        expect(hasServerLoginEvidence(client)).toBe(false);
    });
});
