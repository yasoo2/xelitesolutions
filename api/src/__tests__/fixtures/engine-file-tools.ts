/**
 * A real run context for the engine's file tools, in a workspace of its own.
 *
 * EXTERNAL_PROJECTS_DIR points the real WorkspaceService at a fresh folder,
 * so getActiveRoot(workspaceId) is a folder this fixture owns, and the run's
 * project folder sits inside it. ENABLE_AUTH_BYPASS stands in for the owner's
 * laptop, where it is set. Every call goes through
 * executionFirewall.runInContext and ToolService.executeTool, exactly as the
 * engine's adapters call them. Modules are required lazily so the environment
 * is in place before the registry loads.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface FileToolsFixture {
    /** The temporary root: the workspace service's external root. */
    base: string;
    workspaceId: string;
    workspace: string;
    project: string;
    /** A folder beside the workspace: what an escape would reach. */
    outside: string;
    context: Record<string, unknown>;
    run(tool: string, input: Record<string, unknown>, context?: Record<string, unknown>): Promise<any>;
    /** Set up a file with fs (not through the tools). */
    put(rel: string, content: string | Buffer): string;
    text(rel: string): string;
    bytes(rel: string): Buffer;
    sha(rel: string): string;
    exists(rel: string): boolean;
    /** A junction (a directory symlink off Windows) at rel inside the project, to target. */
    link(rel: string, target: string): string;
    /** The UI events broadcast while fn runs. */
    events<T>(fn: () => Promise<T>): Promise<{ result: T; events: any[] }>;
    cleanup(): void;
}

export function fileToolsFixture(name: string): FileToolsFixture {
    const saved = { external: process.env.EXTERNAL_PROJECTS_DIR, bypass: process.env.ENABLE_AUTH_BYPASS };
    const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), `joe-eng-files-${name}-`));
    process.env.EXTERNAL_PROJECTS_DIR = base;
    process.env.ENABLE_AUTH_BYPASS = 'true';
    const workspaceId = `eng-files-${name}`;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { workspaceService } = require('../../modules/services/WorkspaceService');
    const workspace: string = workspaceService.getActiveRoot(workspaceId);
    const project = path.join(workspace, 'project');
    const outside = path.join(base, 'outside');
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    const links: string[] = [];
    const owner = { userId: `eng-files-owner-${name}`, sessionId: `eng-files-session-${name}`, runId: `eng-files-run-${name}` };
    const context = { ...owner, workspaceId, projectRoot: project };
    let seq = 0;
    const abs = (rel: string) => path.join(project, ...rel.split('/'));

    return {
        base, workspaceId, workspace, project, outside, context,
        run(tool, input, ctx = context) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { executeTool } = require('../../modules/services/ToolService');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
            return executionFirewall.runInContext(`eng-files-${name}-${++seq}`, () => executeTool(tool, input, ctx), owner);
        },
        put(rel, content) {
            const file = abs(rel);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, content);
            return file;
        },
        text: rel => fs.readFileSync(abs(rel), 'utf8'),
        bytes: rel => fs.readFileSync(abs(rel)),
        sha: rel => crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex'),
        exists: rel => fs.existsSync(abs(rel)),
        link(rel, target) {
            const at = abs(rel);
            fs.mkdirSync(path.dirname(at), { recursive: true });
            fs.symlinkSync(target, at, 'junction');
            links.push(at);
            return at;
        },
        async events(fn) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { observeBroadcasts } = require('../../api/ws');
            const events: any[] = [];
            const stop = observeBroadcasts((event: any) => events.push(event));
            try { return { result: await fn(), events }; } finally { stop(); }
        },
        cleanup() {
            for (const link of links) { try { fs.unlinkSync(link); } catch { /* already gone */ } }
            fs.rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            if (saved.external === undefined) delete process.env.EXTERNAL_PROJECTS_DIR; else process.env.EXTERNAL_PROJECTS_DIR = saved.external;
            if (saved.bypass === undefined) delete process.env.ENABLE_AUTH_BYPASS; else process.env.ENABLE_AUTH_BYPASS = saved.bypass;
        },
    };
}

/** A PNG header stating its pixel size: all a reader looks at. */
export function pngHeader(width: number, height: number): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const length = Buffer.alloc(4);
    length.writeUInt32BE(13, 0);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), length, Buffer.from('IHDR'), ihdr, Buffer.alloc(4)]);
}

/** A JPEG start: SOI, an APP0 segment, then the SOF0 frame header with the size. */
export function jpegHeader(width: number, height: number): Buffer {
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const sof = Buffer.alloc(19);
    sof[0] = 0xff; sof[1] = 0xc0;
    sof.writeUInt16BE(17, 2);
    sof[4] = 8;
    sof.writeUInt16BE(height, 5);
    sof.writeUInt16BE(width, 7);
    sof[9] = 3;
    return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}
