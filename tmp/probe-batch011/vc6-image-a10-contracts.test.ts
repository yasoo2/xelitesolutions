/**
 * vc6 NVIDIA a10c71ab image-contract probe (Muse-authored, overlay-only).
 * Target: EXACT a10c71ab bytes for the exercised closure (ImageGenerationTool
 * f8e32134 + provider-continuity 430e5450 + tools/types d754e49b, byte-restored
 * from git blobs; overlay base is the a10 archive with CRLF normalization,
 * norm-verified identical; 28 dirty/untracked files are byte-exact copies).
 * Hermetic: no network (unroutable OPENAI_BASE_URL proves paid is never
 * attempted), no real keys, bulk writes confined to an OS-temp cage removed
 * afterwards.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BulkFileGeneratorTool } from '../modules/tools/definitions/BulkFileGeneratorTool';
import { ImageGenerationTool } from '../modules/tools/definitions/ImageGenerationTool';
import { VisualQATool } from '../modules/tools/definitions/VisualQATool';

const IMAGE_SRC = path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ImageGenerationTool.ts');
let cage = '';

const savedEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    AI_COST_POLICY: process.env.AI_COST_POLICY,
};

function restoreEnv() {
    for (const k of Object.keys(savedEnv) as (keyof typeof savedEnv)[]) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
    }
}

beforeAll(() => {
    cage = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-vc6-'));
    fs.mkdirSync(path.join(cage, 'inner'), { recursive: true });
});

afterEach(restoreEnv);

afterAll(() => {
    restoreEnv();
    try { fs.rmSync(cage, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('vc6 a10c71ab image contract (exact bytes, no network)', () => {
    it('free_only default without key returns Pollinations URL with free disclosure', async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_BASE_URL;
        delete process.env.AI_COST_POLICY;
        const res: any = await (ImageGenerationTool as any).execute({ prompt: 'a red cube', size: '512x512' });
        expect(res.ok).toBe(true);
        expect(String(res.output?.url || '')).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//);
        expect(String(res.output?.url || '')).toContain('width=512');
        expect(String((res.logs || []).join(' '))).toMatch(/Pollinations \(free\)/);
    });

    it('free_only WITH key present never attempts paid (unroutable base proves it)', async () => {
        process.env.OPENAI_API_KEY = 'sk-fake-vc6-not-a-key';
        process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/';
        process.env.AI_COST_POLICY = 'free_only';
        const res: any = await (ImageGenerationTool as any).execute({ prompt: 'a blue sphere' });
        // Any paid attempt against 127.0.0.1:9 would throw -> fail-closed error.
        // Pollinations-ok therefore proves the paid branch never ran.
        expect(res.ok).toBe(true);
        expect(String(res.output?.url || '')).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//);
    });

    it('allow_paid with key still returns free success (paid branch unreachable)', async () => {
        process.env.OPENAI_API_KEY = 'sk-fake-vc6-not-a-key';
        process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/';
        process.env.AI_COST_POLICY = 'allow_paid';
        const res: any = await (ImageGenerationTool as any).execute({ prompt: 'a green pyramid' });
        expect(res.ok).toBe(true);
        expect(String(res.output?.url || '')).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//);
    });

    it('fail-closed tail is unreachable: battery of prompts/sizes all ok:true', async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.AI_COST_POLICY;
        const cases = [
            { prompt: 'x' },
            { prompt: 'unicode اختبار 🎨 test' },
            { prompt: 'a'.repeat(2000) },
            { prompt: 'size probe', size: 'not-a-size' },
            { prompt: 'size probe', size: '0x0' },
            { prompt: 'size probe', size: '99999x99999' },
            { prompt: 'size probe', size: '' },
        ];
        for (const c of cases) {
            const res: any = await (ImageGenerationTool as any).execute(c);
            expect(res.ok).toBe(true);
        }
        // Static proof on exact bytes: the free-first block returns
        // unconditionally before the paid/fail-closed code.
        const text = fs.readFileSync(IMAGE_SRC, 'utf-8');
        const freeBlock = text.split('FREE-FIRST')[1].split('PAID PROVIDER')[0];
        expect(freeBlock).toMatch(/return \{ ok: true/);
        expect(freeBlock).not.toMatch(/await|if\s*\(/);
        const firstOkReturn = text.indexOf('return { ok: true, output: { url: pollinationsUrl }');
        expect(firstOkReturn).toBeGreaterThan(-1);
        expect(firstOkReturn).toBeLessThan(text.indexOf('// PAID PROVIDER'));
        expect(firstOkReturn).toBeLessThan(text.indexOf('// FAIL CLOSED'));
    });

    it('empty prompt fails closed with prompt-required (negative control)', async () => {
        const res: any = await (ImageGenerationTool as any).execute({ prompt: '   ' });
        expect(res.ok).toBe(false);
        expect(String(res.error || '')).toContain('prompt is required');
    });

    it('unverified-URL-ok persists: no verification call outside the dead paid branch', async () => {
        const text = fs.readFileSync(IMAGE_SRC, 'utf-8');
        const withoutPaid = text.split('// PAID PROVIDER')[0] + text.split('// FAIL CLOSED')[1];
        for (const token of ['fetch(', 'axios', 'https.get', 'https.request', 'http.get', 'http.request', 'got(', '.get(', '.post(']) {
            expect(withoutPaid).not.toContain(token);
        }
    });

    it('bulk_file_generator ../ escape still lands OUTSIDE cwd (HOLD pin)', async () => {
        const cwd = path.join(cage, 'inner');
        const res: any = await (BulkFileGeneratorTool as any).execute({
            cwd,
            files: [{ path: '../vc6-canary.txt', content: 'CANARY' }],
        });
        expect(res.ok).toBe(true);
        expect(fs.existsSync(path.join(cage, 'vc6-canary.txt'))).toBe(true);
        expect(fs.existsSync(path.join(cwd, 'vc6-canary.txt'))).toBe(false);
    });

    it('visual_qa with a nonexistent path still fails closed (CONDITIONAL pin)', async () => {
        const res: any = await (VisualQATool as any).execute({ imagePath: path.join(cage, 'nope.png') });
        expect(res.ok).toBe(false);
        expect(String(res.error || '')).toContain('Image not found');
    });
});
