/**
 * THE TOOL CONTRACT, ENFORCED ACROSS THE WHOLE REGISTRY.
 *
 * A sweep of all 153 registered tools found 51 declaring `permissions = []` —
 * a copy-pasted placeholder that had spread through whole files. It reads like
 * a formality and is not one. ToolService computes:
 *
 *     needsWorkspace = perms.length > 0 || effects.length > 0
 *     needsUser      = perms.length > 0 || effects.length > 0
 *
 * so an empty permission list skips the workspace check AND the user check.
 * Every browser tool, the page builder and the form inbox were running
 * unattributed — harmless on a single-user machine with ENABLE_AUTH_BYPASS,
 * and a real hole the moment Joe serves anybody else. 29 more had
 * `rateLimitPerMinute = 0`, which the limiter reads as «no limit at all».
 *
 * These gates keep every one of those properties true for every tool that is
 * ever added, which is the only way a 153-tool registry stays honest.
 */
import { tools, contractDefaults } from '../modules/tools/registry';

const VALID = new Set(['read', 'write', 'deploy', 'delete', 'execute', 'internet']);
const all = tools as any[];

describe('every registered tool honours the contract', () => {
    it('has a name the planner can address, and no name twice', () => {
        const names = all.map(t => t.name);
        expect(names.filter(n => !/^[a-z][a-z0-9_]*$/.test(String(n)))).toEqual([]);
        expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    });

    it('has a description the planner can read', () => {
        expect(all.filter(t => !t.description || String(t.description).trim().length < 12).map(t => t.name)).toEqual([]);
    });

    it('has an object input schema, and `parameters` that agrees with it', () => {
        expect(all.filter(t => !t.inputSchema || t.inputSchema.type !== 'object').map(t => t.name)).toEqual([]);
        const mismatched = all.filter(t => {
            if (t.parameters === undefined) return false;
            try { return JSON.stringify(t.parameters) !== JSON.stringify(t.inputSchema); } catch { return true; }
        });
        expect(mismatched.map(t => t.name)).toEqual([]);
    });

    it('declares at least one VALID permission — an empty list disables the gate', () => {
        expect(all.filter(t => !Array.isArray(t.permissions) || t.permissions.length === 0).map(t => t.name)).toEqual([]);
        expect(all.filter(t => t.permissions.some((p: string) => !VALID.has(p)))
            .map(t => `${t.name}:${t.permissions.join('/')}`)).toEqual([]);
    });

    it('declares only valid side effects', () => {
        expect(all.filter(t => (t.sideEffects || []).some((p: string) => !VALID.has(p)))
            .map(t => `${t.name}:${(t.sideEffects || []).join('/')}`)).toEqual([]);
    });

    it('carries a positive rate limit — 0 means unlimited to the limiter', () => {
        expect(all.filter(t => !(typeof t.rateLimitPerMinute === 'number' && t.rateLimitPerMinute > 0))
            .map(t => `${t.name}:${t.rateLimitPerMinute}`)).toEqual([]);
    });

    it('and can actually be executed', () => {
        expect(all.filter(t => typeof t.execute !== 'function').map(t => t.name)).toEqual([]);
    });
});

describe('the tools that reach the internet say so', () => {
    // browser_ui_fix drives a browser over a LOCAL server against the session's
    // own project and never leaves the machine. Declaring internet for it would
    // be as wrong as omitting it from the ones that really do go out — a
    // permission that overstates is a permission nobody reads.
    const LOCAL_ONLY = new Set(['browser_ui_fix']);

    it('every browser tool that leaves the machine declares internet', () => {
        const browser = all.filter(t => /^browser_|^user_browser$|^google_account$/.test(t.name) && !LOCAL_ONLY.has(t.name));
        expect(browser.length).toBeGreaterThan(20);
        expect(browser.filter(t => !t.permissions.includes('internet')).map(t => t.name)).toEqual([]);
    });

    it('and the local-only one is not dressed up as an internet tool', () => {
        const local = all.find(t => t.name === 'browser_ui_fix');
        expect(local.permissions).not.toContain('internet');
        expect(local.permissions).toContain('write');
    });

    it('and the ones that write files declare write as well', () => {
        for (const name of ['browser_save_pdf', 'browser_fullpage_shot', 'browser_autofix']) {
            const t = all.find(x => x.name === name);
            expect(t && t.permissions.includes('write')).toBe(true);
        }
    });
});

describe('the registry repairs an under-declared tool instead of trusting it', () => {
    it('never lets an unknown permission through', () => {
        expect(contractDefaults.unknown).toEqual([]);
    });

    it('and the debt it had to cover is counted, not hidden', () => {
        // This number is allowed to shrink and must never grow silently: each
        // entry is a tool that should declare its own contract.
        expect(contractDefaults.permissions.length).toBeLessThanOrEqual(21);
        expect(contractDefaults.rateLimit.length).toBeLessThanOrEqual(2);
    });
});

describe('no plan may name a tool that does not exist', () => {
    it('the visual verification loop points at a real tool', () => {
        const fs = require('fs'); const path = require('path');
        const J = fs.readFileSync(path.join(__dirname, '..', 'core', 'agents', 'JoeAgent.ts'), 'utf-8');
        // `browser_subagent` was never in the registry: the task named it, the
        // plan carried it, and being optional it failed silently every run.
        expect(J).not.toMatch(/tool: 'browser_subagent'/);
        expect(J).toMatch(/name: 'Visual Verification Loop \(Joe Eye\)'[\s\S]{0,120}tool: 'browser_ui_fix'/);
        expect(all.some(t => t.name === 'browser_ui_fix')).toBe(true);
    });
});
