/**
 * JOE'S OWN WORKING FILES STAY OUT OF HIS REPOSITORY'S HISTORY.
 *
 * Since round 33 Joe changes a repository the owner brings in place. Every
 * run writes its state there: `.joe/` (the run's logs, its result, the whole
 * transcript of the conversation) and `.joe-versions/` (the snapshots the
 * undo restores). In a git checkout both stood in `git status` as untracked,
 * one `git add -A` away from a commit, and a transcript pushed to a public
 * repository is the owner's conversation published.
 *
 * Git has a place for exactly this: `.git/info/exclude`, the repository's own
 * ignore list that is never committed and never pushed. Joe's two folders are
 * written there, once, when a run starts in a folder that is a repository's
 * root; the project's own files, `.gitignore` included, are never touched.
 * A linked worktree (`.git` is a file naming its gitdir) reads the exclude
 * file of the common repository, so that is where the lines go.
 * JOE-DELIVERY.md is left visible: it is the delivery's certificate, written
 * for the owner to read and keep or remove.
 */
import { promises as fsp } from 'fs';
import path from 'path';

export const JOE_OWN_PATHS = ['/.joe/', '/.joe-versions/'];
const HEADER = "# Joe's own working files: the run's logs and transcript, and the undo snapshots (never part of the project)";

/** The folder whose info/exclude governs `dir`'s checkout, when `dir` is a repository's root. */
async function commonGitDir(dir: string): Promise<string | null> {
    const dotGit = path.join(dir, '.git');
    let stat;
    try { stat = await fsp.lstat(dotGit); } catch { return null; }
    if (stat.isDirectory()) return dotGit;
    if (!stat.isFile()) return null;
    const text = await fsp.readFile(dotGit, 'utf8').catch(() => '');
    const m = text.match(/^gitdir:\s*(.+?)\s*$/mu);
    if (!m) return null;
    const gitdir = path.resolve(dir, m[1]);
    const common = await fsp.readFile(path.join(gitdir, 'commondir'), 'utf8').catch(() => '');
    return common.trim() ? path.resolve(gitdir, common.trim()) : gitdir;
}

export type ExcludeOutcome = 'added' | 'present' | 'no-git' | 'failed';

/** Write Joe's own folders into the repository's local exclude list. Best effort: a run never fails on it. */
export async function keepJoeFilesOutOfGit(projectDir: string): Promise<ExcludeOutcome> {
    try {
        const common = await commonGitDir(projectDir);
        if (!common) return 'no-git';
        const file = path.join(common, 'info', 'exclude');
        const before = await fsp.readFile(file, 'utf8').catch(() => '');
        const have = new Set(before.split(/\r?\n/u).map(l => l.trim()));
        const missing = JOE_OWN_PATHS.filter(p => !have.has(p));
        if (!missing.length) return 'present';
        await fsp.mkdir(path.dirname(file), { recursive: true });
        const lead = before && !before.endsWith('\n') ? '\n' : '';
        await fsp.appendFile(file, `${lead}${have.has(HEADER) ? '' : `${HEADER}\n`}${missing.join('\n')}\n`, 'utf8');
        return 'added';
    } catch {
        return 'failed';
    }
}
