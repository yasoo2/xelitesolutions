/**
 * OFFICE ATTACHMENTS + ACCEPT-EVERYTHING UPLOADS.
 *
 * The user's decision: «اريد ان يرفع اي صيغه واي عدد ملفات واي حجم دون رفض
 * شيء» — and then teach Joe to read the formats his real documents live in.
 * These tests build REAL docx/xlsx/pptx archives (OOXML is a zip of XML)
 * and assert the extractor reads them; then they pin the upload contract:
 * no filter, no size cap, no count cap, and active content served as a
 * download instead of rendered.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { officeKind, extractOfficeText } from '../shared/office-text';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-office-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function writeZip(name: string, entries: Record<string, string>): string {
    const zip = new AdmZip();
    for (const [n, c] of Object.entries(entries)) zip.addFile(n, Buffer.from(c, 'utf8'));
    const p = path.join(tmp, name);
    zip.writeZip(p);
    return p;
}

describe('office-text — Joe reads the user\'s real document formats', () => {
    test('kind detection: by extension and by Office mime, legacy binary formats excluded', () => {
        expect(officeKind('عقد.docx')).toBe('docx');
        expect(officeKind('budget.XLSX')).toBe('xlsx');
        expect(officeKind('deck.pptx')).toBe('pptx');
        expect(officeKind('x.bin', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
        expect(officeKind('old.doc')).toBeNull();   // OLE container, not a zip — honestly binary
        expect(officeKind('old.xls')).toBeNull();
        expect(officeKind('notes.txt')).toBeNull();
    });

    test('docx: paragraphs become lines, tabs survive, XML entities decode', () => {
        const p = writeZip('c.docx', {
            'word/document.xml':
                '<?xml version="1.0"?><w:document><w:body>'
                + '<w:p><w:r><w:t>العقد رقم &#1633;&#1634;</w:t></w:r></w:p>'
                + '<w:p><w:r><w:t>الطرف الأول</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>شركة &amp; شركاه</w:t></w:r></w:p>'
                + '</w:body></w:document>',
        });
        const text = extractOfficeText(p, 'docx');
        expect(text).toContain('العقد رقم ١٢');
        expect(text).toContain('الطرف الأول\tشركة & شركاه');
        expect(text.split('\n').length).toBeGreaterThanOrEqual(2);
    });

    test('xlsx: shared strings resolve, numbers survive, rows are tab-separated lines', () => {
        const p = writeZip('b.xlsx', {
            'xl/sharedStrings.xml':
                '<sst><si><t>البند</t></si><si><t>الميزانية</t></si><si><t>التسويق</t></si></sst>',
            'xl/worksheets/sheet1.xml':
                '<worksheet><sheetData>'
                + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
                + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>30000</v></c></row>'
                + '<row r="3"><c r="A3" t="inlineStr"><is><t>ملاحظة</t></is></c></row>'
                + '</sheetData></worksheet>',
        });
        const text = extractOfficeText(p, 'xlsx');
        expect(text).toContain('البند\tالميزانية');
        expect(text).toContain('التسويق\t30000');
        expect(text).toContain('ملاحظة');
    });

    test('pptx: every slide\'s text, in slide order', () => {
        const p = writeZip('d.pptx', {
            'ppt/slides/slide2.xml': '<p:sld><a:t>الخاتمة</a:t></p:sld>',
            'ppt/slides/slide1.xml': '<p:sld><a:t>رؤية</a:t><a:t>المشروع</a:t></p:sld>',
        });
        const text = extractOfficeText(p, 'pptx');
        expect(text.indexOf('رؤية المشروع')).toBeGreaterThanOrEqual(0);
        expect(text.indexOf('رؤية المشروع')).toBeLessThan(text.indexOf('الخاتمة'));
        expect(text).toContain('— Slide 1 —');
    });

    test('a corrupt or non-zip file returns "" — the honest binary path, never garbage', () => {
        const p = path.join(tmp, 'broken.docx');
        fs.writeFileSync(p, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]));
        expect(extractOfficeText(p, 'docx')).toBe('');
    });
});

describe('the upload contract the user chose', () => {
    const filesSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'routes', 'files.ts'), 'utf-8');

    test('no filter, no size limit: multer takes storage only', () => {
        expect(filesSrc).toContain('const upload = multer({ storage });');
        expect(filesSrc).not.toContain('dangerousExtensions');
        expect(filesSrc).not.toContain('fileFilter');
    });

    test('no attachment-count cap in loadUploadedFiles', () => {
        expect(filesSrc).not.toContain('.slice(0, 12)');
    });

    test('the safety moved to serving: active content downloads as plain text', () => {
        expect(filesSrc).toContain("res.setHeader('X-Content-Type-Options', 'nosniff')");
        expect(filesSrc).toMatch(/Content-Disposition[^\n]*attachment/);
    });

    test('office extraction is wired into the upload route itself', () => {
        expect(filesSrc).toContain('officeKind(req.file.originalname, req.file.mimetype)');
        expect(filesSrc).toContain('extractOfficeText(req.file.path, office)');
    });
});
