import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { decode } from 'jpeg-js';
import { captureMaskedJpeg } from '../../modules/browser/masked-capture';

async function main() {
    const directory = path.resolve('data/tests', `mask-motion-${Date.now()}`);
    fs.mkdirSync(directory, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 400, height: 200 } });
        await page.setContent('<style>body{margin:0;background:white}#secret{position:absolute;left:20px;top:40px;width:100px;height:60px;background:black;color:white}</style><div id="secret">TEST ONLY</div>');
        const shadow = process.env.JOE_MASK_MOTION_SHADOW === '1';
        if (shadow) await page.evaluate(() => {
            const host = document.createElement('div');
            document.body.append(host);
            const root = host.attachShadow({ mode: 'open' });
            root.append(document.querySelector('style')!.cloneNode(true), document.querySelector('#secret')!);
        });
        const native = await page.context().newCDPSession(page);
        const cssom = process.env.JOE_MASK_MOTION_CSSOM === '1';
        const move = async (left: string) => {
            if (cssom) await page.evaluate(value => { (document.styleSheets[0].cssRules[1] as CSSStyleRule).style.left = value; }, left);
            else await page.locator('#secret').evaluate((el, args) => {
                const style = (el as HTMLElement).style;
                style.left = args.left;
                if (args.shadow) {
                    if (args.left === '220px') style.removeProperty('filter');
                    else style.setProperty('filter', 'opacity(0)', 'important');
                }
            }, { left, shadow });
        };
        // Move only while the browser captures, then restore before the second
        // geometry observation. Pixels come from a real Chromium screenshot.
        const session = {
            send: async (method: string, args: any) => {
                if (method !== 'Page.captureScreenshot') return (native.send as any)(method, args);
                await move('220px');
                try { return await (native.send as any)(method, args); }
                finally { await move('20px'); }
            },
            detach: () => native.detach(),
        };
        const capturePage = {
            context: () => ({ newCDPSession: async () => session }),
            evaluate: page.evaluate.bind(page),
            url: page.url.bind(page),
        } as unknown as Page;
        let blocked = false;
        let buffer: Buffer | undefined;
        try { buffer = await captureMaskedJpeg(capturePage, [page.locator('#secret')], 100, 5000); }
        catch (error) {
            if (!/browser_mask_/.test(String(error))) throw error;
            blocked = true;
        }
        let exposed = false;
        if (buffer) {
            fs.writeFileSync(path.join(directory, 'captured.jpg'), buffer);
            const frame = decode(buffer);
            const offset = (80 * frame.width + 270) * 4;
            // A black pixel inside the moved TEST ONLY field is exposed source
            // content, not the magenta mask or the surrounding white page.
            exposed = frame.data[offset] < 20 && frame.data[offset + 1] < 20 && frame.data[offset + 2] < 20;
        }
        const restored = await page.locator('#secret').evaluate(el =>
            !(el as HTMLElement).style.filter && !(el as HTMLElement).style.transition);
        const result = { cssom, shadow, blocked, exposed, restored, safe: (blocked || !exposed) && restored, directory };
        fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
        assert(result.safe, 'Masked field moved A-to-B-to-A and its captured pixels were exposed');
    } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
