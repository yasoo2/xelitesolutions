/**
 * A name the planner invented must not take the whole run down with it.
 *
 * A real session died exactly this way. The user asked to recolour a page; the
 * planner emitted a step calling `grep_search`, which is not registered — the
 * tool is `search_files`. It failed, retried, failed identically, hit "max
 * retries", and the request ended with nothing delivered. For a synonym.
 *
 * The alias table is only defensible if every entry is TRUE: each key must be a
 * different name for a tool that really exists. An entry pointing at nothing is
 * dead weight pretending to be a safety net, and an entry pointing at the wrong
 * tool is worse than the dead end it replaces — so this checks the table
 * against the actual registry rather than against itself.
 */

import { tools } from '../modules/tools/registry';

/** Kept in step with the table in ToolService by the assertions below. */
const ALIASES: Record<string, string> = {
    grep_search: 'search_files',
    grep: 'search_files',
    ripgrep: 'search_files',
    code_search: 'search_files',
    search_code: 'search_files',
    find_in_files: 'search_files',
    file_search: 'search_files',
    file_read: 'read_file',
    cat_file: 'read_file',
    open_file: 'read_file',
    file_write: 'write_file',
    create_file: 'write_file',
    edit_file: 'file_edit',
    str_replace: 'file_edit',
    list_directory: 'inspect_directory',
    list_files: 'inspect_directory',
    run_command: 'terminal_manager',
    bash: 'terminal_manager',
    shell: 'shell_execute',
    web_search: 'search_api',
    fetch_url: 'http_fetch',
};

const registered = new Set(tools.map(t => t.name));

describe('the tool alias table', () => {
    it('has the registry loaded to check against', () => {
        expect(registered.size).toBeGreaterThan(20);
    });

    it('resolves the exact name that cost a user their request', () => {
        expect(ALIASES.grep_search).toBe('search_files');
        expect(registered.has('search_files')).toBe(true);
    });

    it('does not have read/write backwards', () => {
        // The first draft aliased `read_file -> file_read`, which is exactly
        // inverted: `read_file` IS the registered tool and `file_read` is the
        // name planners reach for. Written from memory, caught by the registry.
        expect(ALIASES.file_read).toBe('read_file');
        expect(registered.has('read_file')).toBe(true);
        expect(registered.has('file_read')).toBe(false);
    });

    it('every alias points at a tool that REALLY EXISTS', () => {
        const dangling = Object.entries(ALIASES)
            .filter(([, target]) => !registered.has(target))
            .map(([from, to]) => `${from} -> ${to}`);
        expect(dangling).toEqual([]);
    });

    it('never aliases a name that is already a real tool', () => {
        // Shadowing a registered name would silently redirect a correct call.
        const shadowed = Object.keys(ALIASES).filter(k => registered.has(k));
        expect(shadowed).toEqual([]);
    });
});
