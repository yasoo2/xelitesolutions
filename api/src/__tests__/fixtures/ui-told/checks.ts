/**
 * THE SEPARATE CHECKS OF A TOLD LINE (design 2026-11-15 ui-inspection-revival-v3 §4, the lab's run3.js).
 *
 * A line the inspector writes is TRUE only when a check that does not share its
 * measurement agrees, on a FRESH load of the page:
 *   · colour — the words made transparent for one screenshot; the background
 *     read UNDER the words, the ink from what changed;
 *   · overflow — the page panned, the named items hit-tested;
 *   · reach — the visitor's check: pan, swipe every scroll box, hit-test;
 *   · tap targets — the element found again and measured.
 * Layout and DOM facts (a11y, header rows, small text, clipped text) are facts.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { PNG } from 'pngjs';

export const FIXTURE_ROOT = __dirname;
export const SETS = ['lab', 'review1', 'review2'];

export function fixtureNames(): Array<{ set: string; name: string; truth: string }> {
    const out: Array<{ set: string; name: string; truth: string }> = [];
    for (const set of SETS) {
        const root = path.join(FIXTURE_ROOT, set);
        for (const name of fs.readdirSync(root).sort()) {
            const t = path.join(root, name, 'truth.json');
            if (fs.existsSync(t)) out.push({ set, name, truth: String(JSON.parse(fs.readFileSync(t, 'utf8')).truth || '') });
        }
    }
    return out;
}

/** The fixtures' server: `/slow/` answers 1.5 s late (the lazy photo). */
export function serveFixtures(): Promise<http.Server> {
    return new Promise(resolve => {
        const s = http.createServer((req, rsp) => {
            let u = decodeURIComponent(String(req.url || '/').split('?')[0]); let delay = 0;
            if (u.includes('/slow/')) { delay = 1500; u = u.replace('/slow/', '/'); }
            const [, set, ...rest] = u.split('/');
            let f = SETS.includes(set) ? path.join(FIXTURE_ROOT, set, ...rest) : '';
            setTimeout(() => {
                try {
                    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
                    rsp.writeHead(200, {
                        'content-type': f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8',
                        'cache-control': 'no-store',
                    });
                    rsp.end(fs.readFileSync(f));
                } catch { rsp.writeHead(404); rsp.end(); }
            }, delay);
        });
        s.listen(0, '127.0.0.1', () => resolve(s));
    });
}

/** The element a line names, found again: its selector and which match it was, else its words. */
const FIND_EL = `
  var c = Array.prototype.slice.call(document.querySelectorAll(arg.sel || '*'));
  if (typeof arg.nth === 'number' && arg.nth >= 0 && c[arg.nth]) return c[arg.nth];
  var want = String(arg.text || '');
  var el = c.find(function (e) {
    var t = (e.textContent || e.value || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ');
    return t.slice(0, 30) === want.slice(0, 30) || (e.textContent || '').trim().indexOf(want.slice(0, 20)) === 0;
  }) || (c.length === 1 ? c[0] : null);
  return el;`;

type SetViewport = (page: any, w: number, h: number) => Promise<unknown>;
export interface Verdict { verdict: 'true' | 'FALSE' | 'partly' | 'unverifiable' | 'fact'; why: string }

const lum = (c: number[]) => {
    const a = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};
const ratio = (f: number[], b: number[]) => { const A = lum(f), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
const heightFor = (w: number) => (w >= 1000 ? 900 : w >= 600 ? 1180 : 844);

async function checkContrast(page: any, item: any, setVp: SetViewport): Promise<Verdict> {
    await setVp(page, item.w, heightFor(item.w)); await page.waitForTimeout(200);
    const pos = await page.evaluate(([arg, src]: [any, string]) => {
        const findEl = new Function('arg', src) as (a: any) => any;
        const el = findEl(arg); if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' as any });
        const tn = Array.prototype.find.call(el.childNodes, (n: any) => n.nodeType === 3 && (n.textContent || '').trim().length > 1) as any;
        if (!tn) return null;
        const rg = document.createRange(); rg.selectNodeContents(tn);
        const L = Array.prototype.slice.call(rg.getClientRects()).filter((x: any) => x.width >= 2).slice(0, 3).map((x: any) => [x.left, x.top, x.right, x.bottom]);
        (window as any).__joeChk = el; return L;
    }, [item, FIND_EL]);
    if (!pos || !pos.length) return { verdict: 'unverifiable', why: 'element not found again' };
    await page.waitForTimeout(150);
    await page.evaluate(() => Promise.all(Array.from(document.images).map(i => (i.complete ? 0 : i.decode().catch(() => 0)))));
    const shot = async () => PNG.sync.read(await page.screenshot({ type: 'png' }));
    const A = await shot();
    const was = await page.evaluate(() => {
        const el = (window as any).__joeChk; const w = el.getAttribute('style');
        el.style.setProperty('color', 'transparent', 'important'); el.style.setProperty('text-shadow', 'none', 'important'); el.style.setProperty('-webkit-text-stroke', '0', 'important');
        return w;
    });
    const B = await shot();
    await page.evaluate((w: string | null) => { const el = (window as any).__joeChk; if (w === null) el.removeAttribute('style'); else el.setAttribute('style', w); delete (window as any).__joeChk; }, was);
    const under: number[][] = [], ink: Array<[number[], number[]]> = [];
    for (const [l, t, r, b] of pos as number[][]) for (let y = Math.ceil(t); y < Math.floor(b); y++) for (let x = Math.ceil(l); x < Math.floor(r); x++) {
        if (x < 0 || y < 0 || x >= A.width || y >= A.height) continue;
        const o = (A.width * y + x) << 2;
        const pa = [A.data[o], A.data[o + 1], A.data[o + 2]], pb = [B.data[o], B.data[o + 1], B.data[o + 2]];
        under.push(pb);
        if (Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]) > 24) ink.push([pa, pb]);
    }
    if (!under.length || !ink.length) return { verdict: 'unverifiable', why: 'no painted words found' };
    under.sort((a, b) => lum(a) - lum(b)); const bg = under[Math.floor(under.length / 2)];
    //  the strongest painted ink against what lies under that very pixel (anti-aliasing only weakens it)
    let best = 1; for (const [pa, pb] of ink) best = Math.max(best, ratio(pa, pb));
    const fgRatio = ratio(item.fg, bg);
    const ok = best < item.need && fgRatio < item.need + 0.2;
    return { verdict: ok ? 'true' : 'FALSE', why: `under the words ${bg}, strongest ink ${best.toFixed(2)}:1, colour ${fgRatio.toFixed(2)}:1, need ${item.need}` };
}

async function checkOverflow(page: any, line: any, setVp: SetViewport): Promise<Verdict> {
    await setVp(page, line.w, heightFor(line.w)); await page.waitForTimeout(250);
    return page.evaluate(([items, src]: [any[], string]) => {
        const findEl = new Function('arg', src) as (a: any) => any;
        const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
        const go = (x: number, y: number) => scrollTo({ left: x, top: y, behavior: 'instant' as any });
        const x0 = scrollX; go(rtl ? -1e5 : 1e5, scrollY); const moved = Math.abs(scrollX - x0);
        let shown = 0;
        for (const it of items) {
            const el = findEl(it); if (!el) continue;
            const r0 = el.getBoundingClientRect(); go(scrollX, scrollY + r0.top - innerHeight / 2);
            const r = el.getBoundingClientRect();
            const h = document.elementFromPoint(Math.max(1, Math.min(innerWidth - 1, r.left + r.width / 2)), r.top + Math.min(r.height, 20) / 2);
            if (h && (h === el || el.contains(h))) shown++;
        }
        go(0, 0);
        return { verdict: moved > 2 && shown > 0 ? 'true' : 'FALSE', why: `page moved ${Math.round(moved)}px sideways; ${shown} of ${items.length} named items came on screen` };
    }, [line.items, FIND_EL]);
}

async function checkReach(page: any, line: any, setVp: SetViewport): Promise<Verdict> {
    await setVp(page, line.w, heightFor(line.w)); await page.waitForTimeout(250);
    return page.evaluate(([items, src]: [any[], string]) => {
        const findEl = new Function('arg', src) as (a: any) => any;
        const go = (x: number, y: number) => scrollTo({ left: x, top: y, behavior: 'instant' as any });
        let lost = 0;
        for (const it of items) {
            const el = findEl(it); if (!el) continue;
            const vw = innerWidth, vh = innerHeight;
            const h0 = getComputedStyle(document.documentElement).overflowX, b0 = getComputedStyle(document.body).overflowX;
            const pageScrolls = !/hidden|clip/.test(h0 !== 'visible' ? h0 : b0);
            let r = el.getBoundingClientRect(); go(scrollX, r.top + scrollY - vh / 2);
            for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
                const cs = getComputedStyle(n);
                if (/auto|scroll/.test(cs.overflowX)) { const ab = n.getBoundingClientRect(); r = el.getBoundingClientRect(); n.scrollTo({ left: n.scrollLeft + (r.left - ab.left) - (ab.width - r.width) / 2, behavior: 'instant' as any }); }
            }
            r = el.getBoundingClientRect(); if (pageScrolls) go(scrollX + r.left - (vw - r.width) / 2, scrollY);
            r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const hit = (cx >= 0 && cx <= vw && cy >= 0 && cy <= vh) ? document.elementFromPoint(cx, cy) : null;
            if (!(hit && (hit === el || el.contains(hit)))) lost++;
            go(0, 0);
        }
        return { verdict: lost === items.length ? 'true' : lost ? 'partly' : 'FALSE', why: `${lost} of ${items.length} not reachable by panning or swiping` };
    }, [line.items, FIND_EL]);
}

async function checkTap(page: any, line: any, setVp: SetViewport): Promise<Verdict> {
    await setVp(page, 390, 844); await page.waitForTimeout(200);
    return page.evaluate((items: any[]) => {
        let bad = 0; const why: string[] = [];
        for (const it of items) {
            const c = Array.prototype.slice.call(document.querySelectorAll(it.sel));
            if (!c.length) { bad++; why.push('gone ' + it.sel); continue; }
            const small = c.some((el: any) => {
                let b = el.getBoundingClientRect();
                if (el.tagName === 'INPUT' && /checkbox|radio/i.test(el.type) && (el.labels || [])[0]) b = el.labels[0].getBoundingClientRect();
                const s = getComputedStyle(el);
                return s.visibility !== 'hidden' && b.width > 0 && (Math.round(b.width) < 40 || Math.round(b.height) < 40);
            });
            if (!small) { bad++; why.push('not small ' + it.sel); }
        }
        return { verdict: bad ? 'FALSE' : 'true', why: why.slice(0, 3).join('; ') || `${items.length} found small` };
    }, line.items);
}

/** A finding as the line its check reads. */
export function lineOf(f: any): any {
    const widthOf = (s: string) => Number((/(?:at|At) (\d+)px/.exec(String(s || '')) || [])[1]) || 0;
    const ev: any[] = Array.isArray(f.evidence) ? f.evidence : [];
    if (f.code === 'low_contrast') return { code: f.code, en: f.en, items: ev.map(e => ({ text: e.text, sel: e.sel, w: e.vw, need: e.need, fg: e.fg })) };
    if (f.code === 'mobile_overflow' || f.code === 'content_unreachable') return { code: f.code, en: f.en, w: widthOf(f.en), items: ev.map(e => ({ sel: e.sel, nth: e.nth, text: e.text })) };
    if (f.code === 'mobile_tap_targets') return { code: f.code, en: f.en, items: ev.map(e => ({ sel: e.sel, nth: e.nth })) };
    return { code: f.code, en: f.en };
}

/** Every line checked on a fresh page of its own. */
export async function verifyFindings(findings: any[], openFresh: () => Promise<any>, setVp: SetViewport): Promise<Array<Verdict & { code: string; en: string }>> {
    const out: Array<Verdict & { code: string; en: string }> = [];
    for (const f of findings) {
        const line = lineOf(f);
        const page = await openFresh();
        let v: Verdict;
        try {
            if (line.code === 'low_contrast') {
                const vs: Verdict[] = [];
                for (const it of line.items) vs.push(await checkContrast(page, it, setVp));
                const bad = vs.filter(x => x.verdict === 'FALSE');
                v = { verdict: bad.length ? 'FALSE' : vs.every(x => x.verdict === 'true') ? 'true' : 'unverifiable', why: vs.map(x => x.why).slice(0, 3).join(' | ') };
            } else if (line.code === 'mobile_overflow') v = await checkOverflow(page, line, setVp);
            else if (line.code === 'content_unreachable') v = await checkReach(page, line, setVp);
            else if (line.code === 'mobile_tap_targets') v = await checkTap(page, line, setVp);
            else v = { verdict: 'fact', why: 'DOM/layout fact' };
        } catch (e: any) {
            v = { verdict: 'unverifiable', why: String(e?.stack || e).slice(0, 300) };
        } finally {
            //  a page the caller lends (a walk's own page, reloaded) is the caller's to keep
            if (!page.__joeKeep) await page.close().catch(() => { });
        }
        out.push({ code: line.code, en: line.en, ...v! });
    }
    return out;
}
