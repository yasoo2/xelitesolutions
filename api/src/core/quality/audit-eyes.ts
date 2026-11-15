/**
 * THE SELF-QA IS WATCHED, NOT REPORTED.
 *
 * «عندما يتم تشغيل المتصفح للجودة فان المتصفح يقوم بعده تجارب بسيطة فقط ولا يوجد
 *  موشر وتحديد بالاحمر وتجريب جميع القوائم وتعبئه النماذج … لا اريد فقط حركات
 *  بسيطة»
 *
 * He was right on every count, and the pointer complaint had an exact cause:
 * the stream protocol has carried `cursor_move` and `highlight_boxes` for
 * months, the panel renders both — and the ONLY thing that ever emitted them
 * was `modules/browser/executor.ts`. The audit emitted neither. So a check
 * that really did press fourteen buttons looked, from the panel, like a page
 * sitting still.
 *
 * This module is the missing half. It does three things at once, on purpose:
 *
 *   1. moves the REAL mouse (page.mouse.move) — so a menu that opens on hover
 *      actually opens, which no synthetic click can do;
 *   2. paints a pointer and a red outline INSIDE the page, so they appear in
 *      the JPEG frames the panel is already receiving — the screenshot API
 *      never captures the OS cursor, and that is why nothing was visible;
 *   3. broadcasts `cursor_move` / `highlight_boxes` / `action_*` so the panel's
 *      own overlay and action list light up like they do for the agent.
 *
 * THE ONE RULE IT MUST NOT BREAK: the audit decides «this button is dead» by
 * hashing the DOM before and after a click. Anything this module draws would
 * corrupt that measurement — a moving pointer would make every dead button
 * look alive. So the whole overlay lives in a shadow root on a host attached
 * to <html>, never to <body>: `document.body.innerHTML`, `body.innerText` and
 * `querySelectorAll('body *')` — every input the fingerprint reads — cannot
 * see it at all.
 */

export interface EyeBox { x: number; y: number; width: number; height: number; label?: string }

/** The watched panel follows one current target; the report still keeps all findings. */
export function watchedHighlightBoxes(boxes: EyeBox[]): EyeBox[] {
    return (boxes || []).filter(box => box && box.width > 0 && box.height > 0).slice(0, 1);
}

/**
 * THE IN-PAGE PAINTER.
 *
 * It was written as a STRING, on the theory that a verbatim expression would
 * dodge esbuild's `__name` helper. Measured: Playwright's Node client treats a
 * string as an EXPRESSION and never invokes it, so the whole overlay evaluated
 * to a function object and painted nothing — silently, because the call was
 * `.catch(() => {})`. It is a real function now, and the shim is installed on
 * demand by `evalInPage` below.
 */
function paintEye(o: any) {
  var HOST = 'joe-audit-eye';
  var host: any = document.getElementById(HOST);
  if (!host) {
    host = document.createElement('div') as any;
    host.id = HOST;
    // <html>, NOT <body>: the behaviour fingerprint reads body only.
    document.documentElement.appendChild(host);
    host.attachShadow({ mode: 'open' });
    host.shadowRoot.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647}' +
      '.box{position:fixed;border:2px solid #ef4444;border-radius:8px;' +
        'box-shadow:0 0 0 3px rgba(239,68,68,.22),0 0 22px rgba(239,68,68,.45);' +
        'transition:all .18s ease}' +
      '.box.ok{border-color:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.22)}' +
      '.box.warn{border-color:#fbbf24;box-shadow:0 0 0 3px rgba(251,191,36,.22)}' +
      '.tag{position:fixed;transform:translateY(-100%);background:#ef4444;color:#fff;' +
        'font:600 11px/1.6 system-ui,-apple-system,sans-serif;padding:1px 7px;' +
        'border-radius:6px 6px 6px 0;white-space:nowrap;max-width:340px;overflow:hidden;' +
        'text-overflow:ellipsis;transition:all .18s ease}' +
      '.tag.ok{background:#059669}.tag.warn{background:#d97706}' +
      '.cur{position:fixed;width:22px;height:22px;margin:-3px 0 0 -3px;' +
        'transition:transform .26s cubic-bezier(.22,.61,.36,1);will-change:transform}' +
      '.cur svg{display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))}' +
      '.ring{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;' +
        'border:2px solid rgba(239,68,68,.9);opacity:0;transition:none}' +
      '.ring.hit{animation:joepulse .5s ease-out}' +
      '@keyframes joepulse{0%{opacity:1;transform:scale(.35)}100%{opacity:0;transform:scale(1.5)}}' +
      '.note{position:fixed;top:10px;left:50%;transform:translateX(-50%);' +
        'background:rgba(2,6,23,.92);color:#e2e8f0;border:1px solid rgba(148,163,184,.35);' +
        'border-radius:999px;padding:5px 14px;font:600 12px/1.6 system-ui,sans-serif;' +
        'white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis}' +
      '</style>' +
      '<div class="layer">' +
        '<div class="note" style="display:none"></div>' +
        '<div class="boxes"></div>' +
        '<div class="ring"></div>' +
        '<div class="cur" style="display:none">' +
          '<svg width="22" height="22" viewBox="0 0 22 22">' +
          '<path d="M3 2 L3 17 L7.2 13.2 L9.9 19 L12.6 17.7 L10 12.2 L15.6 12.1 Z" ' +
          'fill="#ef4444" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>' +
          '</svg></div>' +
      '</div>';
  }
  var root: any = host.shadowRoot;
  var tone = o.tone || 'bad';
  var cls = tone === 'good' ? ' ok' : tone === 'warn' ? ' warn' : '';

  var note: any = root.querySelector('.note');
  if (typeof o.note === 'string') {
    note.textContent = o.note;
    note.style.display = o.note ? '' : 'none';
  }

  var wrap: any = root.querySelector('.boxes');
  var boxes = o.boxes || [];
  wrap.innerHTML = '';
  for (var i = 0; i < boxes.length; i++) {
    var b = boxes[i];
    if (!(b.width > 0) || !(b.height > 0)) continue;
    var d = document.createElement('div');
    d.className = 'box' + cls;
    d.style.left = b.x + 'px'; d.style.top = b.y + 'px';
    d.style.width = b.width + 'px'; d.style.height = b.height + 'px';
    wrap.appendChild(d);
    if (b.label) {
      var t = document.createElement('div');
      t.className = 'tag' + cls;
      t.style.left = b.x + 'px';
      t.style.top = Math.max(14, b.y - 3) + 'px';
      t.textContent = b.label;
      wrap.appendChild(t);
    }
  }

  var cur: any = root.querySelector('.cur');
  if (o.cursor) {
    cur.style.display = '';
    cur.style.transform = 'translate(' + o.cursor.x + 'px,' + o.cursor.y + 'px)';
    if (o.press) {
      var ring: any = root.querySelector('.ring');
      ring.style.left = o.cursor.x + 'px'; ring.style.top = o.cursor.y + 'px';
      ring.classList.remove('hit'); void ring.offsetWidth; ring.classList.add('hit');
    }
  } else if (o.cursor === null) { cur.style.display = 'none'; }
  return true;
}

function wipeEye() {
  var h = document.getElementById('joe-audit-eye');
  if (h) h.remove();
  return true;
}

/** esbuild names every helper it compiles; a browser has no `__name`. */
const NAME_SHIM = 'globalThis.__name = globalThis.__name || (function (f) { return f; });';

/**
 * Evaluate in the page, and if the page has not got the `__name` shim yet,
 * install it and try once more.
 *
 * A plain `.catch(() => {})` here is how a self-check learns to lie: every
 * overlay call failed on a fresh document for months of this file's short life
 * and reported nothing. One retry, then the error is the caller's problem.
 */
export async function evalInPage(page: any, fn: any, arg?: any): Promise<any> {
    try { return arg === undefined ? await page.evaluate(fn) : await page.evaluate(fn, arg); }
    catch (e: any) {
        if (!/__name is not defined/.test(String(e?.message || e))) throw e;
        await page.evaluate(NAME_SHIM).catch(() => { });
        return arg === undefined ? await page.evaluate(fn) : await page.evaluate(fn, arg);
    }
}

export interface EyesOptions {
    /** The panel session to stream the pointer and the outlines to. */
    watchSessionId?: string;
    /** Draw inside the page even with no panel (a proof counts the overlay). */
    alwaysPaint?: boolean;
}

/**
 * A pair of eyes for one audit run. Every method is best-effort: a page that
 * navigated away mid-paint must never fail the check it was illustrating.
 */
export class AuditEyes {
    private readonly sid: string;
    private readonly paint: boolean;
    private readonly watched: boolean;
    private last = { x: 40, y: 40 };
    private step = 0;

    constructor(opts?: EyesOptions) {
        this.sid = String(opts?.watchSessionId || '').trim();
        this.watched = !!this.sid;
        // A watched run already has the panel overlay. Painting another cursor
        // into the JPEG creates two pointers and two outlines on screen.
        this.paint = !this.watched && !!opts?.alwaysPaint;
    }

    /** Is anything actually being shown? Used to skip the cost when nobody looks. */
    get visible(): boolean { return this.watched || this.paint; }

    private send(ev: any) {
        if (!this.sid) return;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('../../modules/browser/wsHub').broadcastBrowserEvent(this.sid, { ts: Date.now(), ...ev });
        } catch { /* the panel is a bonus, never a blocker */ }
    }

    private viewportStamp(page: any) {
        try {
            const viewport = page.viewportSize?.();
            return viewport?.width > 0 && viewport?.height > 0
                ? { viewportWidth: viewport.width, viewportHeight: viewport.height }
                : {};
        } catch { return {}; }
    }

    /** Name the step in the panel's action list, exactly like the agent does. */
    announce(kind: string, summary: string) {
        const id = `qa-${String(++this.step).padStart(2, '0')}`;
        this.send({ type: 'action_sent', actionId: id, actionType: kind, summary });
        this.send({ type: 'step_start', stepId: id, name: kind });
        return id;
    }

    done(actionId: string, kind: string) {
        this.send({ type: 'action_done', actionId, actionType: kind });
    }

    /** The headline strip on the page — what the audit is doing right now. */
    async say(page: any, note: string) {
        if (!this.paint) return;
        await evalInPage(page, paintEye, { note, boxes: [], cursor: this.last }).catch(() => { });
    }

    /**
     * Travel to a box, outline it, and (optionally) leave a real mouse there.
     *
     * `moveMouse` is what makes a hover menu open. It is off for elements we
     * are only illustrating (a contrast failure) and on for anything about to
     * be pressed.
     */
    async lookAt(page: any, box: EyeBox | null, opts?: { note?: string; tone?: 'bad' | 'warn' | 'good'; moveMouse?: boolean }) {
        if (!box) return;
        const viewport = this.viewportStamp(page);
        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        if (opts?.moveMouse !== false) {
            /**
             * A real journey, in a handful of hops: hover states on the way are
             * part of what is being tested.
             *
             * The hops exist so a HUMAN can follow the pointer. With nobody
             * watching there is nothing to follow, and paying 100ms per control
             * for an animation into the void is how a two-minute build becomes
             * a three-minute one — so an unwatched audit jumps straight there.
             * The mouse still really moves, so the hover still really happens.
             */
            const hops = this.visible ? 4 : 1;
            const from = this.last;
            for (let i = 1; i <= hops; i++) {
                const px = Math.round(from.x + (x - from.x) * (i / hops));
                const py = Math.round(from.y + (y - from.y) * (i / hops));
                await page.mouse.move(px, py).catch(() => { });
                this.send({ type: 'cursor_move', x: px, y: py, ...viewport });
                if (i < hops) await page.waitForTimeout(28).catch(() => { });
            }
        } else {
            this.send({ type: 'cursor_move', x, y, ...viewport });
        }
        this.last = { x, y };
        this.send({ type: 'highlight_boxes', boxes: [{ x: box.x, y: box.y, width: box.width, height: box.height, label: box.label || opts?.note }], ...viewport });
        if (this.paint) {
            await evalInPage(page, paintEye, {
                cursor: { x, y }, tone: opts?.tone || 'bad',
                boxes: [{ ...box, label: box.label || opts?.note }],
                note: opts?.note,
            }).catch(() => { });
            // Long enough to be a frame in a 6-8 fps stream, short enough that
            // forty controls do not add a minute to the build.
            await page.waitForTimeout(150).catch(() => { });
        } else if (this.watched) {
            // Let at least one streamed frame show the panel pointer at the
            // target without injecting a second pointer into the page.
            await page.waitForTimeout(90).catch(() => { });
        }
    }

    /** The click itself, so the panel shows a pulse where the press landed. */
    async press(page: any) {
        this.send({ type: 'action_feedback', event: 'click', x: this.last.x, y: this.last.y });
        // The click can synchronously replace or move the outlined element.
        // Drop the panel outline at press-time so coordinates from the previous
        // DOM state never linger over the loading/result state that follows.
        if (this.watched) this.send({ type: 'highlight_boxes', boxes: [] });
        if (!this.paint) return;
        await evalInPage(page, paintEye, { cursor: this.last, press: true }).catch(() => { });
    }

    /** Outline a whole set at once — «these six are the low-contrast ones». */
    async mark(page: any, boxes: EyeBox[], opts?: { note?: string; tone?: 'bad' | 'warn' | 'good'; holdMs?: number }) {
        const list = (boxes || []).filter(b => b && b.width > 0 && b.height > 0).slice(0, 40);
        this.send({ type: 'highlight_boxes', boxes: this.watched ? watchedHighlightBoxes(list) : list, ...this.viewportStamp(page) });
        if (!this.paint) return;
        await evalInPage(page, paintEye, { boxes: list, tone: opts?.tone || 'bad', note: opts?.note, cursor: this.last }).catch(() => { });
        await page.waitForTimeout(Math.max(0, opts?.holdMs ?? 900)).catch(() => { });
    }

    /** Take everything back off — the page must be handed over exactly as built. */
    async clear(page: any) {
        this.send({ type: 'highlight_boxes', boxes: [] });
        if (!this.paint) return;
        await evalInPage(page, wipeEye).catch(() => { });
    }
}

/**
 * ⛔ HE STILL WATCHES A WALK THAT RUNS IN A PRIVATE BROWSER (design v13.3 §8).
 *
 * On a change run the walk never borrows the panel's page — that page holds his own cookies and storage, and a
 * walk there is a walk on his saved data. It runs in a private browser instead, and this streams that private
 * page into the panel he already has open: a CDP screencast (`Page.startScreencast`, JPEG 55, at most
 * 1280×900), each frame acknowledged and sent as the `stream_frame` event the panel already paints
 * (`wsHub.ts › broadcastBrowserEvent`). A page the walk's page opens (a popup) is followed while it is open.
 *
 * One streamer per id: while this streams, the panel session's own capture loop is paused
 * (`manager.ts › pauseStreaming`), and a second walk that asks for an id already streamed to does not stream.
 * The panel-wide `panel-browser` id is never a target. Frames are sent only while someone watches the id. Every
 * step is best-effort: a frame that cannot be sent never fails the walk it shows.
 */
export interface PrivateStream {
    /** Whether this walk holds the id's stream (false: no id, the shared panel id, or another walk holds it). */
    readonly holding: boolean;
    /** Frames sent to a watching panel so far. */
    readonly frames: number;
    /** Stops the screencast and gives the id back to the panel's own loop. Idempotent. */
    stop(): Promise<void>;
}

/** The panel-wide id (`BrowserSmartTools.ts › PANEL_BROWSER_SID`): never a stream target (§8 «Ids»). */
const SHARED_PANEL_ID = 'panel-browser';

export interface PrivateStreamDeps {
    pause?: (sid: string) => () => void;
    isPaused?: (sid: string) => boolean;
    watchers?: (sid: string) => number;
    send?: (sid: string, ev: any) => void;
}

export async function streamPrivateWalk(context: any, page: any, streamTo: string | undefined, deps: PrivateStreamDeps = {}): Promise<PrivateStream> {
    const sid = String(streamTo || '').trim();
    const inert: PrivateStream = { holding: false, frames: 0, stop: async () => { /* nothing streamed */ } };
    if (!sid || sid === SHARED_PANEL_ID || !context || !page) return inert;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manager = (deps.pause && deps.isPaused) ? null : require('../../modules/browser/manager');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hub = (deps.watchers && deps.send) ? null : require('../../modules/browser/wsHub');
    const isPaused = deps.isPaused ?? ((id: string) => !!manager?.isStreamingPaused?.(id));
    const pause = deps.pause ?? ((id: string) => manager.pauseStreaming(id));
    const watchers = deps.watchers ?? ((id: string) => Number(hub.panelWatcherCount(id) || 0));
    const send = deps.send ?? ((id: string, ev: any) => hub.broadcastBrowserEvent(id, ev));
    //  One streamer per id: another walk is already streaming to this panel.
    try { if (isPaused(sid)) return inert; } catch { return inert; }
    let resume: () => void;
    try { resume = pause(sid); } catch { return inert; }

    const { imageSize } = require('../../shared/image-size') as typeof import('../../shared/image-size');
    let frames = 0;
    let stopped = false;
    const shown: any[] = [page];
    let current: { page: any; cdp: any } | null = null;
    let chain: Promise<void> = Promise.resolve();
    const onFrame = (cdp: any) => async (ev: any) => {
        try { await cdp.send('Page.screencastFrameAck', { sessionId: ev?.sessionId }); } catch { /* the page went */ }
        if (stopped || !current || current.cdp !== cdp) return;
        try {
            if (watchers(sid) <= 0) return;
            const data = String(ev?.data || '');
            if (!data) return;
            const size = imageSize(Buffer.from(data, 'base64'));
            const w = size?.width || Math.round(Number(ev?.metadata?.deviceWidth) || 0);
            const h = size?.height || Math.round(Number(ev?.metadata?.deviceHeight) || 0);
            if (!(w > 0) || !(h > 0)) return;
            send(sid, { type: 'stream_frame', ts: Date.now(), jpegBase64: data, w, h });
            frames++;
        } catch { /* a frame is a bonus, never a blocker */ }
    };
    const stopCurrent = async () => {
        const was = current;
        current = null;
        if (!was) return;
        try { await was.cdp.send('Page.stopScreencast'); } catch { /* already gone */ }
        try { await was.cdp.detach(); } catch { /* already gone */ }
    };
    const show = (target: any) => {
        chain = chain.then(async () => {
            if (stopped) return;
            if (current?.page === target) return;
            await stopCurrent();
            try { if (target.isClosed?.()) return; } catch { return; }
            try {
                const cdp = await context.newCDPSession(target);
                current = { page: target, cdp };
                cdp.on('Page.screencastFrame', onFrame(cdp));
                await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 1280, maxHeight: 900 });
            } catch { current = null; /* this page cannot be filmed; the walk goes on */ }
        }).catch(() => { /* never thrown to the walk */ });
        return chain;
    };
    //  A popup the walk opens is shown while it is open; when it closes the page before it is shown again.
    const onPage = (p: any) => {
        if (stopped) return;
        shown.push(p);
        try {
            p.once?.('close', () => {
                const i = shown.indexOf(p);
                if (i >= 0) shown.splice(i, 1);
                if (!stopped && current?.page === p && shown.length) void show(shown[shown.length - 1]);
            });
        } catch { /* a page with no events is shown until the next one */ }
        void show(p);
    };
    try { context.on?.('page', onPage); } catch { /* no popups followed */ }
    await show(page);
    return {
        holding: true,
        get frames() { return frames; },
        async stop() {
            if (stopped) return;
            stopped = true;
            try { context.off?.('page', onPage); } catch { /* the context is gone */ }
            await chain.catch(() => undefined);
            await stopCurrent();
            try { resume(); } catch { /* the panel's own loop resumes when it is next asked */ }
        },
    };
}

/** The bounding box of a control, in viewport pixels the panel can draw with. */
export async function boxOf(page: any, selector: string): Promise<EyeBox | null> {
    try {
        const el = await page.$(selector);
        if (!el) return null;
        const b = await el.boundingBox();
        if (!b || !(b.width > 0) || !(b.height > 0)) return null;
        return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    } catch { return null; }
}
