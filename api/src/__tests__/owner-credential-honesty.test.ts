/**
 * A CREDENTIAL THAT DOES NOT WORK MUST NEVER BE HANDED OVER.
 *
 * From his own build log:
 *
 *     auth proof → anonymous write 401, orders 401, wrong password 401,
 *                  owner login FAILED
 *     live proof → FAILED
 *     …
 *     Owner account (shown once): owner@myapp.local / 87m6i6IfNfe5
 *
 * The tool tried to log in with that exact password, was refused, and printed
 * it anyway. The cause is not a bug in the server: seedOwner() creates the
 * owner ONCE, on an empty database, and rebuilding a project over an existing
 * data.db correctly leaves the old account alone — while the tool had already
 * minted a fresh password for a message it was about to send.
 *
 * Two facts were also being reported as one: «the server never started» and
 * «the server started and the proof failed» printed the same sentence, so the
 * one line that could have explained this pointed the wrong way.
 */
import fs from 'fs';
import path from 'path';

const T = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ApiProjectTool.ts'), 'utf-8');

describe('the owner password is only offered when it can work', () => {
    it('listens for the server saying it created the account', () => {
        expect(T()).toMatch(/if \(\/owner account created\/\.test\(l\)\) ownerCreated = true;/);
    });

    it('prints the password only when the login was proved, or the account is new', () => {
        const s = T();
        expect(s).toMatch(/\$\{authProven \|\| ownerCreated \|\| !installed/);
        // …and both languages share the rule; the English message shipped the
        // credential unconditionally.
        expect((s.match(/authProven \|\| ownerCreated \|\| !installed/g) || []).length).toBe(2);
    });

    it('and otherwise says the password is the old one, with a way forward', () => {
        const s = T();
        expect(s).toMatch(/كلمة المرور هي \*\*القديمة\*\*/);
        expect(s).toMatch(/احذف data\.db/);
        expect(s).toMatch(/the password is the OLD one/);
    });
});

describe('a server that booted is not a server that never started', () => {
    it('tracks the boot separately from the proof', () => {
        const s = T();
        expect(s).toMatch(/let booted = false;/);
        expect(s).toMatch(/booted = up;/);
    });

    it('and says which of the two happened', () => {
        const s = T();
        expect(s).toMatch(/الخادم اشتغل فعلاً، لكن الإثبات الحيّ لم يكتمل/);
        expect(s).toMatch(/الخادم لم يثبت جاهزيته في المهلة/);
    });
});
