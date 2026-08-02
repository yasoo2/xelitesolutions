/**
 * Office documents → text, with what is already on the machine.
 *
 * The attachment analysis showed Word/Excel/PowerPoint files uploading fine
 * and arriving at the run as «(no extractable text content)» — the universal
 * text reader sees a zip's null bytes and rightly calls it binary. But the
 * user's real documents ARE these formats: contracts in .docx, budgets in
 * .xlsx. «اكمل تطوير التالية» — so Joe learns to read them.
 *
 * OOXML files are zip archives of XML. adm-zip is already a dependency (the
 * deploy chain uses it), so extraction costs no new install — which matters
 * on a machine that updates over a home connection. The XML is parsed with
 * deliberate, narrow patterns per format rather than a DOM: the documents
 * are machine-written by Office itself, and the three text carriers
 * (<w:t>, <t>/<v>, <a:t>) have been stable across every OOXML version.
 *
 * Legacy binary formats (.doc/.xls/.ppt from Office ≤2003) are NOT parsed —
 * they are OLE containers, not zips, and a wrong "best effort" would feed
 * the model garbage. They stay honestly declared as binary.
 */
import AdmZip from 'adm-zip';

export type OfficeKind = 'docx' | 'xlsx' | 'pptx';

/** Which Office format is this file — or null when it is not one. */
export function officeKind(name: string, mimeType?: string): OfficeKind | null {
    const n = String(name || '').toLowerCase();
    const m = String(mimeType || '').toLowerCase();
    if (n.endsWith('.docx') || m.includes('wordprocessingml.document')) return 'docx';
    if (n.endsWith('.xlsx') || m.includes('spreadsheetml.sheet')) return 'xlsx';
    if (n.endsWith('.pptx') || m.includes('presentationml.presentation')) return 'pptx';
    return null;
}

/** Total output bound — the upload route truncates for the DB anyway. */
const MAX_CHARS = 400_000;

function decodeXml(s: string): string {
    return s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function entryText(zip: AdmZip, name: string): string {
    const e = zip.getEntry(name);
    return e ? e.getData().toString('utf8') : '';
}

/** word/document.xml: <w:t> carries text, </w:p> is a paragraph break. */
function docxText(zip: AdmZip): string {
    const xml = entryText(zip, 'word/document.xml');
    if (!xml) return '';
    const out: string[] = [];
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<\/w:p>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
        if (m[1] !== undefined) out.push(decodeXml(m[1]));
        else if (m[0] === '</w:p>') out.push('\n');
        else if (m[0].startsWith('<w:tab')) out.push('\t');
        else out.push('\n');
        if (out.length > 200_000) break;
    }
    return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/** Shared strings + every worksheet, rows as tab-separated lines. */
function xlsxText(zip: AdmZip): string {
    // 1. The shared-string table most cell text points into.
    const shared: string[] = [];
    const ss = entryText(zip, 'xl/sharedStrings.xml');
    if (ss) {
        const si = /<si>([\s\S]*?)<\/si>/g;
        let m: RegExpExecArray | null;
        while ((m = si.exec(ss))) {
            const runs = [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(r => decodeXml(r[1]));
            shared.push(runs.join(''));
        }
    }
    // 2. Every sheet, in file order.
    const sheets = zip.getEntries()
        .map(e => e.entryName)
        .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const parts: string[] = [];
    for (const name of sheets) {
        const xml = entryText(zip, name);
        if (!xml) continue;
        const lines: string[] = [];
        for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
            const cells: string[] = [];
            for (const c of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
                const attrs = c[1];
                const body = c[2];
                const t = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
                if (t === 's') {
                    const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
                    cells.push(v !== undefined ? (shared[Number(v)] ?? '') : '');
                } else if (t === 'inlineStr') {
                    const runs = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(r => decodeXml(r[1]));
                    cells.push(runs.join(''));
                } else {
                    const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
                    cells.push(v !== undefined ? decodeXml(v) : '');
                }
            }
            const line = cells.join('\t').replace(/\s+$/g, '');
            if (line.trim()) lines.push(line);
        }
        if (lines.length) parts.push(`— ${name.replace('xl/worksheets/', '').replace('.xml', '')} —\n${lines.join('\n')}`);
        if (parts.join('').length > MAX_CHARS) break;
    }
    return parts.join('\n\n').trim();
}

/** Every slide's <a:t> runs, slide by slide. */
function pptxText(zip: AdmZip): string {
    const slides = zip.getEntries()
        .map(e => e.entryName)
        .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const parts: string[] = [];
    for (const name of slides) {
        const xml = entryText(zip, name);
        const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(r => decodeXml(r[1]));
        const text = runs.join(' ').replace(/\s+/g, ' ').trim();
        if (text) parts.push(`— Slide ${name.match(/\d+/)![0]} —\n${text}`);
        if (parts.join('').length > MAX_CHARS) break;
    }
    return parts.join('\n\n').trim();
}

/**
 * Extract the document's text. Returns '' when the file is not readable as
 * the claimed format — the caller then keeps the honest "binary, no text"
 * path instead of shipping garbage.
 */
export function extractOfficeText(filePath: string, kind: OfficeKind): string {
    try {
        const zip = new AdmZip(filePath);
        const text = kind === 'docx' ? docxText(zip) : kind === 'xlsx' ? xlsxText(zip) : pptxText(zip);
        return text.length > MAX_CHARS
            ? text.slice(0, MAX_CHARS) + '\n...[Content Truncated due to size]...'
            : text;
    } catch {
        return '';
    }
}
