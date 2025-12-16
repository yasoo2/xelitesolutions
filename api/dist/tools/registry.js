"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tools = void 0;
exports.executeTool = executeTool;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
if (!fs_1.default.existsSync(ARTIFACT_DIR)) {
    try {
        fs_1.default.mkdirSync(ARTIFACT_DIR, { recursive: true });
    }
    catch { }
}
exports.tools = [
    {
        name: 'echo',
        version: '1.0.0',
        tags: ['utility', 'string'],
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
        permissions: [],
        sideEffects: [],
        rateLimitPerMinute: 120,
        auditFields: ['text'],
        mockSupported: true,
    },
    {
        name: 'http_fetch',
        version: '1.0.0',
        tags: ['network', 'http'],
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        outputSchema: { type: 'object', properties: { status: { type: 'number' }, bodySnippet: { type: 'string' } } },
        permissions: ['read'],
        sideEffects: [],
        rateLimitPerMinute: 60,
        auditFields: ['url'],
        mockSupported: true,
    },
    {
        name: 'file_write',
        version: '1.0.0',
        tags: ['fs', 'artifact'],
        inputSchema: { type: 'object', properties: { filename: { type: 'string' }, content: { type: 'string' } }, required: ['filename', 'content'] },
        outputSchema: { type: 'object', properties: { href: { type: 'string' } } },
        permissions: ['write'],
        sideEffects: ['write'],
        rateLimitPerMinute: 60,
        auditFields: ['filename'],
        mockSupported: false,
    },
    {
        name: 'browser_snapshot',
        version: '1.0.0',
        tags: ['browser', 'artifact'],
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        outputSchema: { type: 'object', properties: { href: { type: 'string' }, title: { type: 'string' } } },
        permissions: ['read'],
        sideEffects: [],
        rateLimitPerMinute: 30,
        auditFields: ['url'],
        mockSupported: false,
    },
];
for (let i = 1; i <= 197; i++) {
    exports.tools.push({
        name: `noop_${i}`,
        version: '1.0.0',
        tags: ['utility'],
        inputSchema: { type: 'object', properties: { note: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
        permissions: [],
        sideEffects: [],
        rateLimitPerMinute: 600,
        auditFields: [],
        mockSupported: true,
    });
}
async function executeTool(name, input) {
    const logs = [];
    const t0 = Date.now();
    logs.push(`[${new Date().toISOString()}] start ${name}`);
    try {
        if (name === 'echo') {
            const text = String(input?.text ?? '');
            logs.push(`echo.text.length=${text.length}`);
            return { ok: true, output: { text }, logs };
        }
        if (name === 'http_fetch') {
            const url = String(input?.url ?? '');
            const resp = await fetch(url);
            const body = await resp.text();
            logs.push(`fetch.status=${resp.status}`);
            return { ok: true, output: { status: resp.status, bodySnippet: body.slice(0, 512) }, logs };
        }
        if (name === 'file_write') {
            const filename = path_1.default.basename(String(input?.filename ?? 'artifact.txt'));
            const content = String(input?.content ?? '');
            const full = path_1.default.join(ARTIFACT_DIR, filename);
            fs_1.default.writeFileSync(full, content);
            logs.push(`wrote=${full} bytes=${content.length}`);
            const href = `/artifacts/${encodeURIComponent(filename)}`;
            return { ok: true, output: { href }, logs, artifacts: [{ name: filename, href }] };
        }
        if (name === 'browser_snapshot') {
            const url = String(input?.url ?? '');
            const filename = `snapshot-${Date.now()}.png`;
            const full = path_1.default.join(ARTIFACT_DIR, filename);
            const { default: puppeteer } = await Promise.resolve().then(() => __importStar(require('puppeteer')));
            const browser = await puppeteer.launch({ headless: true });
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            const title = await page.title();
            await page.setViewport({ width: 1280, height: 800 });
            await page.screenshot({ path: full });
            await browser.close();
            logs.push(`snapshot.saved=${full} title=${title}`);
            const href = `/artifacts/${encodeURIComponent(filename)}`;
            return { ok: true, output: { href, title }, logs, artifacts: [{ name: filename, href }] };
        }
        if (name.startsWith('noop_')) {
            logs.push('noop.ok=true');
            return { ok: true, output: { ok: true }, logs };
        }
        return { ok: false, error: 'unknown_tool', logs };
    }
    catch (e) {
        logs.push(`error=${e?.message || String(e)}`);
        return { ok: false, error: e?.message || 'error', logs };
    }
    finally {
        logs.push(`[${new Date().toISOString()}] end ${name} dt=${Date.now() - t0}ms`);
    }
}
