//  A SECURITY PRIMITIVE IMPORTS NOTHING. It lives alone in this file, and
//  not beside the workspace service, for two reasons: a boundary check that
//  depends on a service can be broken by that service, and a check that is
//  costly to import gets re-typed inline at the call site — which is exactly
//  how one question came to have fourteen slightly-different answers.

/**
 * Is `child` the same directory as `parent`, or inside it?
 *
 * Exported so the rule can be tested directly on both platforms. Two things it
 * must get right, and each was wrong at some point:
 *
 *   - The comparison happens on a path BOUNDARY. Plain `startsWith` admits a
 *     sibling that merely shares a prefix — a parent of "/srv/joe" accepting
 *     "/srv/joe-backup/anything".
 *   - On Windows it ignores case, because the filesystem does. `path.resolve`
 *     preserves whatever case it was handed, so "C:\Users\home\..." and
 *     "c:\users\home\..." are one directory that a case-sensitive compare calls
 *     an escape — a false refusal of a legitimate write, and on Windows that is
 *     the common case rather than the edge one. Linux keeps the exact compare:
 *     there, two paths differing in case really are two different files.
 */
export function isWithinRoot(child: string, parent: string): boolean {
    // The static preview embeds this exact function in a standalone Node process.
    // Keep its dependencies local so production bundling cannot leave a closure.
    const path: typeof import('path') = require('path');
    /**
     *  …AND IT MUST RESOLVE, OR «..» WALKS STRAIGHT OUT.
     *
     *  Three functions in this repository are called isWithinRoot. Two
     *  resolve and do not fold; this one folded and did not resolve.
     *  Measured on the owner's own platform, win32:
     *
     *      drive letter lowered   utils=true   others=false
     *      whole path lowered     utils=true   others=false
     *      «…\xelitesolutions\..\secrets»    utils=TRUE   others=false
     *
     *  The first two are false REFUSALS of legitimate writes — the case
     *  this function's own comment was written to prevent. The third is
     *  a false ACCEPT: an unresolved string that begins with the parent
     *  and then climbs out of it is still, character for character,
     *  inside the parent. A path escapes by what it MEANS, not by how
     *  it is spelled.
     *
     *  Neither of the three was right. Resolving answers the escape and
     *  folding answers the refusal, and the two are independent.
     */
    const fold = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
    const c = fold(path.resolve(child));
    const p = fold(path.resolve(parent));
    return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

/**
 * Is `dir` a drive root, the home folder, or a folder above the home folder (review 9, H2)?
 *
 * Such a folder holds every project of every chat on the machine — and the home folder's own `.joe` (the browser's
 * profiles) made one look like a delivered project. A restore of one chat's data that took it for «this project»
 * stopped the servers of every other chat. It is never one project's folder.
 */
export function isHomeDriveOrAbove(dir: string, home: string = require('os').homedir()): boolean {
    const path: typeof import('path') = require('path');
    const d = path.resolve(String(dir || ''));
    if (!String(dir || '').trim() || path.dirname(d) === d) return true;
    return !!home && isWithinRoot(path.resolve(home), d);
}

/**
 * A folder as the file system knows it (review 11, F2): resolved, links and junctions followed, Windows 8.3 short
 * names and `subst` drives expanded (realpath's native call), case folded on Windows. A part that does not exist yet
 * keeps its resolved spelling below the nearest part that does.
 *
 * isWithinRoot compares spellings: one folder known by two of them — a junction, a symlink, «R11-AL~1», a `subst`
 * drive — is two folders to it. Where the question is «is this another chat's project», that is the wrong answer.
 */
export function realFolderOf(dir: string): string {
    const path: typeof import('path') = require('path');
    const fs: typeof import('fs') = require('fs');
    const fold = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
    const resolved = path.resolve(String(dir || ''));
    const below: string[] = [];
    let at = resolved;
    for (;;) {
        try {
            const real = fs.realpathSync.native(at);
            return fold(below.length ? path.join(real, ...below.slice().reverse()) : real);
        } catch { /* not there (yet): one folder up */ }
        const up = path.dirname(at);
        if (up === at) return fold(resolved);
        below.push(path.basename(at));
        at = up;
    }
}

/** isWithinRoot on the folders as the file system knows them (realFolderOf): a second spelling is the same folder. */
export function isWithinRealRoot(child: string, parent: string): boolean {
    return isWithinRoot(realFolderOf(child), realFolderOf(parent));
}

/**
 * realFolderOf for many folders in one call (review 12, M1): the same answer, at about one lstat per folder instead of
 * a realpath per folder and per missing part. A list or a restore compares the session's folders with the project of
 * every chat Joe knows — on a server, every session since boot — and realFolderOf for each of them, three times over,
 * held the whole process (every user on it) for seconds.
 *
 * Each answer is kept for the life of the resolver (one call: never across calls, so a link made later is seen), and
 * a folder is resolved from its parent's answer — what each part is, read by one lstat, or from one listing of a
 * folder asked about for a second child (many chats' projects sit side by side in one folder):
 *   - a part that is not there keeps its spelling below its parent's answer (realFolderOf's own rule);
 *   - a part that is a plain folder or file is its parent's answer joined with its name — the file system knows it
 *     by no other path;
 *   - a drive or share root, a link or junction (a volume mount point lists as a link but lstat may call it a plain
 *     folder — such a mount is then joined by its name, a known limit review 13 named), and on Windows a name that may be a second
 *     spelling of another — an 8.3 short name («~»), a trailing dot or space, a stream («:»), a letter whose case
 *     JavaScript and NTFS may fold differently — is asked of realpath itself (realFolderOf), and so is every part on
 *     macOS, whose file systems may fold case and Unicode their own way;
 *   - anything lstat cannot answer is asked of realFolderOf too: never a guess.
 */
export function realFolderResolver(): (dir: string) => string {
    const path: typeof import('path') = require('path');
    const fs: typeof import('fs') = require('fs');
    const win = process.platform === 'win32';
    const fold = (s: string) => (win ? s.toLowerCase() : s);
    const askRealpath = process.platform === 'darwin'
        ? () => true
        : (name: string) => win && (/[~:]|[. ]$/u.test(name) || Array.from(name).some(ch => ch > '\x7f' && ch.toLowerCase() !== ch.toUpperCase()));
    const memo = new Map<string, string>();
    //  A folder asked about for a second child is listed once (readdir), and its children are answered from the list:
    //  the projects of many chats sit side by side in one folder. On Windows any reparse point lists as a link.
    const asks = new Map<string, number>();
    //  Review 13: the list answers ONLY for a name spelled exactly as on disk that no other entry folds to. JavaScript's
    //  lower case is not the file system's: «Keys» spelled with the Kelvin sign (U+212A) lowers to ASCII «keys» and, kept
    //  by its folded name, took the place of the junction «keys» — the junction into another chat's project was then
    //  answered as a plain folder. A name not on the list exactly, or one sharing its folded name with another entry,
    //  is asked of lstat.
    const listed = new Map<string, { exact: Map<string, boolean>; folded: Map<string, number> } | null>();
    const kindIn = (up: string, name: string): 'link' | 'plain' | 'unknown' => {
        const n = (asks.get(up) || 0) + 1;
        asks.set(up, n);
        if (n < 2) return 'unknown';
        let list = listed.get(up);
        if (list === undefined) {
            list = null;
            try {
                const exact = new Map<string, boolean>();
                const folded = new Map<string, number>();
                for (const e of fs.readdirSync(up, { withFileTypes: true })) {
                    exact.set(e.name, e.isSymbolicLink());
                    const f = fold(e.name);
                    folded.set(f, (folded.get(f) || 0) + 1);
                }
                list = { exact, folded };
            } catch { list = null; }
            listed.set(up, list);
        }
        if (!list) return 'unknown';
        const link = list.exact.get(name);
        if (link === undefined || list.folded.get(fold(name)) !== 1) return 'unknown';
        return link ? 'link' : 'plain';
    };
    const resolve = (resolved: string): string => {
        const known = memo.get(resolved);
        if (known !== undefined) return known;
        const up = path.dirname(resolved);
        const name = path.basename(resolved);
        let out: string;
        if (up === resolved || !name || askRealpath(name) || (win && /^[\\/]{2}[?.][\\/]/u.test(resolved))) {
            out = realFolderOf(resolved);
        } else {
            let kind: 'link' | 'plain' | 'none' | 'unknown' = kindIn(up, name);
            if (kind === 'unknown') {
                try {
                    const st = fs.lstatSync(resolved, { throwIfNoEntry: false });
                    kind = !st ? 'none' : st.isSymbolicLink() ? 'link' : 'plain';
                } catch { kind = 'unknown'; }
            }
            out = kind === 'none' || kind === 'plain' ? path.join(resolve(up), fold(name)) : realFolderOf(resolved);
        }
        memo.set(resolved, out);
        return out;
    };
    return (dir: string) => resolve(path.resolve(String(dir || '')));
}
