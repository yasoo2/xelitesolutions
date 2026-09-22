import http from 'node:http';
import { chromium } from 'playwright';
import { probeForms, probeControls } from '../../core/quality/behaviour-audit';

// Isolated diagnostic fixture; this is not a Joe UI acceptance run.
async function main() {
    let saved = '';
    let cancelled = false;
    const started = Date.now();
    const onlyCase = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
    let failures = 0;
    const check = (name: string, ok: boolean, detail: unknown) => {
        console.log(JSON.stringify({ name, passed: ok, detail }));
        if (!ok) failures++;
    };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/read') {
            await new Promise(resolve => setTimeout(resolve, 900));
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ title: saved }));
        }
        if (url.pathname === '/save') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(Buffer.from(chunk));
            if (url.searchParams.get('mode') === 'cancel') { cancelled = true; return; }
            if (url.searchParams.get('mode') === 'never') return;
            await new Promise(resolve => setTimeout(resolve, 1100));
            if (url.searchParams.get('mode') === 'failed') {
                res.statusCode = 503;
                return res.end('unavailable');
            }
            saved = JSON.parse(Buffer.concat(chunks).toString()).title;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ title: saved }));
        }
        if (url.pathname === '/broken') {
            res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="broken.csv"', 'Content-Length': '1000' });
            res.write('short');
            return;
        }
        res.setHeader('Content-Type', 'text/html');
        if (url.pathname === '/budget') return res.end('<html><body>' + Array.from({length: 12}, (_, i) => `<button>Silent ${i}</button>`).join('') + '</body></html>');
        if (url.pathname === '/download') {
            return res.end(`<!doctype html><html lang="en"><body>
                <button id="export">Export CSV</button><button id="silent">Silent</button><button id="broken">Broken download</button>
                <script>document.querySelector('#broken').onclick=()=>{const a=document.createElement('a');a.href='/broken';a.download='broken.csv';a.click();};
                document.querySelector('#export').onclick=()=>setTimeout(()=>{
                const a=document.createElement('a');a.download='fixture.csv';
                a.href=URL.createObjectURL(new Blob(['title\\nfixture\\n'],{type:'text/csv'}));
                document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
                },900);</script></body></html>`);
        }
        const mode = url.searchParams.get('mode') || 'success';
        res.end(`<!doctype html><html lang="en"><body>
            <h1>Records</h1><form aria-label="Add record"><fieldset>
            <label>Title<input name="title" required></label><button type="submit">Save</button>
            </fieldset></form><div id="status" role="status"></div><ul id="rows"></ul>
            ${['two-forms', 'removed-form'].includes(mode) && !(mode === 'removed-form' && saved) ? '<form id="second"><label>Email<input type="email" required></label><button type="submit">Send request</button></form><div id="second-status"></div>' : ''}
            <script>
            const second=document.querySelector('#second');if(second)second.onsubmit=e=>{e.preventDefault();document.querySelector('#second-status').textContent='Request received';};
            const form=document.querySelector('form'), fieldset=document.querySelector('fieldset');
            const render=d=>{const rows=document.querySelector('#rows');rows.replaceChildren();if(d.title){const li=document.createElement('li');li.textContent=d.title;rows.append(li);}};
            fetch('/read').then(r=>r.json()).then(render);
            form.onsubmit=async e=>{e.preventDefault();if('${mode}'==='silent')return;fieldset.disabled=true;form.setAttribute('aria-busy','true');
            try{const r=await fetch('/save?mode=${mode}',{method:'POST',body:JSON.stringify({title:form.elements.title.value})});
            if(!r.ok)throw new Error('Save failed');render(await r.json());form.reset();
            document.querySelector('#status').textContent='Saved';
            }catch(e){document.querySelector('#status').textContent='Save failed';}
            finally{fieldset.disabled=false;form.removeAttribute('aria-busy');}};
            </script></body></html>`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
        browser = await chromium.launch({ headless: true });
        for (const mode of ['success', 'failed', 'never', 'cancel', 'reload-failed', 'silent', 'two-forms', 'removed-form']) {
            if (onlyCase && mode !== onlyCase) continue;
            saved = '';
            cancelled = false;
            const page = await browser.newPage();
            await page.goto(`${origin}/?mode=${mode}`, { waitUntil: 'networkidle' });
            // Inject a navigation rejection while leaving the old rendered row intact.
            if (mode === 'reload-failed') page.reload = async () => { throw new Error('fixture reload rejected'); };
            const probeStart = Date.now();
            const multiple = ['two-forms', 'removed-form'].includes(mode);
            const result = await probeForms(page, { maxForms: multiple ? 2 : 1, budgetMs: 12000, isEyeOpen: () => !cancelled });
            check(`${mode}: persistence verdict`, mode === 'success' || multiple
                ? result.metrics.formsPersisted === 1
                : result.metrics.formsPersisted === 0, result.metrics);
            if (mode === 'two-forms') check('second form is rediscovered after first form persistence reload',
                result.forms.length === 2 && result.forms.every(form => form.effect === 'submitted')
                && result.metrics.formsDeadSubmit === 0, result);
            if (mode === 'removed-form') check('a disappeared form is a coverage gap, not a dead handler',
                result.metrics.formsNotReached === 1 && result.metrics.formsDeadSubmit === 0
                && result.metrics.formsNotReachedEvidence[0].label === 'Send request', result.metrics);
            if (mode === 'never') check('busy-only is not submitted',
                !result.forms.some(form => form.effect === 'submitted'), result.forms);
            if (mode === 'silent') {
                const evidence = result.metrics.formsDeadSubmitEvidence;
                check('dead form retains its measured target without entered values',
                    result.metrics.formsDeadSubmit === 1 && evidence?.length === 1
                    && evidence[0].label === 'Save' && evidence[0].kind === 'submit'
                    && evidence[0].sel.includes('data-joe-sub') && evidence[0].filled === 1
                    && !JSON.stringify(evidence).includes('joe-qa-'), evidence);
            }
            if (mode === 'cancel') check('cancellation stops pending observation', result.metrics.eyeLost === true
                && Date.now() - probeStart < 3500 && !result.forms.some(form => form.effect === 'submitted'), result.metrics);
            if (mode === 'reload-failed') check('failed reload cannot certify stale DOM',
                !!saved && result.metrics.formsPersistenceUnproven === 1, result.metrics);
            await page.close();
        }
        if (!onlyCase) {
        const page = await browser.newPage({ acceptDownloads: true });
        await page.goto(`${origin}/download`);
        await page.reload();
        let downloads = 0;
        let failedDownloads = 0;
        page.on('download', async download => {
            if (download.suggestedFilename() === 'broken.csv') await download.cancel();
            if (await download.failure()) failedDownloads++; else downloads++;
        });
        const result = await probeControls(page, { maxControls: 3, fillForms: false, budgetMs: 12000 });
        check('CSV measured by actual download', downloads > 0
            && result.controls.some(control => control.label === 'Export CSV' && control.effect === 'download'),
            { downloads, controls: result.controls });
        check('silent control remains unresponsive', result.controls.some(control => control.label === 'Silent' && !control.worked), result.controls);
        check('failed download is not a delivered file', failedDownloads > 0
            && result.controls.some(control => control.label === 'Broken download' && !control.worked), { failedDownloads, controls: result.controls });
        await page.goto(`${origin}/budget`);
        const budgetStart = Date.now();
        const budget = await probeControls(page, { maxControls: 12, fillForms: false, budgetMs: 4000 });
        check('one shared control budget', Date.now() - budgetStart < 6500 && budget.controls.length < 12,
            { durationMs: Date.now() - budgetStart, controls: budget.controls.length });
        }
    } finally {
        await browser?.close();
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
    if (failures) process.exitCode = 1;
    console.log(JSON.stringify({ failures, durationMs: Date.now() - started }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
