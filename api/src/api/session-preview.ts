/**
 * WHICH PAGE THE PREVIEW TAB OPENS WHEN A CONVERSATION IS OPENED.
 *
 * 2026-11-05, the UI/UX check of Joe's own page: while Joe built the clinic,
 * and after a reload, the Preview tab showed a bare white page in a serif
 * font — «No built project to preview — build one first.» — the 404 of
 * /project-preview. The live run had already announced the real address
 * (preview_ready → http://127.0.0.1:4300/), but a reload or a return to the
 * conversation asks GET /sessions/:id/workspace, which answered with the
 * /project-preview URL whenever a project folder was on record: whether or
 * not a dist/index.html existed there. An agent-engine project builds its
 * page into client/dist and runs its own server, so that URL never had a page.
 *
 * Now the answer is what is really there, in this order:
 *   1. the project's own server, when it is recorded live and its port answers;
 *   2. the built page under /project-preview, when dist/index.html exists;
 *   3. nothing — and the panel shows its own empty state, not an error page.
 */
import { resolvePreviewFile } from './routes/projectPreview';
import { publicUrlFor } from '../shared/utils/publicUrl';
import { isLoopbackPortOpen } from '../modules/tools/definitions/ProjectRunTool';

export interface SessionPreview {
    url: string;
    brand?: string;
    dir?: string;
    type?: string;
    at?: number;
    live?: boolean;
}

export interface SessionPreviewDeps {
    portOpen: (port: number) => Promise<boolean>;
    builtPage: (key: string) => string | null;
}

const defaultDeps: SessionPreviewDeps = {
    portOpen: port => isLoopbackPortOpen(port, 800),
    builtPage: key => resolvePreviewFile(key, 'index.html'),
};

/** Only an address on this machine is a project Joe started: never a host a record names. */
function loopbackUrl(raw: unknown): string | null {
    try {
        const url = new URL(String(raw || ''));
        if (!/^https?:$/.test(url.protocol)) return null;
        return /^(127\.0\.0\.1|localhost|\[::1\])$/i.test(url.hostname) ? url.toString() : null;
    } catch { return null; }
}

export async function previewForSession(sessionId: string, project: Record<string, any> | null, deps: SessionPreviewDeps = defaultDeps): Promise<SessionPreview | null> {
    //  An API-only project has no page to show. Saying so is the honest
    //  answer; a URL to a directory that serves nothing is not.
    if (!project || !project.dir || project.type === 'api') return null;
    const at = Number(project.updatedAt) || 0;
    const base = { brand: project.brand, dir: project.dir, type: project.type, at };
    const live = project.live || {};
    const liveUrl = loopbackUrl(live.url);
    const port = Number(live.port);
    if (liveUrl && Number.isInteger(port) && port > 0 && await deps.portOpen(port).catch(() => false)) {
        return { ...base, url: liveUrl, live: true };
    }
    if (deps.builtPage(sessionId)) {
        return { ...base, url: publicUrlFor('/project-preview/' + encodeURIComponent(sessionId) + '/index.html' + (at ? '?v=' + at : '')) };
    }
    return null;
}

/**
 * WHETHER A PREVIEW ADDRESS STILL ANSWERS, ASKED OF JOE — NOT OF THE PORT.
 *
 * The ladder's UI/UX check of Joe's own page, 2026-11-09 (L151–L160): half the
 * prompts ended with «console_errors — ERR_CONNECTION_REFUSED @ 127.0.0.1:4300».
 * The Preview tab asked the stopped project server itself, from the browser,
 * every 15 s, and every refused knock is an error in the page's console. On the
 * server Joe runs for many users, the browser cannot reach the machine's
 * loopback at all. Joe's own server asks its own loopback: true or false for an
 * address on this machine, null for any other (not Joe's to probe).
 */
export async function previewAddressAnswers(raw: unknown, sameHost = '', portOpen: (port: number) => Promise<boolean> = defaultDeps.portOpen): Promise<boolean | null> {
    let u: URL;
    try { u = new URL(String(raw || '')); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    //  This machine: its loopback, or the host he reached Joe at (the Preview
    //  tab rewrites 127.0.0.1 to it, so a phone on the same network can open it).
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const here = /^(127\.0\.0\.1|localhost|::1)$/.test(host) || (!!sameHost && host === String(sameHost).toLowerCase());
    if (!here) return null;
    const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
    //  A project's own server, never the machine's system services.
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
    return portOpen(port).catch(() => false);
}
