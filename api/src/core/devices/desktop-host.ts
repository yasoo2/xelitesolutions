/**
 * ONE PROCESS THAT ANSWERS EVERY DESKTOP ACTION.
 *
 * A PowerShell per action spent about 1.5 s starting and 2–3 s loading the
 * helper before it did anything (measured): six steps of the operate test took
 * 101 s. The host loads the helper once (JoeDesktop.Serve) and answers over a
 * private named pipe, one line in and one line out, so an action costs what
 * the action costs.
 *
 * The host is started by the caller's starter (Joe's ExecutionGateway, so the
 * firewall applies and the process ledger keeps it: a Joe that dies leaves no
 * host behind, kernel/process-ledger.ts), connected to with Node's own pipe
 * client, and ends by itself after ten idle minutes. When it cannot be
 * reached, the caller falls back to one PowerShell per action.
 */
import crypto from 'crypto';
import net from 'net';
import { desktopScript, ensureHelperSource, type DesktopAction } from './windows-desktop';

const b64 = (s: string) => Buffer.from(String(s ?? ''), 'utf8').toString('base64');
const int = (n: unknown) => String(Math.round(Number(n) || 0));

/** The pipe line for one action (fields by tab, strings as base64 of UTF-8). */
export function hostLine(a: DesktopAction): string {
    switch (a.op) {
        case 'windows': return 'windows';
        case 'look': return ['look', b64(a.file), int(a.left), int(a.top), int(a.width), int(a.height), int(a.maxWidth || 1280)].join('\t');
        case 'screenshot': return ['look', b64(a.file), '0', '0', '0', '0', '100000'].join('\t');
        case 'focus': return ['focus', int(a.handle)].join('\t');
        case 'click': return ['click', int(a.window || 0), int(a.x), int(a.y), b64(a.button || 'left'), int(Math.max(1, Math.min(3, a.count || 1)))].join('\t');
        case 'move': return ['move', int(a.x), int(a.y)].join('\t');
        case 'drag': return ['drag', int(a.x), int(a.y), int(a.toX), int(a.toY)].join('\t');
        case 'scroll': return ['scroll', int(a.window || 0), int(a.x), int(a.y), int(a.notches)].join('\t');
        case 'type': return ['type', int(a.window || 0), b64(a.text)].join('\t');
        case 'key': return ['key', int(a.window || 0), a.codes.map(int).join(',')].join('\t');
        case 'open': return ['open', b64(a.target)].join('\t');
        case 'ui': return ['ui', int(a.handle || 0), int(Math.max(10, Math.min(400, a.limit)))].join('\t');
        case 'act': return ['act', int(a.handle || 0), int(Math.max(1, a.index)), b64(a.action), b64(a.value), int(Math.max(10, Math.min(400, a.limit)))].join('\t');
    }
}

/** The host's answer line → the same { ok, out, error } the one-shot runner gives. */
export function readHostAnswer(line: string): { ok: boolean; out: string; error?: string } {
    const [status, body = ''] = String(line || '').split('\t');
    const text = Buffer.from(body, 'base64').toString('utf8');
    if (status !== 'OK') return { ok: false, out: '', error: text || 'the desktop host failed' };
    if (/^REFUSED\t/u.test(text)) return { ok: false, out: text, error: text.replace(/^REFUSED\t/u, '') };
    if (text === 'NOTFOUND') return { ok: false, out: text, error: 'that control number is not in the window any more: read the window again' };
    return { ok: true, out: text.trim() };
}

/** The PowerShell that loads the helper and serves the pipe. */
export function hostScript(pipe: string, idleMs: number): string {
    //  desktopScript's prelude loads (and if need be compiles) the helper; the
    //  action body is replaced by the serving loop.
    const prelude = desktopScript({ op: 'windows' }).replace(/\n\[JoeDesktop\]::Windows\(\)$/u, '');
    return `${prelude}\n[JoeDesktop]::Serve('${pipe}', ${Math.max(10_000, Math.floor(idleMs))})`;
}

export type HostStarter = (script: string) => void;

export class DesktopHost {
    private pipe = '';
    private socket: net.Socket | null = null;
    private buffer = '';
    private waiting: Array<(line: string | null) => void> = [];
    private chain: Promise<unknown> = Promise.resolve();

    constructor(private readonly start: HostStarter, private readonly idleMs = 10 * 60_000) { }

    private connect(timeoutMs: number): Promise<boolean> {
        return new Promise(resolve => {
            const deadline = Date.now() + timeoutMs;
            const attempt = () => {
                const s = net.createConnection(`\\\\.\\pipe\\${this.pipe}`);
                s.setEncoding('utf8');
                s.once('connect', () => {
                    this.socket = s;
                    //  The pipe never keeps Joe's process alive by itself.
                    s.unref();
                    s.on('data', (d: string) => {
                        this.buffer += d;
                        let i: number;
                        while ((i = this.buffer.indexOf('\n')) >= 0) {
                            const line = this.buffer.slice(0, i).replace(/\r$/u, '');
                            this.buffer = this.buffer.slice(i + 1);
                            this.waiting.shift()?.(line);
                        }
                    });
                    const gone = () => { if (this.socket === s) this.socket = null; for (const w of this.waiting.splice(0)) w(null); };
                    s.on('close', gone);
                    s.on('error', gone);
                    resolve(true);
                });
                s.once('error', () => {
                    s.destroy();
                    if (Date.now() > deadline) resolve(false);
                    else setTimeout(attempt, 250);
                });
            };
            attempt();
        });
    }

    /** Connected, starting the host when there is none. False when it cannot be reached. */
    async ready(timeoutMs = 45_000): Promise<boolean> {
        if (this.socket && !this.socket.destroyed) return true;
        if (this.pipe && await this.connect(1_000)) return true;
        ensureHelperSource();
        this.pipe = `joe-desktop-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
        try { this.start(hostScript(this.pipe, this.idleMs)); } catch { return false; }
        return this.connect(timeoutMs);
    }

    /** One action, in turn: actions never interleave on the pipe. */
    send(a: DesktopAction, timeoutMs = 90_000): Promise<{ ok: boolean; out: string; error?: string } | null> {
        const run = async () => {
            if (!(await this.ready())) return null;
            const s = this.socket!;
            const answer = new Promise<string | null>(resolve => {
                const timer = setTimeout(() => { const at = this.waiting.indexOf(done); if (at >= 0) this.waiting.splice(at, 1); s.destroy(); resolve(null); }, timeoutMs);
                const done = (line: string | null) => { clearTimeout(timer); resolve(line); };
                this.waiting.push(done);
            });
            s.write(`${hostLine(a)}\n`);
            const line = await answer;
            return line === null ? null : readHostAnswer(line);
        };
        const next = this.chain.then(run, run);
        this.chain = next.catch(() => undefined);
        return next;
    }

    close(): void { try { this.socket?.end(); } catch { /* gone */ } this.socket = null; }

    /** Ends the host itself, not only this connection: it answers «quit» and returns. */
    stop(): void {
        const s = this.socket;
        this.socket = null;
        this.pipe = '';
        if (!s || s.destroyed) return;
        try { s.end('quit\n'); } catch { /* gone */ }
    }
}
