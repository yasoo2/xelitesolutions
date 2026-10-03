/**
 * vc5 BATCH-011 per-tool contract probe (Muse-authored, overlay-only).
 * Runs against vc4-tree bytes (= exact NVIDIA 02a37c9b + dirty snapshot;
 * the 3 definition files are byte-identical in both trees, so no overlay
 * drift can affect these imports). No network, no paid keys, all writes
 * confined to an OS-temp cage that is removed afterwards.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BulkFileGeneratorTool } from '../modules/tools/definitions/BulkFileGeneratorTool';
import { ImageGenerationTool } from '../modules/tools/definitions/ImageGenerationTool';
import { VisualQATool } from '../modules/tools/definitions/VisualQATool';

let cage = '';

beforeAll(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    cage = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-vc5-'));
    fs.mkdirSync(path.join(cage, 'inner'), { recursive: true });
});

afterAll(() => {
    try { fs.rmSync(cage, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('vc5 batch-011 contracts (overlay bytes, no network)', () => {
    it('generate_image without a key returns ok:true with a constructed (unverified) URL', async () => {
        const res: any = await (ImageGenerationTool as any).execute({ prompt: 'a red cube', size: '512x512' });
        expect(res.ok).toBe(true);
        expect(String(res.output?.url || '')).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//);
        expect(String(res.output?.url || '')).toContain('width=512');
    });

    it('bulk_file_generator writes ../ escapes OUTSIDE the given cwd (no containment)', async () => {
        const cwd = path.join(cage, 'inner');
        const res: any = await (BulkFileGeneratorTool as any).execute({
            cwd,
            files: [{ path: '../escape-canary.txt', content: 'CANARY' }],
        });
        expect(res.ok).toBe(true);
        // cage/escape-canary.txt is OUTSIDE cage/inner: containment absent.
        expect(fs.existsSync(path.join(cage, 'escape-canary.txt'))).toBe(true);
        expect(fs.existsSync(path.join(cwd, 'escape-canary.txt'))).toBe(false);
    });

    it('bulk_file_generator honours absolute paths outside the cwd as-is', async () => {
        const outside = path.join(cage, 'abs-target.txt');
        const res: any = await (BulkFileGeneratorTool as any).execute({
            cwd: path.join(cage, 'inner'),
            files: [{ path: outside, content: 'ABS' }],
        });
        expect(res.ok).toBe(true);
        expect(fs.readFileSync(outside, 'utf-8')).toBe('ABS');
    });

    it('bulk_file_generator positive control: relative write lands inside cwd', async () => {
        const cwd = path.join(cage, 'inner');
        const res: any = await (BulkFileGeneratorTool as any).execute({
            cwd,
            files: [{ path: 'ok-inside.txt', content: 'IN' }],
        });
        expect(res.ok).toBe(true);
        expect(fs.readFileSync(path.join(cwd, 'ok-inside.txt'), 'utf-8')).toBe('IN');
    });

    it('visual_qa with a nonexistent path fails closed without network', async () => {
        const res: any = await (VisualQATool as any).execute({ imagePath: path.join(cage, 'nope.png') });
        expect(res.ok).toBe(false);
        expect(String(res.error || '')).toContain('Image not found');
    });

    it('the three tools ignore ToolService context (no workspace parameter is read)', () => {
        for (const t of [BulkFileGeneratorTool, ImageGenerationTool, VisualQATool] as any[]) {
            expect(typeof t.execute).toBe('function');
            // execute(input) only: a second context arg is accepted by ToolService
            // but never consumed by these implementations.
            expect(t.execute.length).toBeLessThanOrEqual(1);
        }
    });
});
