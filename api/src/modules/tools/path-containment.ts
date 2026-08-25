import path from 'path';

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
