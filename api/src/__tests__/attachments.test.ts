/**
 * THE PAPERCLIP PIPELINE. Analyzed end to end on the user's request
 * («زر المرفقات قم بتحليله بشكل دقيق»), and the chain was broken in the
 * middle: /files/upload extracted and stored each file's text, the composer
 * sent fileIds with the message — and /runs/start never read them. Joe
 * answered every «لخص هذا الملف» without ever seeing the file.
 *
 * These tests lock the repaired chain link by link.
 */
import fs from 'fs';
import path from 'path';
import {
    formatAttachmentsBlock,
    ATTACHMENT_PER_FILE_CHARS,
    ATTACHMENT_TOTAL_CHARS,
} from '../shared/attachments';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('attachments — the block the model reads', () => {
    test('a text file arrives with its content, under a header that names it', () => {
        const block = formatAttachmentsBlock([
            { name: 'notes.md', mimeType: 'text/markdown', size: 2048, content: '# خطة المشروع\nالبند الأول', path: '/tmp/x' },
        ]);
        expect(block).toContain('[ATTACHED FILES — the user attached 1 file(s)');
        expect(block).toContain('(1) notes.md — text/markdown, 2 KB');
        expect(block).toContain('# خطة المشروع');
    });

    test('an image is DECLARED with its on-disk path, never silently dropped', () => {
        const block = formatAttachmentsBlock([
            { name: 'shot.png', mimeType: 'image/png', size: 5 * 1024 * 1024, content: '', path: '/uploads/shot.png' },
        ]);
        expect(block).toContain('shot.png — image/png, 5.0 MB');
        expect(block).toContain('binary image file');
        expect(block).toContain('/uploads/shot.png');
    });

    test('a huge file is truncated at the per-file cap and says so', () => {
        const big = 'م'.repeat(ATTACHMENT_PER_FILE_CHARS + 5_000);
        const block = formatAttachmentsBlock([
            { name: 'log.txt', mimeType: 'text/plain', size: big.length, content: big, path: '/tmp/l' },
        ]);
        expect(block.length).toBeLessThan(ATTACHMENT_PER_FILE_CHARS + 600);
        expect(block).toContain('…[truncated: the file continues for 5000 more characters]');
    });

    test('files together respect the TOTAL budget — the second file gets what remains', () => {
        const a = 'a'.repeat(ATTACHMENT_PER_FILE_CHARS);
        const b = 'b'.repeat(ATTACHMENT_PER_FILE_CHARS);
        const c = 'c'.repeat(ATTACHMENT_PER_FILE_CHARS);
        const block = formatAttachmentsBlock([
            { name: '1.txt', mimeType: 'text/plain', size: a.length, content: a, path: '' },
            { name: '2.txt', mimeType: 'text/plain', size: b.length, content: b, path: '' },
            { name: '3.txt', mimeType: 'text/plain', size: c.length, content: c, path: '' },
        ]);
        // First two fill the total budget; the third must arrive as a header +
        // truncation notice, not another 48k of text.
        expect(block.length).toBeLessThan(ATTACHMENT_TOTAL_CHARS + 1_000);
        expect(block).toContain('(3) 3.txt');
    });

    test('no attachments → empty string, so callers push unconditionally', () => {
        expect(formatAttachmentsBlock([])).toBe('');
        expect(formatAttachmentsBlock(undefined as any)).toBe('');
    });
});

describe('attachments — the chain is actually wired', () => {
    test('files.ts exports the loader (Mongo first, offline cache second)', () => {
        const src = read('api', 'routes', 'files.ts');
        expect(src).toContain('export async function loadUploadedFiles');
        expect(src).toMatch(/FileModel\.findById\(id\)/);
        expect(src).toMatch(/readFileFromCache\(id\)/);
    });

    test('/runs/start READS fileIds and loads them — the dropped-on-the-floor bug', () => {
        const src = read('api', 'routes', 'run.ts');
        expect(src).toMatch(/req\.body\?\.fileIds/);
        expect(src).toMatch(/await loadUploadedFiles\(fileIds\)/);
        expect(src).toMatch(/attachments,/);
    });

    test('the run rides the attachments right after the goal itself', () => {
        const src = read('modules', 'services', 'AgentLoopService.ts');
        expect(src).toContain("formatAttachmentsBlock(options.attachments || [])");
        // Attachment block is pushed before standing instructions.
        expect(src.indexOf('if (attachBlock) blocks.push(attachBlock)'))
            .toBeLessThan(src.indexOf('STANDING USER INSTRUCTIONS — always apply'));
    });

    test('the composer has ONE upload path — the button no longer lacks previews', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'CommandComposer.tsx'), 'utf-8');
        const handler = src.slice(src.indexOf('async function handleFileSelect'), src.indexOf('// Reusable upload function'));
        expect(handler).toContain('await uploadFiles(selected)');
        // The old duplicated XHR body is gone from the handler.
        expect(handler).not.toContain('xhr.open');
    });
});

/**
 * THE CHIP IS PART OF THE MESSAGE — the user's question «المرفق يظهر في
 * واجهة الدردشة بشكل صحيح؟» found three display leaks: the WS echo carried
 * text only, a reload rebuilt history without the chips, and an Arabic
 * filename arrived as latin1 mojibake («ÙØ­Ø¶Ø±.txt»). All three, locked.
 */
describe('attachments — visible in the chat, and after a reload, with real names', () => {
    const runSrc = read('api', 'routes', 'run.ts');
    const filesSrc = read('api', 'routes', 'files.ts');
    const sessSrc = read('api', 'controllers', 'sessionController.ts');
    const composerSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'CommandComposer.tsx'), 'utf-8');

    test('the server echo and the stored message both carry the chips (meta only)', () => {
        expect(runSrc).toContain('files: attachmentMeta()');
        expect(runSrc).toMatch(/role: 'user', content: text, attachments: attachmentMeta\(\)/);
        // Meta never includes the extracted content — history stays light.
        expect(runSrc).toMatch(/attachmentMeta = \(\) => attachments\.map\(a => \(\{ id: a\.id, name: a\.name, mimeType: a\.mimeType, size: a\.size \}\)\)/);
    });

    test('a reload rebuilds the user bubble in the same {text, files} shape', () => {
        expect(sessSrc).toContain('Array.isArray(m.attachments)');
        expect(sessSrc).toMatch(/\{ text: sanitizeUserMessageForUi\(m\.content\), files \}/);
    });

    test('an attached image shows ITSELF in the bubble, not a generic icon', () => {
        expect(composerSrc).toMatch(/f\.preview \? \(\s*<img src=\{f\.preview\}/);
    });

    test('Arabic filenames are recovered from busboy\'s latin1 decode', () => {
        expect(filesSrc).toContain('function fixFilenameEncoding');
        expect(filesSrc).toContain('req.file.originalname = fixFilenameEncoding(req.file.originalname)');
        // …and the disk name goes through the same recovery.
        expect(filesSrc).toMatch(/uniqueSuffix \+ '-' \+ fixFilenameEncoding\(file\.originalname\)/);
        // The recovery itself, replayed: the exact mojibake the proof measured.
        const mojibake = Buffer.from('محضر.txt', 'utf8').toString('latin1');
        expect(Buffer.from(mojibake, 'latin1').toString('utf8')).toBe('محضر.txt');
    });
});

/**
 * THE VERBATIM LAYER — OCR. moondream describes the scene but cannot READ
 * Arabic screenshot text (field-measured: the user's settings screenshot
 * came back without one literal string). Local tesseract now reads the
 * exact words and the block carries them with honest labels.
 */
describe('OCR text inside the attachment block', () => {
    const { formatAttachmentsBlock: fab } = require('../shared/attachments');
    const img = (extra: any) => fab([{
        name: 'شاشة.png', mimeType: 'image/png', size: 50_000, path: '/up/شاشة.png', content: '', ...extra,
    }]);

    it('description + OCR: both layers, clearly labelled', () => {
        const b = img({ content: 'شاشة إعدادات داكنة', visionDescribed: true, ocrText: 'الإعدادات\nSettings\nحفظ' });
        expect(b).toContain('ANALYZED by a vision model');
        expect(b).toContain('OCR — the EXACT text read inside the image');
        expect(b).toContain('الإعدادات\nSettings\nحفظ');
        expect(b).toContain('and the OCR text');
    });

    it('OCR alone: the text is quotable, the visuals honestly unseen', () => {
        const b = img({ ocrText: 'XELITE SOLUTIONS\nابدأ الآن' });
        expect(b).toContain('no vision description was available');
        expect(b).toContain('XELITE SOLUTIONS\nابدأ الآن');
        expect(b).toContain('you have NOT seen the visuals');
        expect(b).not.toContain('you have NOT seen this file');
    });

    it('neither: the original fabrication-ban block is untouched', () => {
        const b = img({});
        expect(b).toContain('you have NOT seen this file');
        expect(b).toContain('image analysis is unavailable');
    });

    it('the vision pass wires OCR for every image, in parallel and merged', () => {
        const fs2 = require('fs'); const path2 = require('path');
        const src = fs2.readFileSync(path2.join(__dirname, '..', 'shared', 'vision.ts'), 'utf-8');
        expect(src).toContain("import { extractImageText } from './ocr'");
        expect(src).toContain('ocrJobs.set(att, extractImageText(att.path)');
        expect(src).toContain('att.ocrText = t');
        // Even with NO vision provider at all, the OCR layer still lands.
        expect(src).toMatch(/no vision provider configured[\s\S]{0,400}ocrJobs\.get\(att\)/);
    });

    it('the OCR module is bounded and honest', () => {
        const fs2 = require('fs'); const path2 = require('path');
        const src = fs2.readFileSync(path2.join(__dirname, '..', 'shared', 'ocr.ts'), 'utf-8');
        expect(src).toContain('OCR_MAX_IMAGE_BYTES');
        expect(src).toContain('OCR_TIMEOUT_MS');
        expect(src).toContain("JOE_OCR || '1'");
        expect(src).toContain("return ''");
    });
});
