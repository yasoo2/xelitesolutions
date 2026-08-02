/**
 * LIVE WIRE PROOF — the open-upload contract + Office reading.
 *
 * The user's decision: «اي صيغه واي عدد ملفات واي حجم دون رفض شيء». So:
 *   1. formats the old filter refused (.html, .exe) now upload fine;
 *   2. a REAL .docx and a REAL .xlsx (built here as true OOXML zips) upload
 *      AND their Arabic text is extracted at upload time;
 *   3. all four ride ONE message into the run — count uncapped — and the
 *      goal-block carries the contract's words and the budget row;
 *   4. the safety that moved: GET /files/:id/raw for the uploaded HTML
 *      comes back as a plain-text DOWNLOAD (nosniff + attachment), so a
 *      malicious page can never script Joe's origin.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_open_uploads.ts
 */
import fs from 'fs';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.OFFLINE_MODE = 'true';

async function main() {
    const jwt = require('jsonwebtoken');
    const AdmZip = require('adm-zip');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const { formatAttachmentsBlock } = await import('../../shared/attachments');

    let captured: any = null;
    const realExecute = AgentLoopService.execute;
    (AgentLoopService as any).execute = async (goal: string, options: any) => {
        captured = { goal, options };
        return { ok: true };
    };

    const { createApp } = await import('../../api/app');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}/api`;
    const token = jwt.sign({ sub: 'proof-user', role: 'OWNER' }, 'x');
    const auth = { Authorization: `Bearer ${token}` };

    const CONTRACT = 'يلتزم الطرف الثاني بتسليم المشروع خلال ستين يوماً';
    const BUDGET_ROW = 'التسويق';

    // A REAL docx: a zip whose word/document.xml carries the contract line.
    const docx = new AdmZip();
    docx.addFile('word/document.xml', Buffer.from(
        `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>${CONTRACT}</w:t></w:r></w:p></w:body></w:document>`, 'utf8'));
    // A REAL xlsx: shared strings + one sheet with a budget row.
    const xlsx = new AdmZip();
    xlsx.addFile('xl/sharedStrings.xml', Buffer.from('<sst><si><t>التسويق</t></si></sst>', 'utf8'));
    xlsx.addFile('xl/worksheets/sheet1.xml', Buffer.from(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>30000</v></c></row></sheetData></worksheet>', 'utf8'));

    async function upload(name: string, bytes: Buffer | string, type: string) {
        const fd = new FormData();
        fd.append('file', new Blob([typeof bytes === 'string' ? Buffer.from(bytes) : bytes], { type }), name);
        fd.append('sessionId', 'proof-open');
        const res = await fetch(`${base}/files/upload`, { method: 'POST', headers: auth, body: fd as any });
        return { status: res.status, body: await res.json().catch(() => null) };
    }

    // ---- 1+2: upload everything, including the formerly refused ------------
    const fDocx = await upload('عقد-المشروع.docx', docx.toBuffer(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const fXlsx = await upload('budget.xlsx', xlsx.toBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const fHtml = await upload('page.html', '<script>alert("owned")</script><h1>hi</h1>', 'text/html');
    const fExe = await upload('tool.exe', Buffer.from([0x4d, 0x5a, 0, 1, 2, 3]), 'application/x-msdownload');

    // ---- 3: one message, four attachments -----------------------------------
    const runRes = await fetch(`${base}/runs/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
            text: 'لخص العقد وراجع الميزانية',
            sessionId: 'proof-open',
            fileIds: [fDocx.body?.id, fXlsx.body?.id, fHtml.body?.id, fExe.body?.id],
            language: 'ar',
        }),
    });
    for (let i = 0; i < 50 && !captured; i++) await new Promise(r => setTimeout(r, 100));

    // ---- 4: the moved safety — raw HTML is a download, not a page ----------
    const raw = await fetch(`${base}/files/${fHtml.body?.id}/raw`, { headers: auth });
    const rawType = String(raw.headers.get('content-type') || '');
    const rawDisp = String(raw.headers.get('content-disposition') || '');
    const rawSniff = String(raw.headers.get('x-content-type-options') || '');

    (AgentLoopService as any).execute = realExecute;
    server.close();

    const atts = captured?.options?.attachments || [];
    const block = formatAttachmentsBlock(atts);
    const checks: Array<[string, boolean]> = [
        [`.docx uploads AND its Arabic text is extracted at upload time`, fDocx.status === 200 && String(fDocx.body?.content || '').includes(CONTRACT)],
        [`.xlsx uploads AND its rows are extracted (التسويق → 30000)`, fXlsx.status === 200 && /التسويق\t30000/.test(String(fXlsx.body?.content || ''))],
        [`.html — refused before — now uploads (${fHtml.status})`, fHtml.status === 200 && !!fHtml.body?.id],
        [`.exe — refused before — now uploads (${fExe.status})`, fExe.status === 200 && !!fExe.body?.id],
        [`ONE message carried all ${atts.length}/4 attachments into the run`, runRes.status === 200 && atts.length === 4],
        ['the goal-block quotes the contract\'s own words from the docx', block.includes(CONTRACT)],
        ['…and the spreadsheet\'s budget row', block.includes(BUDGET_ROW)],
        [`raw HTML serves as a plain-text DOWNLOAD (${rawType}; ${rawDisp.split(';')[0]}; nosniff=${rawSniff})`,
            /text\/plain/i.test(rawType) && /attachment/i.test(rawDisp) && rawSniff === 'nosniff'],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: nothing is refused, Office documents arrive readable, and the danger moved out of the browser.'
        : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
