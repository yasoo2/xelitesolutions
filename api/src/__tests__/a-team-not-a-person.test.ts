/**
 * «نظام لشخص واحد» — AND A BUSINESS IS NOT ONE PERSON.
 *
 * Every system Joe had ever built shipped with exactly ONE account. Giving the
 * man at the counter access meant giving him the owner's password, which is
 * not a permission — it is a surrender. Three roles close that:
 *
 *   المالك   — everything, and the only one who makes accounts
 *   موظّف    — writes, and touches only the rows he wrote
 *   مُطّلِع  — sees everything, changes nothing
 *
 * These gates hold the SHAPE. The behaviour is measured live and separately:
 *   • verify_roles_are_real.ts   — 49/49, real server, real HTTP break-ins
 *   • verify_the_team_can_use_it.ts — 26/26, three people, three real browser
 *     contexts, a vite build and a demotion that reaches the screen
 */
import fs from 'fs';
import path from 'path';
import {
    ROLES, ROLE_KEYS, OWNER_COLUMN, roleSpec, canWrite, ownRowsOnly, canManageUsers,
    isRole, describeRoles, DEFAULT_NEW_ROLE,
} from '../core/design/roles';
import { fileAppStoreJs, fileAccountsJsx, fileAccountsCss, fileTablesAdminJsx, fileAppShellJsx } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor } from '../core/design/app-blueprints';

const SRC = path.join(__dirname, '..');
/**
 *  ⛔ A GUARD MUST NOT DEPEND ON HOW GIT CHECKED THE FILE OUT.
 *
 *  Every multi-line assertion in this file is a regex containing `\n`. Git
 *  checks these sources out with CRLF endings on Windows, so
 *
 *      /owner_id INTEGER DEFAULT NULL,\n      created_at TEXT/
 *
 *  matched on Linux and could not match on the owner's machine — and the
 *  failure said «Expected pattern … Received "/**"», which reads like the file
 *  is wrong rather than the reader.
 *
 *  The claim is about what the SOURCE SAYS, not about which two bytes end a
 *  line. Normalising here fixes every assertion in the file at once, which is
 *  the level the fix belongs at: patching each regex would be the same fact
 *  written a dozen times, and one of them would eventually be written wrong.
 */
const read = (...p: string[]) =>
    fs.readFileSync(path.join(SRC, ...p), 'utf-8').replace(/\r\n/g, '\n');
const API = () => read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');

describe('three roles, and not a fourth nobody asked for', () => {
    it('the system knows exactly owner, staff and viewer', () => {
        expect(ROLE_KEYS).toEqual(['owner', 'staff', 'viewer']);
        expect(ROLES).toHaveLength(3);
    });

    it('each one can do precisely what its name says', () => {
        expect([canWrite('owner'), ownRowsOnly('owner'), canManageUsers('owner')]).toEqual([true, false, true]);
        expect([canWrite('staff'), ownRowsOnly('staff'), canManageUsers('staff')]).toEqual([true, true, false]);
        expect([canWrite('viewer'), ownRowsOnly('viewer'), canManageUsers('viewer')]).toEqual([false, false, false]);
    });

    it('an unknown role is the LEAST privileged one — a typo never hands out keys', () => {
        expect(roleSpec('superadmin').key).toBe('viewer');
        expect(roleSpec('').key).toBe('viewer');
        expect(canWrite('root')).toBe(false);
        expect(canManageUsers('admin')).toBe(false);
        expect(isRole('superadmin')).toBe(false);
        expect(isRole('OWNER')).toBe(true);   // case is spelling, not identity
    });

    it('and a new account is a staff account until somebody says otherwise', () => {
        expect(DEFAULT_NEW_ROLE).toBe('staff');
    });

    it('the column that says whose row it is has ONE name', () => {
        expect(OWNER_COLUMN).toBe('owner_id');
    });

    it('and the chat explains all three in the reader’s own language', () => {
        const ar = describeRoles(true);
        for (const r of ROLES) expect(ar).toContain(r.ar);
        const en = describeRoles(false);
        for (const r of ROLES) expect(en).toContain(r.en);
    });
});

describe('the generated server decides nothing twice', () => {
    it('auth.js carries the guards, and reads the role from the DATABASE', () => {
        const a = API();
        expect(a).toMatch(/export function requireRole\(\.\.\.roles\)/);
        expect(a).toMatch(/export function requireWrite\(req, res, next\)/);
        expect(a).toMatch(/export function optionalAuth\(req, _res, next\)/);
        expect(a).toMatch(/export function scopeOf\(req\)/);
        expect(a).toMatch(/export function mayTouch\(req, row\)/);
        // requireAuth re-reads the user, so a demotion takes effect at once
        // rather than when a twelve-hour token happens to expire.
        expect(a).toMatch(/const user = db\.userById\(claims\.sub\);/);
        expect(a).toMatch(/req\.user = \{ id: user\.id, email: user\.email, role: user\.role \};/);
    });

    it('the roles are COMPILED from one definition, not retyped', () => {
        const a = API();
        expect(a).toMatch(/export const ROLES = \$\{JSON\.stringify\(ROLES\.map/);
        expect(a).toMatch(/import \{ ROLES, describeRoles \} from '\.\.\/\.\.\/\.\.\/core\/design\/roles';/);
    });

    it('a viewer is refused once, for every table there is', () => {
        expect(API()).toMatch(/if \(!canWrite\(req\.user\.role\)\) return res\.status\(403\)\.json\(\{ ok: false, error: 'read_only' \}\);/);
    });

    it('and an unowned row is the house’s — an employee does not inherit it', () => {
        const a = API();
        expect(a).toMatch(/if \(!row \|\| row\.owner_id === null \|\| row\.owner_id === undefined \|\| row\.owner_id === ''\) return false;/);
        expect(a).toMatch(/return Number\(row\.owner_id\) === Number\(req\.user\.id\);/);
    });
});

describe('every table carries the column, on both backends', () => {
    const a = () => API();

    it('the main table gets it, and an OLD database is migrated rather than refused', () => {
        expect(a()).toMatch(/owner_id INTEGER DEFAULT NULL,\n      created_at TEXT DEFAULT \(datetime\('now'\)\)/);
        expect(a()).toContain("ALTER TABLE ${resource} ADD COLUMN owner_id INTEGER DEFAULT NULL");
    });

    it('the generated tables get it too', () => {
        expect(a()).toMatch(/owner_id INTEGER DEFAULT NULL, created_at TEXT DEFAULT \(datetime\('now'\)\)/);
        expect(a()).toMatch(/'ALTER TABLE ' \+ e\.key \+ ' ADD COLUMN owner_id INTEGER DEFAULT NULL'/);
    });

    it('the JSON backend scopes exactly like SQLite — one behaviour, two stores', () => {
        const src = a();
        const scoped = src.match(/ownerId === undefined \|\| ownerId === null \|\| Number\(r\.owner_id\) === Number\(ownerId\)/g) || [];
        expect(scoped.length).toBeGreaterThanOrEqual(2);
        expect(src).toMatch(/WHERE owner_id = \? ORDER BY id DESC LIMIT 500/);
    });

    it('and the accounts list never carries a salt or a hash', () => {
        const src = a();
        expect(src).toMatch(/db\.listUsers = \(\) => conn\.prepare\('SELECT id, email, role, created_at FROM users ORDER BY id'\)/);
        expect(src).toMatch(/listUsers: \(\) => \(load\(\)\.users \|\| \[\]\)\.map\(\(u\) => \(\{ id: u\.id, email: u\.email, role: u\.role, created_at: u\.created_at \}\)\)/);
        expect(src).toMatch(/db\.countOwners = \(\)/);
    });
});

describe('the accounts routes, and the ways they can be abused', () => {
    const a = () => API();

    it('all four are the owner’s alone', () => {
        expect(a()).toMatch(/const ownerOnly = \[requireAuth, requireRole\('owner'\)\];/);
        for (const route of [
            /app\.get\('\/api\/auth\/users', \.\.\.ownerOnly/,
            /app\.post\('\/api\/auth\/users', \.\.\.ownerOnly/,
            /app\.put\('\/api\/auth\/users\/:id', \.\.\.ownerOnly/,
            /app\.delete\('\/api\/auth\/users\/:id', \.\.\.ownerOnly/,
        ]) expect(a()).toMatch(route);
    });

    it('a made-up role is refused at the door', () => {
        expect(a()).toMatch(/if \(!isRole\(want\)\) return res\.status\(400\)\.json\(\{ ok: false, error: 'bad_role' \}\);/);
    });

    it('a generated password is returned ONCE and never stored in the clear', () => {
        const src = a();
        expect(src).toMatch(/const pass = typeof password === 'string' \? password : crypto\.randomBytes\(9\)\.toString\('base64url'\);/);
        expect(src).toMatch(/const \{ salt, hash \} = hashPassword\(pass\);/);
        expect(src).toMatch(/password: typeof password === 'string' \? undefined : pass,/);
    });

    it('and the owner cannot lock himself out of his own system', () => {
        const src = a();
        expect(src).toMatch(/if \(target\.role === 'owner' && want !== 'owner' && db\.countOwners\(\) <= 1\) \{/);
        expect(src).toMatch(/return res\.status\(409\)\.json\(\{ ok: false, error: 'last_owner' \}\);/);
        expect(src).toMatch(/if \(Number\(target\.id\) === Number\(req\.user\.id\)\) return res\.status\(409\)\.json\(\{ ok: false, error: 'cannot_delete_self' \}\);/);
    });

    it('a duplicate email never overwrites the account that already has it', () => {
        expect(a()).toMatch(/if \(db\.userByEmail\(mail\)\) return res\.status\(409\)\.json\(\{ ok: false, error: 'email_taken' \}\);/);
    });

    it('and the build message tells the owner the roles exist at all', () => {
        const src = a();
        expect(src).toContain('👥 فريقك — النظام لم يعد لشخص واحد:');
        expect(src).toMatch(/\$\{describeRoles\(true\)\}/);
        expect(src).toMatch(/\$\{describeRoles\(false\)\}/);
        expect(src).toContain('not_your_row');
    });
});

describe('and the screen can express the rules — or they do not exist', () => {
    const store = () => fileAppStoreJs();

    it('the app knows which role is looking, and forgets it on sign-out', () => {
        const s = store();
        expect(s).toMatch(/const ROLE_KEY = TOKEN_KEY \+ ':role';/);
        expect(s).toMatch(/export function getRole\(\)/);
        expect(s).toMatch(/export function canWriteNow\(\) \{ const r = getRole\(\); return !!getToken\(\) && r !== 'viewer'; \}/);
        expect(s).toMatch(/export function isOwnerNow\(\) \{ return !!getToken\(\) && getRole\(\) === 'owner'; \}/);
        expect(s).toMatch(/export function apiLogout\(\) \{ setToken\('', ''\); \}/);
    });

    it('and it re-reads the role from the server instead of trusting its memory', () => {
        expect(store()).toMatch(/if \(d && d\.user && d\.user\.role !== getRole\(\)\) setToken\(getToken\(\), d\.user\.role\);/);
    });

    it('a signed-in READ carries the token, or the scoping never reaches the screen', () => {
        const s = store();
        expect(s).toMatch(/const r = await fetch\(await resolvedApi\(api\), \{ headers: \{ Accept: 'application\/json', \.\.\.authHeaders\(\) \} \}\);/);
        expect(s).toMatch(/const r = await fetch\(url, \{ headers: \{ Accept: 'application\/json', \.\.\.authHeaders\(\) \} \}\);/);
    });

    it('the three refusals are three different sentences', () => {
        const s = store();
        expect(s).toMatch(/export function refusalOf\(res\)/);
        expect(s).toMatch(/if \(res\.error === 'read_only'\) return 'read_only';/);
        expect(s).toMatch(/if \(res\.error === 'not_your_row'\) return 'not_your_row';/);
        // …and the server's reason survives the fetch wrapper to be read at all.
        expect(s).toMatch(/return \{ ok: false, status: r\.status, needsAuth: r\.status === 401, error: \(e && e\.error\) \|\| '' \};/);
    });

    it('the accounts screen exists, and renders for the owner ONLY', () => {
        const jsx = fileAccountsJsx(true);
        expect(jsx).toMatch(/import \{ apiUsers, apiAddUser, apiSetRole, apiRemoveUser, isOwnerNow \}/);
        expect(jsx).toMatch(/if \(!api \|\| !owner\) return null;/);
        for (const r of ROLES) expect(jsx).toContain(r.ar);
        // The password is shown once, on screen, and said to be unrecoverable.
        expect(jsx).toContain('كلمة المرور تظهر مرة واحدة');
        expect(jsx).toMatch(/setMade\(\{ email: r\.user\.email, password: r\.password \}\);/);
    });

    it('and it says what the server would say, in words', () => {
        const jsx = fileAccountsJsx(true);
        for (const code of ['last_owner', 'cannot_delete_self', 'email_taken', 'bad_role', 'forbidden']) {
            expect(jsx).toContain(code + ':');
        }
    });

    it('the administration table hides what an account may not do', () => {
        const t = fileTablesAdminJsx([{ key: 'suppliers', ar: 'الموردون', en: 'suppliers',
            fields: [{ key: 'name', type: 'TEXT', required: true, ar: 'الاسم', en: 'name' }] }] as any, true);
        expect(t).toMatch(/const \[mayWrite, setMayWrite\] = useState\(\(\) => canWriteNow\(\)\);/);
        expect(t).toMatch(/\{mayWrite \? \(\n\s*<form className="tbl-form"/);
        expect(t).toContain('حسابك للاطّلاع فقط');
        expect(t).toContain('هذا الصف ليس لك');
        // Signing in changes WHICH rows this list is — it must be refetched.
        expect(t).toMatch(/window\.addEventListener\('joe:auth', again\);/);
    });

    it('and the shell renders the accounts screen wherever there is a server', () => {
        const bp = blueprintFor('generic', 'x', true);
        const withApi = fileAppShellJsx(bp, true, false, true);
        expect(withApi).toContain("import Accounts from './components/Accounts.jsx';");
        expect(withApi).toContain('<Accounts api={content.api} />');
        expect(withApi).toMatch(/<span className="auth-role">\{ROLE_LABEL\[user\.role\] \|\| user\.role\}<\/span>/);
        // …and a build with no server imports a file that would not exist.
        const noApi = fileAppShellJsx(bp, true, false, false);
        expect(noApi).not.toContain('Accounts.jsx');
    });

    it('the screen is styled, and its controls are thumb-sized', () => {
        const css = fileAccountsCss();
        expect(css).toMatch(/\.acc-field input, \.acc-field select \{[^}]*min-height: 44px/);
        expect(css).toMatch(/\.acc-scroll \.danger \{[^}]*min-height: 44px/);
        // A password in a monospace box, laid out left-to-right even in Arabic.
        expect(css).toMatch(/\.acc-made code \{[^}]*direction: ltr/);
        expect(css).not.toContain('`');
    });
});
