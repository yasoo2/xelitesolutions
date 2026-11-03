/**
 * LOGIN AND ROLES ARE JUDGED BY WHAT THE CODE DOES, NOT BY TEMPLATE NAMES.
 *
 * Measured on 2026-11-01 (exam P151): the agent engine built a clinic system
 * with a server login and admin/staff roles. Joe's acceptance judged both
 * "unmet: the build rendered a generic records form instead of a workflow
 * engine", because the source had none of the names Joe's first templates
 * used (apiLogin, TOKEN_KEY, CustomApp). Any freely written app failed there.
 *
 * Judged by behaviour instead: a login is a server route that checks a
 * hashed password and issues a session or token; roles are a role on the
 * user, a check of it, and a 403 for everyone else. A login that lives only
 * in the browser is still refused.
 */
import { verifyNamed } from '../core/quality/named-requirements';

const noModel = async () => { throw new Error('the model must not be asked'); };
const judge = async (text: string, source: string) =>
    (await verifyNamed([{ id: 'c1', text, quote: text }], source, false, noModel))[0];

const SERVER = `
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
app.post('/api/auth/login', async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email);
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) return res.status(401).json({ error: 'invalid' });
  res.json({ token: jwt.sign({ id: user.id, role: user.role }, SECRET) });
});
function requireRole(role) {
  return (req, res, next) => (req.user.role === role ? next() : res.status(403).json({ error: 'forbidden' }));
}
db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT DEFAULT 'staff')");
const seed = { email: 'admin@clinic.test', role: 'admin' };
app.delete('/api/patients/:id', requireRole('admin'), (req, res) => {});
`;

describe('a login and roles the code really has are met', () => {
    it('User login: a server route, a hashed password check and a token', async () => {
        expect(await judge('User login', SERVER)).toMatchObject({ verdict: 'met', why: expect.stringMatching(/login route that checks a hashed password/) });
    });

    it('Admin role: a role on the user, a check of it, and a 403', async () => {
        expect(await judge('Admin role', SERVER)).toMatchObject({ verdict: 'met', why: expect.stringMatching(/refuses the others with 403/) });
    });

    it('the same in Arabic words', async () => {
        expect((await verifyNamed([{ id: 'c1', text: 'تسجيل الدخول', quote: 'تسجيل الدخول' }], SERVER, true, noModel))[0].verdict).toBe('met');
    });
});

describe('a login with a session token the server keeps is a login', () => {
    it('scrypt, a constant-time comparison and a random token stored as the session (exam P151)', async () => {
        const source = `
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function verifyPassword(password, user) { return timingSafeEqual(scryptSync(password, user.passwordSalt, 64), Buffer.from(user.passwordHash, 'hex')); }
app.post('/api/auth/login', (req, res) => {
  const user = db.get().users.find(u => u.username === req.body.username);
  if (!user || !verifyPassword(req.body.password, user)) return res.status(401).json({ error: 'Invalid' });
  const token = randomBytes(32).toString('hex');
  db.get().sessions[token] = { userId: user.id };
  res.json({ token });
});`;
        expect((await judge('User login', source)).verdict).toBe('met');
    });
});

describe('a login whose router has its own name (exam P155, 2026-11-03)', () => {
    //  The library system mounted `authRouter` at /api/auth; scrypt, a random
    //  token kept as the session — refused four times as «unmet: the build
    //  rendered a generic records form instead of a workflow engine».
    const P155 = `
const crypto = require('crypto');
function verify(password, user) { return crypto.timingSafeEqual(crypto.scryptSync(String(password), user.salt, 64), Buffer.from(user.hash, 'hex')); }
const authRouter = express.Router();
authRouter.post('/login', (req, res) => {
  const user = db().users.find(u => u.email === req.body.email);
  if (!user || !verify(req.body.password, user)) return res.status(401).json({ error: 'invalid' });
  const token = crypto.randomBytes(32).toString('hex');
  db().sessions[token] = user.id;
  res.json({ token });
});
app.use('/api/auth', authRouter);`;

    it('is a server login route, whatever the router is called', async () => {
        expect(await judge('User login', P155)).toMatchObject({ verdict: 'met', why: expect.stringMatching(/login route that checks a hashed password/) });
    });

    it('a client call to the login route is not a server route', async () => {
        const client = `
import { scryptSync } from 'crypto';
const sessions = {}; sessions[crypto.randomBytes(16)] = 1;
api.post('/api/auth/login', { email, password }).then(r => setToken(r.token));`;
        expect((await judge('User login', client)).verdict).not.toBe('met');
    });

    it('what the shapes cannot prove goes to the judge, which must quote the line — never «a generic records form»', async () => {
        const source = `
const users = new Map();
authApi.handle('POST', '/login', async ({ body }) => issueTicket(await checkHash(body.password, users.get(body.email))));`;
        let asked = 0;
        const model = async () => {
            asked++;
            return JSON.stringify({ verdicts: [{ id: 'c1', verdict: 'met', evidence: "authApi.handle('POST', '/login', async ({ body }) => issueTicket(await checkHash(body.password, users.get(body.email))));", why: 'a server login handler' }] });
        };
        const verdict = (await verifyNamed([{ id: 'c1', text: 'User login', quote: 'User login' }], source, false, model))[0];
        expect(asked).toBeGreaterThan(0);
        expect(verdict.verdict).toBe('met');
        expect(verdict.why).not.toMatch(/generic records form/);
    });
});

describe('what only looks like a login is still refused', () => {
    it('a password compared in the browser, with no server and no hash, is not a login', async () => {
        const fake = `
function login() {
  if (document.getElementById('password').value === 'admin123') { localStorage.setItem('loggedIn', '1'); showDashboard(); }
}`;
        expect((await judge('User login', fake)).verdict).not.toBe('met');
    });

    it('a role that nothing checks is not role-based access', async () => {
        const unchecked = `const users = [{ name: 'a', role: 'admin' }, { name: 'b', role: 'staff' }]; app.get('/api/patients', (req, res) => res.json(all));`;
        expect((await judge('Admin role', unchecked)).verdict).not.toBe('met');
    });
});
