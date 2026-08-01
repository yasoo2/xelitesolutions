/**
 * Parser for `git status --porcelain --branch` — ONE git command that answers
 * everything /git/status used to run FOUR for (rev-parse, status, branch
 * --show-current, rev-list --count). On the Windows laptop this endpoint backs,
 * each git spawn costs real seconds; the frontend polls the endpoint on a
 * timer, so every command removed here is removed dozens of times an hour.
 *
 * Pure text-in, data-out — the command runner stays in the route, the parsing
 * lives here where a test can feed it every header shape git actually emits.
 */

export interface GitStatusSnapshot {
    branch: string;
    ahead: number;
    behind: number;
    files: Array<{ status: string; file: string }>;
}

export function parseStatusPorcelainBranch(stdout: string): GitStatusSnapshot {
    let branch = '';
    let ahead = 0;
    let behind = 0;
    const files: Array<{ status: string; file: string }> = [];

    for (const line of String(stdout || '').split('\n')) {
        if (!line.trim()) continue;

        if (line.startsWith('##')) {
            // Header shapes git emits:
            //   ## main...origin/main [ahead 1, behind 2]
            //   ## main...origin/main
            //   ## main
            //   ## No commits yet on main
            //   ## HEAD (no branch)          (detached — `branch --show-current`
            //                                 returned '' here, so we do too)
            const header = line.slice(2).trim();
            const aheadM = header.match(/ahead (\d+)/);
            const behindM = header.match(/behind (\d+)/);
            ahead = aheadM ? parseInt(aheadM[1], 10) : 0;
            behind = behindM ? parseInt(behindM[1], 10) : 0;
            if (header.startsWith('HEAD')) {
                branch = '';
            } else {
                branch = header
                    .replace(/^No commits yet on /, '')
                    .split('...')[0]
                    .replace(/ \[.*$/, '')
                    .trim();
            }
            continue;
        }

        // Entry lines keep the exact v1 porcelain shape the old code parsed:
        // two status chars, a space, then the path ("R  old -> new" included).
        const status = line.substring(0, 2);
        const file = line.substring(3).trim();
        if (file) files.push({ status, file });
    }

    return { branch, ahead, behind, files };
}
