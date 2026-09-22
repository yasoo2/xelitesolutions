import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isWithinRoot } from '../../modules/tools/path-containment';
import { fingerprintVerification, recordVerification, type VerificationReceipt } from './verification-ledger';

export interface BackendProofContext {
    workspaceId: string;
    workspaceRoot: string;
    sessionId: string;
    runId: string;
    backendRoot: string;
    resource: string;
}

export interface LocalBackendEvidence {
    identity: BackendProofContext;
    backend: 'sqlite' | 'json';
    express: boolean;
    receipt: VerificationReceipt;
    signature: string;
}

export interface LocalBackendAcceptance {
    evidence: unknown;
    context: BackendProofContext;
}

const signingKey = crypto.randomBytes(32);
const maxAgeMs = 60 * 60 * 1000;

function ownedContext(context: BackendProofContext): BackendProofContext | null {
    if (!context.workspaceId || !context.sessionId || !context.runId || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(context.resource)) return null;
    try {
        const workspaceRoot = fs.realpathSync(context.workspaceRoot);
        const backendRoot = fs.realpathSync(context.backendRoot);
        if (!isWithinRoot(backendRoot, workspaceRoot)) return null;
        return { workspaceId: context.workspaceId, workspaceRoot, sessionId: context.sessionId,
            runId: context.runId, backendRoot, resource: context.resource };
    } catch { return null; }
}

function selection(context: BackendProofContext) {
    // Generated backends use flat source files. Mutable data and packaged UI
    // are excluded; newly added source/config files still invalidate the proof.
    const names = fs.readdirSync(context.backendRoot);
    if (names.some(name => /\.(?:[cm]?js|ts|json)$/i.test(name)
        && !['data.json', 'entities.json'].includes(name)
        && (fs.lstatSync(path.join(context.backendRoot, name)).isSymbolicLink()
            || !fs.lstatSync(path.join(context.backendRoot, name)).isFile()))) throw new Error('unsupported_backend_source_file');
    if (names.some(name => fs.lstatSync(path.join(context.backendRoot, name)).isDirectory()
        // npm's project-local cache is deliberately mutable and never part of
        // the authored backend contract. It must not invalidate live evidence.
        && !['.joe', '.git', '.npm-cache', 'node_modules', 'public'].includes(name))) throw new Error('unsupported_backend_source_layout');
    const relevantPaths = names.filter(name =>
        /\.(?:[cm]?js|ts|json)$/i.test(name) && !['data.json', 'entities.json'].includes(name)
        && fs.statSync(path.join(context.backendRoot, name)).isFile());
    return fingerprintVerification({ checkId: 'local-backend-write-read', tool: 'api_project',
        workspaceId: context.workspaceId, workspaceRoot: context.workspaceRoot,
        scopeRoot: context.backendRoot, relevantPaths, mode: 'focused',
        args: { resource: context.resource, sessionId: context.sessionId, runId: context.runId } });
}

function sign(value: Omit<LocalBackendEvidence, 'signature'>): string {
    return crypto.createHmac('sha256', signingKey).update(JSON.stringify(value)).digest('hex');
}

export function backendFingerprint(context: BackendProofContext): string | null {
    const identity = ownedContext(context);
    if (!identity) return null;
    try { const current = selection(identity); return current.cacheable ? current.fingerprint : null; }
    catch { return null; }
}

export function ownedExpressSource(context: BackendProofContext): boolean {
    const identity = ownedContext(context);
    if (!identity) return false;
    try {
        if (!selection(identity).cacheable) return false;
        const serverPath = path.join(identity.backendRoot, 'server.js');
        const packagePath = path.join(identity.backendRoot, 'package.json');
        if ([serverPath, packagePath].some(file => fs.lstatSync(file).isSymbolicLink()
            || fs.realpathSync(file) !== file || !isWithinRoot(file, identity.backendRoot))) return false;
        if (fs.statSync(serverPath).size > 256 * 1024 || fs.statSync(packagePath).size > 64 * 1024) return false;
        const server = fs.readFileSync(serverPath, 'utf8');
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return typeof pkg.dependencies?.express === 'string'
            && /import\s+express\s+from\s+['"]express['"]/.test(server)
            && /express\s*\(\s*\)/.test(server);
    } catch { return false; }
}

export function payloadMatches(expected: Record<string, unknown>, actual: unknown): boolean {
    if (!actual || typeof actual !== 'object') return false;
    const entries = Object.entries(expected).filter(([, value]) => value !== undefined);
    return entries.length > 0 && entries.every(([key, value]) =>
        (actual as Record<string, unknown>)[key] === value);
}

/** Read only the generated primary storage, in a separate process, without importing project code. */
export function durableReadScript(context: BackendProofContext, backend: string, id: number,
    expected: Record<string, unknown>): string | null {
    const owned = ownedContext(context);
    if (!owned || !['sqlite', 'json'].includes(backend) || !Number.isSafeInteger(id) || id <= 0) return null;
    const entries = Object.entries(expected).filter(([, value]) => value !== undefined);
    if (!entries.length || entries.some(([, value]) => !['string', 'number', 'boolean'].includes(typeof value))) return null;
    const file = path.join(owned.backendRoot, backend === 'sqlite' ? 'data.db' : 'data.json');
    try {
        if (fs.lstatSync(file).isSymbolicLink() || !isWithinRoot(fs.realpathSync(file), owned.backendRoot)) return null;
    } catch { return null; }
    const data = JSON.stringify({ file, resource: owned.resource, backend, id, expected: Object.fromEntries(entries) });
    if (Buffer.byteLength(data) > 2048) return null;
    // Only data is encoded. The fixed reader never evaluates decoded input or
    // loads project code, and no user value becomes shell syntax on Windows.
    const encoded = Buffer.from(data).toString('hex');
    return [
        "const fs=require('node:fs')",
        `const d=JSON.parse(Buffer.from('${encoded}','hex').toString('utf8'))`,
        "if(fs.lstatSync(d.file).isSymbolicLink() || fs.realpathSync(d.file)!==d.file) throw new Error('storage_path_changed')",
        'let row',
        "if(d.backend==='sqlite'){const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(d.file,{readOnly:true});try{const q=String.fromCharCode(34);row=db.prepare('SELECT * FROM '+q+d.resource+q+' WHERE id = ?').get(d.id)}finally{db.close()}}else{if(fs.statSync(d.file).size>16*1024*1024)throw new Error('storage_read_budget_exceeded');const saved=JSON.parse(fs.readFileSync(d.file,'utf8'));row=Array.isArray(saved.rows)?saved.rows.find(r=>r.id===d.id):null}",
        "if(!row || !Object.entries(d.expected).every(([key,value])=>row[key]===value))process.exitCode=1;else console.log('JOE_BACKEND_DURABLE_MATCH')",
    ].join(';');
}

export function durableReadCommand(context: BackendProofContext, backend: string, id: number,
    expected: Record<string, unknown>): string | null {
    const script = durableReadScript(context, backend, id, expected);
    if (!script || /["$`\r\n]/.test(script)) return null;
    return `node -e "${script}"`;
}

export function issueBackendEvidence(context: BackendProofContext, backend: string,
    checks: { writeOk: boolean; payloadReadMatches: boolean; durableReadMatches: boolean },
    durationMs: number, expectedFingerprint: string | null): LocalBackendEvidence | null {
    const identity = ownedContext(context);
    if (!identity || !['sqlite', 'json'].includes(backend)
        || !checks.writeOk || !checks.payloadReadMatches || !checks.durableReadMatches) return null;
    try {
        const selected = selection(identity);
        if (!selected.cacheable || !expectedFingerprint || selected.fingerprint !== expectedFingerprint) return null;
        const express = ownedExpressSource(identity);
        const receipt = recordVerification(null, selected, 'passed', durationMs).receipts[0];
        const unsigned = { identity, backend: backend as 'sqlite' | 'json', express, receipt };
        return { ...unsigned, signature: sign(unsigned) };
    } catch { return null; }
}

/** Process-local signatures deliberately invalidate persisted receipts after a Joe restart. */
export function validateBackendEvidence(value: unknown, context: BackendProofContext): LocalBackendEvidence | null {
    const identity = ownedContext(context);
    if (!identity || !value || typeof value !== 'object') return null;
    try {
        const evidence = value as LocalBackendEvidence;
        const { signature, ...unsigned } = evidence;
        if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)
            || !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(unsigned), 'hex'))) return null;
        if (JSON.stringify(evidence.identity) !== JSON.stringify(identity)
            || evidence.receipt.result !== 'passed'
            || Date.now() - evidence.receipt.recordedAt > maxAgeMs
            || evidence.receipt.recordedAt > Date.now()) return null;
        const current = selection(identity);
        return current.cacheable && current.fingerprint === evidence.receipt.fingerprint ? evidence : null;
    } catch { return null; }
}
