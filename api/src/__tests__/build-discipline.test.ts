/**
 * THE LAW's second half: lessons Joe's own outages teach must flow into the
 * systems Joe builds for others. The adm-zip crash loop (launcher skipped
 * npm install because node_modules existed; restart loop retried a
 * deterministic crash 23 times; updater hard-reset over a DNS failure) is
 * now codified as BUILD_DISCIPLINE and rides with every engineering run.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { assessAutoUpdateSafety, isProtectedPersonalRoot, parseAheadCount } from '../core/deploy/deployment-safety';

const src = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');

describe('BUILD_DISCIPLINE — the outage lessons, exported and injected', () => {
    test('all three lessons are present', () => {
        expect(src).toContain('export const BUILD_DISCIPLINE');
        // 1. dependency freshness beats node_modules existence
        expect(src).toMatch(/never skip installing just because node_modules/);
        // 2. crash-loop guard with one self-heal attempt
        expect(src).toMatch(/stop after ~3 consecutive fast crashes/);
        expect(src).toMatch(/ONE automatic dependency reinstall/);
        // 3. network failure is not a history conflict
        expect(src).toMatch(/NEVER destructively reset over a connectivity error/);
    });

    test('it rides as an INSTRUCTION for engineering-looking runs — never inside the goal', () => {
        // This test used to require the opposite, and that is how the defect
        // survived: the block was pushed into the GOAL string, so the field log
        // shows Joe being asked to BUILD it — «build_page (Building: قم ببناء
        // صفحة … [ENGINEERING DISCIPLINE …])» — and the extra ~500 characters on
        // every request are what pushed one build past the provider's limit
        // («413 … Requested 31712, Limit 12000»). Instructions travel in the
        // context the tools already read; the goal stays the user's sentence.
        expect(src).toMatch(/if \(looksLikeEngineering\) instructionBlocks\.push\(BUILD_DISCIPLINE\)/);
        expect(src).not.toMatch(/blocks\.push\(BUILD_DISCIPLINE\)/);
        expect(src).toMatch(/systemInstructions: runInstructions/);
        // The gate recognizes Arabic build requests too — the user builds in Arabic.
        expect(src).toMatch(/سكربت|تشغيل/);
    });

    test('a plain question is not taxed with it (gated, not unconditional)', () => {
        expect(src).toMatch(/const looksLikeEngineering = \//);
        expect(src).not.toMatch(/blocks\.push\(BUILD_DISCIPLINE\);\s*\/\/ always/);
    });
});

describe('the launcher itself lives by the same discipline', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const startPs1 = fs.readFileSync(path.join(root, 'start-joe.ps1'), 'utf-8');
    const updatePs1 = fs.readFileSync(path.join(root, 'update-joe.ps1'), 'utf-8');

    test('start-joe.ps1 stamps package.json and re-installs on change', () => {
        expect(startPs1).toContain('function Sync-Dependencies');
        expect(startPs1).toContain('Get-FileHash -Path $pkg -Algorithm SHA256');
        expect(startPs1).toContain('.dep-stamp');
        // BOTH api and web go through the freshness check.
        expect(startPs1).toContain('Sync-Dependencies -dir $apiDir');
        expect(startPs1).toContain('Sync-Dependencies -dir $webDir');
        // The old bug must stay dead: no bare node_modules-existence skip.
        expect(startPs1).not.toContain('Dependencies already installed');
    });

    test('start-joe.ps1 guards the restart loop and self-heals once', () => {
        expect(startPs1).toContain('if ($fastCrashes -ge 3)');
        expect(startPs1).toContain('if ($fastCrashes -eq 1)');
        expect(startPs1).toMatch(/aliveSeconds -lt 15/);
    });

    test('update-joe.ps1 never hard-resets over a network failure', () => {
        expect(updatePs1).toContain('$isNetworkFailure');
        expect(updatePs1).toMatch(/Could not resolve host\|unable to access/);
        // reset --hard only lives in the elseif (real conflict) branch.
        const netBranch = updatePs1.slice(
            updatePs1.indexOf('if ($isNetworkFailure)'),
            updatePs1.indexOf('} elseif ($pullFailed)'));
        expect(netBranch).not.toContain('reset --hard');
    });

    test('the PowerShell behavioral suite exists for Windows verification', () => {
        expect(fs.existsSync(path.join(root, 'scripts', 'test-launcher.ps1'))).toBe(true);
    });
});

describe('A-DEPLOY-PATH-THAT-WIPES-THE-USER — automatic update safety', () => {
    const repoRoot = path.join(__dirname, '..', '..', '..');
    const pingDeploy = fs.readFileSync(path.join(repoRoot, 'api', 'src', 'api', 'routes', 'ping-deploy.ts'), 'utf-8');
    const deployManager = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'DeployManager.ts'), 'utf-8');

    test('destructive cleanup is absent from automatic update sources', () => {
        expect(pingDeploy).not.toMatch(/['"]clean['"]\s*,\s*['"]-fd['"]/u);
        expect(deployManager).not.toMatch(/['"]clean['"]\s*,\s*['"]-fd['"]/u);
        expect(deployManager).toContain('assessAutoUpdateSafety');
        expect(pingDeploy).toContain('assessAutoUpdateSafety');
    });

    test('a dirty or untracked repository is refused without touching its files', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-deploy-safety-'));
        const keep = path.join(tempRoot, 'keep-me.txt');
        fs.writeFileSync(keep, 'owner work', 'utf-8');
        try {
            const decision = assessAutoUpdateSafety({
                root: tempRoot,
                runtimeMode: 'production',
                worktreeStatus: '?? keep-me.txt',
                ahead: 0,
            });
            expect(decision.ok).toBe(false);
            if (decision.ok) {
                throw new Error('dirty or untracked worktree was incorrectly accepted');
            }
            expect(decision.reason).toMatch(/uncommitted or untracked/u);
            expect(fs.readFileSync(keep, 'utf-8')).toBe('owner work');
            expect(fs.existsSync(keep)).toBe(true);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('the personal owner checkout and unverifiable ancestry are refused', () => {
        expect(isProtectedPersonalRoot('/root/xelitesolutions')).toBe(true);
        expect(assessAutoUpdateSafety({
            root: '/root/xelitesolutions',
            runtimeMode: 'production',
            worktreeStatus: '',
            ahead: 0,
        }).ok).toBe(false);
        expect(assessAutoUpdateSafety({
            root: '/srv/joe',
            runtimeMode: 'production',
            worktreeStatus: '',
            ahead: -1,
        }).ok).toBe(false);
        expect(parseAheadCount('2 5')).toBe(2);
        expect(parseAheadCount('not-a-rev-list')).toBeNull();
    });
});
