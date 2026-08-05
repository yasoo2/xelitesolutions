/**
 * THE UPDATE MUST NOT EAT HIS FILES — AND HE MUST NOT HAVE TO REMEMBER THAT.
 *
 * «هذه ليش كل مرة لازم احطها على البورشال.. بدي طريقة ما احطها ولا مرة».
 *
 * The danger was real: one push swept ten private screenshots into the
 * repository, and the cleanup commit that took them out of the repo would take
 * them off his disk on the next `git pull`. The answer given at the time was a
 * six-line backup dance he had to paste by hand around every update. A safety
 * step a human has to remember is not a safety step.
 *
 * This runs the guard he actually runs — the same `scripts/joe-data-guard.js`,
 * with real `git`, against a real remote — and proves three things in order:
 *   1. the danger is genuine: a pull DOES delete a tracked upload
 *   2. the guard puts it back, byte for byte
 *   3. on a healthy repo (uploads untracked) the guard copies nothing at all,
 *      so it costs nothing to leave switched on forever
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const GUARD_SRC = path.join(__dirname, '..', '..', '..', 'scripts', 'joe-data-guard.js');

const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {
        cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'joe', GIT_AUTHOR_EMAIL: 'joe@local',
            GIT_COMMITTER_NAME: 'joe', GIT_COMMITTER_EMAIL: 'joe@local',
        },
    });

const guard = (repo: string, mode: 'snapshot' | 'restore') =>
    execFileSync(process.execPath, [path.join(repo, 'scripts', 'joe-data-guard.js'), mode],
        { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });

/** The vault lives outside the checkout; clean it so the box is left as found. */
function vaultOf(repoRoot: string) {
    const tag = Buffer.from(repoRoot).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(-16);
    return path.join(os.homedir(), '.joe-data-guard', tag || 'default');
}

describe('a Joe update never takes your uploads with it', () => {
    let box = '';
    let work = '';

    beforeAll(() => {
        box = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-guard-'));
        const origin = path.join(box, 'origin.git');
        const seed = path.join(box, 'seed');
        work = path.join(box, 'work');

        git(box, 'init', '--bare', '-b', 'main', origin);
        git(box, 'clone', origin, seed);

        // The repository as it was when the accident happened: his private
        // screenshots committed alongside the code.
        fs.mkdirSync(path.join(seed, 'uploads'), { recursive: true });
        fs.mkdirSync(path.join(seed, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(seed, 'uploads', 'screenshot-1.png'), 'PRIVATE-PIXELS-1');
        fs.writeFileSync(path.join(seed, 'uploads', 'screenshot-2.png'), 'PRIVATE-PIXELS-2');
        fs.writeFileSync(path.join(seed, 'README.md'), 'joe');
        fs.copyFileSync(GUARD_SRC, path.join(seed, 'scripts', 'joe-data-guard.js'));
        git(seed, 'add', '-A');
        git(seed, 'commit', '-m', 'the accident: uploads committed');
        git(seed, 'push', 'origin', 'main');

        // His machine, sitting on that commit.
        git(box, 'clone', origin, work);

        // The cleanup lands upstream: uploads leave the repository for good.
        git(seed, 'rm', '-r', '--cached', '-q', 'uploads');
        fs.writeFileSync(path.join(seed, '.gitignore'), 'uploads/\n');
        git(seed, 'add', '-A');
        git(seed, 'commit', '-m', 'chore: user uploads leave the repository');
        git(seed, 'push', 'origin', 'main');
    });

    afterAll(() => {
        try { fs.rmSync(vaultOf(work), { recursive: true, force: true }); } catch { /* best effort */ }
        try { fs.rmSync(box, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    it('the danger is real: without the guard, the pull deletes them', () => {
        const scratch = path.join(path.dirname(work), 'unguarded');
        git(path.dirname(work), 'clone', path.join(path.dirname(work), 'origin.git'), scratch);
        // clone lands on the cleanup commit already — check out the accident first
        git(scratch, 'checkout', '-q', 'HEAD~1');
        expect(fs.existsSync(path.join(scratch, 'uploads', 'screenshot-1.png'))).toBe(true);
        git(scratch, 'checkout', '-q', 'main');
        expect(fs.existsSync(path.join(scratch, 'uploads', 'screenshot-1.png'))).toBe(false);
    });

    it('the guard sees exactly the files git is holding — and no more', () => {
        const out = guard(work, 'snapshot');
        expect(out).toMatch(/حفظتُ 2 ملفاً/);
    });

    it('and the update leaves every one of them on disk', () => {
        // he types nothing here: the script does the pull between the two calls
        git(work, 'pull', 'origin', 'main');
        expect(fs.existsSync(path.join(work, 'uploads', 'screenshot-1.png'))).toBe(false);  // git took them

        guard(work, 'restore');

        expect(fs.readFileSync(path.join(work, 'uploads', 'screenshot-1.png'), 'utf-8')).toBe('PRIVATE-PIXELS-1');
        expect(fs.readFileSync(path.join(work, 'uploads', 'screenshot-2.png'), 'utf-8')).toBe('PRIVATE-PIXELS-2');
    });

    it('a file he deleted on purpose is not resurrected by a later update', () => {
        fs.unlinkSync(path.join(work, 'uploads', 'screenshot-2.png'));
        guard(work, 'snapshot');           // a fresh snapshot: uploads are untracked now
        guard(work, 'restore');
        expect(fs.existsSync(path.join(work, 'uploads', 'screenshot-2.png'))).toBe(false);
    });

    it('on a healthy repo it copies nothing, so it can stay on forever', () => {
        fs.writeFileSync(path.join(work, 'uploads', 'brand-new.png'), 'FRESH');
        const out = guard(work, 'snapshot');
        expect(out).toMatch(/لا شيء من ملفاتك تحت سيطرة git/);
        guard(work, 'restore');
        // untouched, because git never had a claim on it
        expect(fs.readFileSync(path.join(work, 'uploads', 'brand-new.png'), 'utf-8')).toBe('FRESH');
    });
});
