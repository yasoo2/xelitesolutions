/**
 * Repair memory: Joe remembers the CURE, not just the disease. A cure is
 * recorded only when proven (the failed step completed after the repair),
 * recalled by a signature that survives changing paths/numbers, and injected
 * into the recovery planning prompt as a strong lead — never a script.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { errorSignature, RepairMemory } from '../core/memory/repair-memory';

describe('errorSignature — recurrences share a key, different diseases do not', () => {
    test('same error class across different paths and numbers → one signature', () => {
        const a = errorSignature("ENOENT: no such file or directory, open '/home/alice/project/config.json' at line 42");
        const b = errorSignature("ENOENT: no such file or directory, open '/srv/bob/other/settings.json' at line 7");
        expect(a).toBe(b);
    });

    test('windows paths mask too', () => {
        const a = errorSignature('Cannot find module C:\\Users\\home\\app\\dist\\index.js');
        const b = errorSignature('Cannot find module C:\\other\\place\\dist\\main.js');
        expect(a).toBe(b);
    });

    test("quoted module names stay — 'adm-zip' IS the diagnosis", () => {
        const a = errorSignature("Cannot find module 'adm-zip'");
        const b = errorSignature("Cannot find module 'left-pad'");
        expect(a).not.toBe(b);
        expect(a).toContain('adm-zip');
    });

    test('different error classes never collide', () => {
        expect(errorSignature('EACCES: permission denied, open /x/y'))
            .not.toBe(errorSignature('ENOENT: no such file, open /x/y'));
    });

    test('only the head of a huge stack matters, capped', () => {
        const sig = errorSignature('TypeError: x is not a function\n    at aaa\n'.repeat(500));
        expect(sig.length).toBeLessThanOrEqual(300);
    });
});

describe('RepairMemory — record proven cures, recall them, survive junk', () => {
    let dir: string;
    let mem: RepairMemory;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-mem-'));
        mem = new RepairMemory(dir);
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('a recorded cure is recalled for the same error class', async () => {
        await mem.recordRepair("File not found: /a/b/ledger.txt", 'write_file: create the missing ledger file');
        const hit = mem.recallRepair('File not found: /x/y/other.txt');
        expect(hit).not.toBeNull();
        expect(hit!.repair).toContain('create the missing ledger');
        expect(hit!.wins).toBe(1);
    });

    test('re-proving the same cure counts wins; the newest proven cure replaces the old', async () => {
        await mem.recordRepair('ETIMEDOUT connecting to registry', 'retry with backoff');
        await mem.recordRepair('ETIMEDOUT connecting to registry', 'switch registry mirror then retry');
        const hit = mem.recallRepair('ETIMEDOUT connecting to registry')!;
        expect(hit.wins).toBe(2);
        expect(hit.repair).toBe('switch registry mirror then retry');
    });

    test('an unknown disease returns null — no hallucinated medicine', async () => {
        await mem.recordRepair('disease A', 'cure A');
        expect(mem.recallRepair('completely different failure B')).toBeNull();
    });

    test('empty error or empty repair records nothing', async () => {
        await mem.recordRepair('', 'cure');
        await mem.recordRepair('error', '  ');
        expect(fs.existsSync(path.join(dir, 'repairs.json'))).toBe(false);
    });

    test('a corrupted store file heals to empty instead of crashing', async () => {
        fs.writeFileSync(path.join(dir, 'repairs.json'), '{not json!!!');
        expect(mem.recallRepair('anything')).toBeNull();
        await mem.recordRepair('err X', 'cure X');
        expect(mem.recallRepair('err X')!.repair).toBe('cure X');
    });

    test('the store is capped — old scars fade past 200 records', async () => {
        for (let i = 0; i < 205; i++) {
            await mem.recordRepair(`unique disease variant "${'q'.repeat(3)}${String.fromCharCode(65 + (i % 26))}${i}q"`, `cure ${i}`);
        }
        const stored = JSON.parse(fs.readFileSync(path.join(dir, 'repairs.json'), 'utf-8'));
        expect(stored.length).toBeLessThanOrEqual(200);
    });
});

describe('wiring — the orchestrator records on proven success and recalls before planning', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');

    test('a cure is recorded ONLY when a retried node completes', () => {
        const at = src.indexOf('repairMemory.recordRepair');
        expect(at).toBeGreaterThan(0);
        const before = src.slice(Math.max(0, at - 400), at);
        expect(before).toContain('(node.retryCount || 0) > 0');
        expect(before).toContain('node.lastError && node.repairNote');
    });

    test('recall feeds the recovery goal as a lead, not a script', () => {
        expect(src).toContain('repairMemory.recallRepair(errorText)');
        expect(src).toContain('A REPAIR THAT WORKED FOR THIS SAME ERROR BEFORE');
        expect(src).toMatch(/prefer it unless the context clearly differs/);
    });

    test('memory failures never block recovery itself', () => {
        const at = src.indexOf('repairMemory.recallRepair');
        const around = src.slice(Math.max(0, at - 300), at + 600);
        expect(around).toMatch(/try\s*\{/);
        expect(around).toMatch(/never a blocker/);
    });
});
