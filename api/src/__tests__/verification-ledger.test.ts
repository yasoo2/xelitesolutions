import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    createVerificationLedger,
    compactVerificationLedger,
    summarizeVerificationLedger,
    compactVerificationBoundaries,
    fingerprintVerification,
    isVerificationTool,
    recordVerification,
    selectVerification,
    verificationResultFrom,
    verificationResultFromToolResult,
} from '../core/quality/verification-ledger';

describe('change-aware verification ledger', () => {
    const roots: string[] = [];

    it('invalidates query and fragment changes without persisting target secrets', () => {
        const root = project();
        const descriptor = { checkId: 'target-state', tool: 'browser_run', args: {}, scopeRoot: root,
            workspaceRoot: root, workspaceId: 'target-workspace', runtimeRevision: 'same-build',
            runtimeTarget: 'http://127.0.0.1:4173/app?token=fixture-private-value&view=one#first' };
        const first = selectVerification(createVerificationLedger(), descriptor);
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 10);
        expect(selectVerification(ledger, descriptor).selection.action).toBe('reuse');
        for (const runtimeTarget of [descriptor.runtimeTarget.replace('view=one', 'view=two'),
            descriptor.runtimeTarget.replace('#first', '#second')]) {
            expect(selectVerification(ledger, { ...descriptor, runtimeTarget }).selection.action).toBe('run');
        }
        expect(JSON.stringify(ledger)).not.toContain('fixture-private-value');
    });

    it('frames file boundaries so redistributed content cannot reuse stale proof', () => {
        const root = project();
        fs.writeFileSync(path.join(root, 'src/a'), 'Xsrc/b');
        fs.writeFileSync(path.join(root, 'src/b'), 'Y');
        const descriptor = { checkId: 'file-boundaries', tool: 'quality_run', scopeRoot: root,
            workspaceRoot: root, workspaceId: 'boundary-workspace', relevantPaths: ['src/a', 'src/b'] };
        const first = selectVerification(createVerificationLedger(), descriptor);
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 10);
        expect(selectVerification(ledger, descriptor).selection.action).toBe('reuse');
        fs.writeFileSync(path.join(root, 'src/a'), 'X');
        fs.writeFileSync(path.join(root, 'src/b'), 'src/bY');
        const changed = selectVerification(ledger, descriptor);
        expect(changed.selection.fingerprint).not.toBe(first.selection.fingerprint);
        expect(changed.selection.action).toBe('run');
    });

    it('invalidates inherited environment changes without retaining their names or values', () => {
        const root = project();
        const key = 'JOE_VERIFICATION_TEST_ENVIRONMENT';
        const original = process.env[key];
        const descriptor = { checkId: 'environment', tool: 'quality_run', scopeRoot: root,
            workspaceRoot: root, workspaceId: 'environment-workspace' };
        try {
            process.env[key] = 'fixture-environment-first-value';
            const first = selectVerification(createVerificationLedger(), descriptor);
            const ledger = recordVerification(first.ledger, first.selection, 'passed', 10);
            expect(selectVerification(ledger, descriptor).selection.action).toBe('reuse');
            process.env[key] = 'fixture-environment-second-value';
            const changed = selectVerification(ledger, descriptor);
            expect(changed.selection.action).toBe('run');
            expect(changed.selection.fingerprint).not.toBe(first.selection.fingerprint);
            expect(changed.selection.reason).toContain('environment');
            const persisted = JSON.stringify(changed);
            expect(persisted).not.toContain(key);
            expect(persisted).not.toContain('fixture-environment-');
            delete process.env[key];
            expect(selectVerification(ledger, descriptor).selection.action).toBe('run');
        } finally {
            if (original === undefined) delete process.env[key];
            else process.env[key] = original;
        }
    });

    const project = () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-verification-ledger-'));
        roots.push(root);
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const value = 1;\n');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'npm@11.6.2' }));
        fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
        return root;
    };

    afterEach(() => {
        jest.restoreAllMocks();
        for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    });

    it('retains failed-attempt cost and freezes savings at the reuse decision', () => {
        const root = project();
        const descriptor = { checkId: 'cost', tool: 'quality_run', scopeRoot: root,
            workspaceRoot: root, workspaceId: 'cost-workspace', relevantPaths: ['src'] };
        const failed = selectVerification(createVerificationLedger(), descriptor);
        let ledger = recordVerification(failed.ledger, failed.selection, 'failed', 100);
        const repair = selectVerification(ledger, descriptor);
        ledger = recordVerification(repair.ledger, repair.selection, 'passed', 40);
        ledger = selectVerification(ledger, descriptor).ledger;
        fs.writeFileSync(path.join(root, 'src/index.ts'), 'export const value = 2;\n');
        const changed = selectVerification(ledger, descriptor);
        ledger = recordVerification(changed.ledger, changed.selection, 'passed', 900);
        const restored = compactVerificationLedger(JSON.parse(JSON.stringify(ledger)));
        expect(summarizeVerificationLedger(restored)).toMatchObject({
            receipts: 1, executions: 3, executedDurationMs: 1040,
            estimatedSavedDurationMs: 40, accountingComplete: true,
        });
    });

    it('preserves cumulative accounting beyond receipt eviction', () => {
        const root = project();
        let ledger = createVerificationLedger();
        for (let index = 0; index < 110; index++) {
            const selected = selectVerification(ledger, { checkId: `check-${index}`,
                tool: 'quality_run', scopeRoot: root, workspaceRoot: root,
                workspaceId: 'cost-workspace', relevantPaths: ['src'] });
            ledger = recordVerification(selected.ledger, selected.selection, 'passed', 10);
        }
        expect(summarizeVerificationLedger(compactVerificationLedger(ledger))).toMatchObject({
            receipts: 96, executions: 110, executedDurationMs: 1100, accountingComplete: true,
        });
        const legacy = { version: 1, receipts: ledger.receipts, decisions: ledger.decisions };
        expect(summarizeVerificationLedger(legacy).accountingComplete).toBe(false);
        expect(summarizeVerificationLedger({ ...ledger, accounting: { executions: Infinity } }).accountingComplete).toBe(false);
    });

    it('keeps decision counts and savings on the same lifetime scope', () => {
        const root = project();
        const descriptor = { checkId: 'long-run', tool: 'quality_run', scopeRoot: root,
            workspaceRoot: root, workspaceId: 'cost-workspace', relevantPaths: ['src'] };
        const selected = selectVerification(createVerificationLedger(), descriptor);
        let ledger = recordVerification(selected.ledger, selected.selection, 'passed', 10);
        for (let index = 0; index < 200; index++) ledger = selectVerification(ledger, descriptor).ledger;
        ledger = compactVerificationLedger(JSON.parse(JSON.stringify(ledger)));
        expect(ledger.decisions).toHaveLength(192);
        expect(summarizeVerificationLedger(ledger)).toMatchObject({
            selected: 1, reused: 200, invalidated: 0, executions: 1,
            estimatedSavedDurationMs: 2000, accountingComplete: true,
        });
    });

    it('reuses one passing check only while every relevant input matches', () => {
        const root = project();
        const descriptor = {
            checkId: 'api:focused-types',
            tool: 'shell_execute',
            args: { command: 'npx tsc --noEmit', cwd: root, sessionId: 'volatile-a' },
            workspaceId: 'workspace-a',
            workspaceRoot: root,
            scopeRoot: root,
            relevantPaths: ['src'],
            mode: 'focused' as const,
        };
        const first = selectVerification(createVerificationLedger(), descriptor, 100);
        expect(first.selection.action).toBe('run');
        const recorded = recordVerification(first.ledger, first.selection, 'passed', 37, 137);

        const second = selectVerification(recorded, {
            ...descriptor,
            args: { ...descriptor.args, sessionId: 'volatile-b' },
        }, 200);
        expect(second.selection).toMatchObject({
            action: 'reuse',
            reason: expect.stringContaining('matches all relevant inputs'),
            receipt: { result: 'passed', durationMs: 37 },
        });
    });

    it('invalidates when relevant source or the dependency lock changes', () => {
        const root = project();
        const descriptor = {
            checkId: 'api:unit',
            tool: 'quality_run',
            args: { path: root, tasks: ['test'] },
            workspaceId: 'workspace-a',
            workspaceRoot: root,
            scopeRoot: root,
            relevantPaths: ['src'],
            mode: 'affected' as const,
        };
        const first = selectVerification(createVerificationLedger(), descriptor);
        let ledger = recordVerification(first.ledger, first.selection, 'passed', 10);

        fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const value = 2;\n');
        const sourceChanged = selectVerification(ledger, descriptor);
        expect(sourceChanged.selection.action).toBe('run');
        expect(sourceChanged.selection.reason).toContain('invalidated');
        ledger = recordVerification(sourceChanged.ledger, sourceChanged.selection, 'passed', 11);

        fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}\n');
        const lockChanged = selectVerification(ledger, descriptor);
        expect(lockChanged.selection.action).toBe('run');
        expect(lockChanged.selection.reason).toContain('invalidated');
    });

    it('does not invalidate one package for an unrelated package change', () => {
        const root = project();
        fs.mkdirSync(path.join(root, 'packages', 'api'), { recursive: true });
        fs.mkdirSync(path.join(root, 'packages', 'web'), { recursive: true });
        fs.writeFileSync(path.join(root, 'packages', 'api', 'contract.ts'), 'export const api = 1;\n');
        fs.writeFileSync(path.join(root, 'packages', 'web', 'view.ts'), 'export const web = 1;\n');
        const descriptor = {
            checkId: 'api:contract',
            tool: 'auto_tester',
            args: { projectPath: root, testType: 'unit' },
            workspaceId: 'workspace-a',
            workspaceRoot: root,
            scopeRoot: root,
            relevantPaths: ['packages/api'],
        };
        const first = selectVerification(createVerificationLedger(), descriptor);
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 5);

        fs.writeFileSync(path.join(root, 'packages', 'web', 'view.ts'), 'export const web = 2;\n');
        expect(selectVerification(ledger, descriptor).selection.action).toBe('reuse');
    });

    it('resolves planner workspace-relative paths against a nested project without stale reuse', () => {
        const workspaceRoot = project();
        const projectRoot = path.join(workspaceRoot, 'MyApp');
        fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src', 'a.ts'), 'export const value = 1;\n');
        fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}');
        const descriptor = {
            checkId: 'nested:source', tool: 'quality_run', workspaceId: 'workspace-a',
            workspaceRoot, scopeRoot: projectRoot, relevantPaths: ['MyApp/src'], mode: 'affected' as const,
        };
        const first = selectVerification(createVerificationLedger(), descriptor);
        expect(first.selection.descriptor.relevantPaths).toContain('src');
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 5);
        fs.writeFileSync(path.join(projectRoot, 'src', 'a.ts'), 'export const value = 2;\n');
        expect(selectVerification(ledger, descriptor).selection.action).toBe('run');
    });

    it.each(['failed', 'cancelled', 'timed_out', 'incomplete'] as const)(
        'never reuses a %s result',
        (result) => {
            const root = project();
            const descriptor = {
                checkId: `api:${result}`,
                tool: 'quality_run',
                args: { path: root, tasks: ['test'] },
                workspaceId: 'workspace-a',
                workspaceRoot: root,
                scopeRoot: root,
            };
            const first = selectVerification(createVerificationLedger(), descriptor);
            const ledger = recordVerification(first.ledger, first.selection, result, 9);
            const next = selectVerification(ledger, descriptor);
            expect(next.selection.action).toBe('run');
            expect(next.selection.reason).toContain(`previous ${result}`);
        },
    );

    it('falls back to the whole project when an explicit scope escapes the root', () => {
        const root = project();
        const descriptor = {
            checkId: 'api:unsafe-scope',
            tool: 'quality_run',
            args: { path: root, tasks: ['test'] },
            workspaceId: 'workspace-a',
            workspaceRoot: root,
            scopeRoot: root,
            relevantPaths: ['../outside'],
        };
        const first = selectVerification(createVerificationLedger(), descriptor);
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 8);
        fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const value = 3;\n');
        expect(selectVerification(ledger, descriptor).selection.action).toBe('run');
    });

    it('never reads or reuses a scope outside the trusted workspace', () => {
        const workspaceRoot = project();
        const outsideRoot = project();
        const read = jest.spyOn(fs, 'readFileSync');
        const selection = fingerprintVerification({
            checkId: 'outside',
            tool: 'quality_run',
            workspaceId: 'workspace-a',
            workspaceRoot,
            scopeRoot: outsideRoot,
        });
        expect(selection.cacheable).toBe(false);
        expect(selection.reason).toContain('containment');
        expect(read).not.toHaveBeenCalled();
        read.mockRestore();
    });

    it.each(['scope', 'ancestor', 'directory'])('rejects a junction used as a %s without reading its target', kind => {
        const root = project();
        const outside = project();
        const linked = path.join(root, 'linked');
        fs.symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
        const read = jest.spyOn(fs, 'readFileSync');
        const descriptor = {
            checkId: 'link', tool: 'quality_run', workspaceRoot: root,
            scopeRoot: kind === 'scope' ? linked : root,
            relevantPaths: [kind === 'ancestor' ? 'linked/src/index.ts' : 'linked'],
        };
        const first = selectVerification(createVerificationLedger(), descriptor);
        expect(first.selection.cacheable).toBe(false);
        expect(read.mock.calls.some(([file]) => {
            const name = String(file);
            return name.startsWith(linked) || name.startsWith(outside);
        })).toBe(false);
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 5);
        expect(selectVerification(ledger, descriptor).selection.action).toBe('run');
    });

    it('does not read a linked package manifest for toolchain identity', () => {
        const root = project();
        const manifest = path.join(root, 'package.json');
        const originalStat = fs.lstatSync.bind(fs);
        jest.spyOn(fs, 'lstatSync').mockImplementation(((file: fs.PathLike, options?: any) => {
            const stat = originalStat(file, options);
            return String(file) === manifest ? { ...stat, isSymbolicLink: () => true } : stat;
        }) as any);
        const read = jest.spyOn(fs, 'readFileSync');
        const result = fingerprintVerification({
            checkId: 'manifest-link', tool: 'quality_run', workspaceRoot: root, scopeRoot: root,
        });
        expect(result.cacheable).toBe(false);
        expect(read.mock.calls.some(([file]) => String(file) === manifest)).toBe(false);
    });

    it('does not turn an unreadable source into reusable evidence', () => {
        const root = project();
        const originalRead = fs.readFileSync.bind(fs);
        jest.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, options?: any) => {
            if (String(file) === path.join(root, 'src', 'index.ts')) throw new Error('read denied');
            return originalRead(file, options);
        }) as any);
        const descriptor = { checkId: 'unreadable', tool: 'quality_run', workspaceRoot: root, scopeRoot: root };
        const first = selectVerification(createVerificationLedger(), descriptor);
        expect(first.selection.cacheable).toBe(false);
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 5);
        expect(selectVerification(ledger, descriptor).selection.action).toBe('run');
    });

    it('uses generic dependency boundaries and makes final checks cover the whole project', () => {
        const root = project();
        fs.mkdirSync(path.join(root, 'src', 'shared'), { recursive: true });
        fs.mkdirSync(path.join(root, 'src', 'capabilities', 'ip'), { recursive: true });
        fs.mkdirSync(path.join(root, 'src', 'capabilities', 'weather'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'shared', 'runtime.ts'), 'export const shared = 1;\n');
        fs.writeFileSync(path.join(root, 'src', 'capabilities', 'ip', 'index.ts'), 'export const ip = 1;\n');
        fs.writeFileSync(path.join(root, 'src', 'capabilities', 'weather', 'index.ts'), 'export const weather = 1;\n');
        const boundaries = {
            shared: { paths: ['src/shared'], dependsOn: [] },
            ip: { paths: ['src/capabilities/ip'], dependsOn: ['shared'] },
            weather: { paths: ['src/capabilities/weather'], dependsOn: ['shared'] },
        };
        const descriptor = {
            checkId: 'capability:ip',
            tool: 'browser_run',
            args: { url: 'http://127.0.0.1:4173' },
            workspaceId: 'workspace-a',
            workspaceRoot: root,
            scopeRoot: root,
            boundary: 'ip',
            boundaries,
            runtimeTarget: 'http://127.0.0.1:4173/app?secret=removed',
            runtimeRevision: 'preview-v1',
            mode: 'affected' as const,
        };
        const first = selectVerification(createVerificationLedger(), descriptor);
        let ledger = recordVerification(first.ledger, first.selection, 'passed', 20);

        fs.writeFileSync(path.join(root, 'src', 'capabilities', 'weather', 'index.ts'), 'export const weather = 2;\n');
        expect(selectVerification(ledger, descriptor).selection.action).toBe('reuse');

        fs.writeFileSync(path.join(root, 'src', 'shared', 'runtime.ts'), 'export const shared = 2;\n');
        const sharedChanged = selectVerification(ledger, descriptor);
        expect(sharedChanged.selection.action).toBe('run');
        ledger = recordVerification(sharedChanged.ledger, sharedChanged.selection, 'passed', 22);

        const newTarget = selectVerification(ledger, { ...descriptor, runtimeTarget: 'http://127.0.0.1:4180/app' });
        expect(newTarget.selection.action).toBe('run');

        const finalFirst = selectVerification(ledger, { ...descriptor, checkId: 'final:all', mode: 'final' });
        const finalLedger = recordVerification(finalFirst.ledger, finalFirst.selection, 'passed', 30);
        fs.writeFileSync(path.join(root, 'src', 'capabilities', 'weather', 'index.ts'), 'export const weather = 3;\n');
        expect(selectVerification(finalLedger, { ...descriptor, checkId: 'final:all', mode: 'final' }).selection.action).toBe('run');
    });

    it('includes deep dependency chains even when explicit paths are supplied', () => {
        const root = project();
        fs.mkdirSync(path.join(root, 'shared'));
        fs.writeFileSync(path.join(root, 'shared', 'value.ts'), 'export const value = 1;');
        const boundaries = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [
            `layer${i}`, { paths: [i === 11 ? 'shared' : 'src'], dependsOn: i === 11 ? [] : [`layer${i + 1}`] },
        ]));
        const descriptor = {
            checkId: 'deep', tool: 'quality_run', workspaceRoot: root, scopeRoot: root,
            boundary: 'layer0', boundaries, relevantPaths: ['src'],
        };
        const first = selectVerification(createVerificationLedger(), descriptor);
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 5);
        expect(selectVerification(ledger, descriptor).selection.action).toBe('reuse');
        fs.writeFileSync(path.join(root, 'shared', 'value.ts'), 'export const value = 2;');
        expect(selectVerification(ledger, descriptor).selection.action).toBe('run');
    });

    it.each(['missing', 'paths', 'dependencies', 'boundaries', 'long-path'])(
        'disables reuse for incomplete %s metadata, including after compaction', kind => {
            const root = project();
            const boundaries: Record<string, { paths: string[]; dependsOn: string[] }> = {
                app: { paths: ['src'], dependsOn: [] },
            };
            if (kind === 'missing') boundaries.app.dependsOn = ['unknown'];
            if (kind === 'paths') boundaries.app.paths = Array(65).fill('src');
            if (kind === 'dependencies') boundaries.app.dependsOn = Array(33).fill('app');
            if (kind === 'long-path') boundaries.app.paths = ['src', 'x'.repeat(1_001)];
            if (kind === 'boundaries') {
                for (let i = 0; i < 64; i++) boundaries[`extra${i}`] = { paths: ['src'], dependsOn: [] };
            }
            const descriptor = {
                checkId: 'incomplete', tool: 'quality_run', workspaceRoot: root, scopeRoot: root,
                boundary: 'app', boundaries: compactVerificationBoundaries(compactVerificationBoundaries(boundaries)),
            };
            const first = selectVerification(createVerificationLedger(), descriptor);
            expect(first.selection.cacheable).toBe(false);
            expect(first.selection.descriptor.relevantPaths).toContain('.');
            const ledger = recordVerification(first.ledger, first.selection, 'passed', 5);
            expect(selectVerification(ledger, descriptor).selection.action).toBe('run');
        },
    );

    it('requires an explicit browser-state revision before visual evidence can be reused', () => {
        const root = project();
        const descriptor = {
            checkId: 'browser:uat',
            tool: 'browser_run',
            args: { url: 'http://127.0.0.1:4173/app' },
            workspaceId: 'workspace-a',
            workspaceRoot: root,
            scopeRoot: root,
            runtimeTarget: 'http://127.0.0.1:4173/app',
            mode: 'affected' as const,
        };
        const first = selectVerification(createVerificationLedger(), descriptor);
        const ledger = recordVerification(first.ledger, first.selection, 'passed', 20);
        const withoutRevision = selectVerification(ledger, descriptor);
        expect(withoutRevision.selection.action).toBe('run');
        expect(withoutRevision.selection.reason).toContain('no trusted target revision');

        const revisionOne = selectVerification(createVerificationLedger(), { ...descriptor, runtimeRevision: 'state-1' });
        const revisionLedger = recordVerification(revisionOne.ledger, revisionOne.selection, 'passed', 20);
        expect(revisionLedger.receipts[0].runtimeRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(revisionLedger.receipts[0].runtimeRevision).not.toContain('state-1');
        expect(selectVerification(revisionLedger, { ...descriptor, runtimeRevision: 'state-1' }).selection.action).toBe('reuse');
        expect(selectVerification(revisionLedger, { ...descriptor, runtimeRevision: 'state-2' }).selection.action).toBe('run');
    });

    it('classifies verification tools and terminal outcomes conservatively', () => {
        expect(isVerificationTool('quality_run')).toBe(true);
        expect(isVerificationTool('shell_execute', { command: 'npm run test:unit' })).toBe(true);
        expect(isVerificationTool('shell_execute', { command: 'npm run guard:architecture' })).toBe(true);
        expect(isVerificationTool('custom_checker', {}, true)).toBe(false);
        expect(isVerificationTool('shell_execute', { command: 'npm install' })).toBe(false);
        expect(isVerificationTool('shell_execute', { command: 'npm install' }, true)).toBe(false);
        expect(isVerificationTool('write_file', {}, true)).toBe(false);
        expect(isVerificationTool('react_project', {}, true)).toBe(false);
        expect(verificationResultFrom(new Error('run_cancelled_by_owner'), false)).toBe('cancelled');
        expect(verificationResultFrom(new Error('idle timeout exceeded'), false)).toBe('timed_out');
        expect(verificationResultFrom(undefined, false)).toBe('incomplete');
        expect(verificationResultFromToolResult({ ok: true, output: { status: 'partial' } })).toBe('failed');
        expect(verificationResultFromToolResult({ ok: true, output: { status: 'cancelled' } })).toBe('cancelled');
        const root = project();
        expect(fingerprintVerification({
            checkId: 'check', tool: 'quality_run', scopeRoot: root, workspaceRoot: root,
        }).fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
});
