/**
 * A name the planner invented must not take the whole run down with it.
 *
 * A real session died exactly this way. The user asked to recolour a page; the
 * planner emitted a step calling `grep_search`, which is not registered — the
 * content-search tool is `search_text`. It failed, retried, failed identically, hit "max
 * retries", and the request ended with nothing delivered. For a synonym.
 *
 * The alias table is only defensible if every entry is TRUE: each key must be a
 * different name for a tool that really exists. An entry pointing at nothing is
 * dead weight pretending to be a safety net, and an entry pointing at the wrong
 * tool is worse than the dead end it replaces — so this checks the table
 * against the actual registry rather than against itself.
 */

import { tools } from '../modules/tools/registry';
import { TOOL_ALIASES } from '../modules/services/ToolService';

const registered = new Set(tools.map(t => t.name));

describe('the tool alias table', () => {
    it('has the registry loaded to check against', () => {
        expect(registered.size).toBeGreaterThan(20);
    });

    it('resolves the exact name that cost a user their request', () => {
        expect(TOOL_ALIASES.grep_search).toBe('search_text');
        expect(registered.has('search_text')).toBe(true);
        expect(registered.has('grep_search')).toBe(false);
    });

    it('keeps content search distinct from filename search', () => {
        for (const name of ['grep', 'ripgrep', 'code_search', 'search_code', 'find_in_files']) {
            expect(TOOL_ALIASES[name]).toBe('search_text');
        }
        for (const name of ['file_search', 'find_files', 'glob_search']) {
            expect(TOOL_ALIASES[name]).toBe('search_files');
        }
    });

    it('does not have read/write backwards', () => {
        // The first draft aliased `read_file -> file_read`, which is exactly
        // inverted: `read_file` IS the registered tool and `file_read` is the
        // name planners reach for. Written from memory, caught by the registry.
        expect(TOOL_ALIASES.file_read).toBe('read_file');
        expect(registered.has('read_file')).toBe(true);
        expect(registered.has('file_read')).toBe(false);
    });

    it('every alias points at a tool that REALLY EXISTS', () => {
        const dangling = Object.entries(TOOL_ALIASES)
            .filter(([, target]) => !registered.has(target))
            .map(([from, to]) => `${from} -> ${to}`);
        expect(dangling).toEqual([]);
    });

    it('never aliases a name that is already a real tool', () => {
        // Shadowing a registered name would silently redirect a correct call.
        const shadowed = Object.keys(TOOL_ALIASES).filter(k => registered.has(k));
        expect(shadowed).toEqual([]);
    });
});
