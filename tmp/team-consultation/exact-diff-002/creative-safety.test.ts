import fs from 'fs';
import path from 'path';
import { sourceImage } from '../core/design/images';
import { ImageGenerationTool } from '../modules/tools/definitions/ImageGenerationTool';
import { generatorEnabled, pictureFor } from '../core/design/row-image';

jest.mock('../core/design/images', () => ({ sourceImage: jest.fn(async () => null) }));
const paidGenerate = jest.fn(async (..._args: unknown[]) => ({ data: [{ url: 'https://example.invalid/paid.png' }] }));
jest.mock('openai', () => ({ __esModule: true, default: jest.fn(() => ({ images: { generate: (...args: unknown[]) => paidGenerate(...args) } })) }));

describe('creative safety: legacy definition and explicit remote rung', () => {
  const original = { ...process.env };
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    delete process.env.JOE_IMAGE_GEN;
    delete process.env.JOE_IMAGE_GEN_ON;
    process.env.OPENAI_API_KEY = 'synthetic-never-send';
    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network must not be used'));
    paidGenerate.mockClear();
    (sourceImage as jest.Mock).mockReset().mockResolvedValue(null);
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    process.env = { ...original };
  });

  it('fails closed on a legacy generation request even with a paid key', async () => {
    const result = await ImageGenerationTool.execute({ prompt: 'hero coffee image' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/creative_provider_not_configured/);
    expect(paidGenerate).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rejects empty prompts without a provider call', async () => {
    const result = await ImageGenerationTool.execute({ prompt: ' ' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('prompt is required');
    expect(paidGenerate).not.toHaveBeenCalled();
  });
  it.each([
    [undefined, undefined, false],
    [undefined, 'http://127.0.0.1:8188/image/{prompt}', false],
    ['1', undefined, false],
    ['1', ' ', false],
    ['0', 'http://127.0.0.1:8188/image/{prompt}', false],
    ['true', 'http://127.0.0.1:8188/image/{prompt}', false],
    ['1', 'http://127.0.0.1:8188/image/{prompt}', true],
  ])('remote opt-in switch=%s endpoint=%s enabled=%s', (flag, endpoint, expected) => {
    if (flag !== undefined) process.env.JOE_IMAGE_GEN_ON = flag;
    if (endpoint !== undefined) process.env.JOE_IMAGE_GEN = endpoint;
    expect(generatorEnabled()).toBe(expected);
  });
  it('falls back honestly to a local card without contacting a generator', async () => {
    const shrinker = { shrink: jest.fn(), close: jest.fn() };
    const result = await pictureFor('Coffee beans', { shrinker: shrinker as any });
    expect(result.from).toBe('card');
    expect(result.data).toMatch(/^data:image\/svg\+xml,/);
    expect(result.note).toMatch(/generator.*disabled|generator.*off/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(shrinker.shrink).not.toHaveBeenCalled();
  });
  it('preserves licensed-photo precedence even when a generator is enabled', async () => {
    process.env.JOE_IMAGE_GEN_ON = '1';
    process.env.JOE_IMAGE_GEN = 'http://127.0.0.1:8188/image/{prompt}';
    (sourceImage as jest.Mock).mockImplementation(async (dir: string) => {
      fs.writeFileSync(path.join(dir, 'coffee.jpg'), Buffer.alloc(1024));
      return { src: '/artifacts/images/coffee.jpg', credit: { creator: 'fixture', license: 'CC0', source: 'fixture' } };
    });
    const result = await pictureFor('Coffee', { shrinker: { shrink: jest.fn(async () => 'data:image/jpeg;base64,fixture'), close: jest.fn() } as any });
    expect(result.from).toBe('photo');
    expect(result.credit).toContain('CC0');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('reports card fallback when an explicitly configured generator fails', async () => {
    process.env.JOE_IMAGE_GEN_ON = '1';
    process.env.JOE_IMAGE_GEN = 'http://127.0.0.1:8188/image/{prompt}';
    fetchSpy.mockResolvedValue({ ok: false, status: 503 });
    const result = await pictureFor('Coffee', { shrinker: { shrink: jest.fn(), close: jest.fn() } as any });
    expect(result.from).toBe('card');
    expect(result.note).toContain('the generator did not answer');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('http://127.0.0.1:8188/image/Coffee');
  });
  it('does not search or generate in explicit offline mode', async () => {
    process.env.JOE_IMAGE_GEN_ON = '1';
    process.env.JOE_IMAGE_GEN = 'http://127.0.0.1:8188/image/{prompt}';
    const result = await pictureFor('Coffee', { offline: true });
    expect(result.from).toBe('card');
    expect(result.note).toBe('offline');
    expect(sourceImage).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('uses only the explicitly configured endpoint and records actual generated output', async () => {
    process.env.JOE_IMAGE_GEN_ON = '1';
    process.env.JOE_IMAGE_GEN = '  http://127.0.0.1:8188/image/{prompt}  ';
    fetchSpy.mockResolvedValue({ ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.alloc(1024) });
    const shrinker = { shrink: jest.fn(async () => 'data:image/png;base64,fixture'), close: jest.fn() };
    const result = await pictureFor('Coffee & cocoa', { shrinker: shrinker as any });
    expect(result.from).toBe('generated');
    expect(result.data).toBe('data:image/png;base64,fixture');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('http://127.0.0.1:8188/image/Coffee%20%26%20cocoa');
    expect(shrinker.shrink).toHaveBeenCalledWith(expect.any(Buffer), 'image/png');
  });
});
