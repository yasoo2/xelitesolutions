import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { backendFingerprint, durableReadScript, issueBackendEvidence as issueMeasuredEvidence, ownedExpressSource, payloadMatches, validateBackendEvidence, type BackendProofContext } from '../core/quality/local-backend-evidence';
import { verifyNamed, namedDecisionTrace } from '../core/quality/named-requirements';

const issueBackendEvidence = (context: BackendProofContext, backend: string,
    checks: { writeOk: boolean; payloadReadMatches: boolean; durableReadMatches: boolean }, durationMs: number) =>
    issueMeasuredEvidence(context, backend, checks, durationMs, backendFingerprint(context));

describe('local backend evidence uses the existing verification fingerprint', () => {
    let root: string;
    let context: BackendProofContext;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-evidence-'));
        const backendRoot = path.join(root, 'api');
        fs.mkdirSync(backendRoot);
        fs.writeFileSync(path.join(backendRoot, 'server.js'), "import express from 'express'; const app=express();");
        fs.writeFileSync(path.join(backendRoot, 'package.json'), JSON.stringify({ dependencies: { express: '^4' } }));
        fs.writeFileSync(path.join(backendRoot, 'package-lock.json'), '{}');
        fs.writeFileSync(path.join(backendRoot, 'data.json'), JSON.stringify({ rows: [{ id: 1, title: 'probe' }] }));
        context = { workspaceRoot: root, backendRoot, workspaceId: 'workspace-a', sessionId: 'session-a', runId: 'run-a', resource: 'records' };
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
    const checks = { writeOk: true, payloadReadMatches: true, durableReadMatches: true };
    it('accepts a signed current proof and identifies JSON without claiming SQLite', () => {
        const proof = issueBackendEvidence(context, 'json', checks, 12)!;
        expect(proof.backend).toBe('json');
        expect(proof.express).toBe(true);
        expect(validateBackendEvidence(proof, context)).toEqual(proof);
        expect(JSON.stringify(proof)).not.toContain('probe');
    });
    it('keeps evidence valid when npm uses the generated project-local cache', () => {
        fs.mkdirSync(path.join(context.backendRoot, '.npm-cache'));
        const proof = issueBackendEvidence(context, 'json', checks, 12)!;
        expect(proof).toBeTruthy();
        expect(validateBackendEvidence(proof, context)).toEqual(proof);
    });
    it.each(['writeOk', 'payloadReadMatches', 'durableReadMatches'])('refuses incomplete proof: %s', key => {
        expect(issueBackendEvidence(context, 'sqlite', { ...checks, [key]: false }, 1)).toBeNull();
    });
    it.each(['workspaceId', 'sessionId', 'runId', 'resource'])('rejects changed trusted %s', key => {
        const proof = issueBackendEvidence(context, 'sqlite', checks, 1);
        expect(validateBackendEvidence(proof, { ...context, [key]: 'other' })).toBeNull();
    });
    it('rejects a foreign workspace root', () => {
        const foreign = path.join(root, 'foreign'); fs.mkdirSync(foreign);
        expect(issueBackendEvidence({ ...context, workspaceRoot: foreign }, 'sqlite', checks, 1)).toBeNull();
    });
    it.each(['signature', 'backend', 'identity', 'receipt'])('rejects tampering: %s', key => {
        const proof: any = issueBackendEvidence(context, 'json', checks, 1);
        proof[key] = key === 'signature' ? '0'.repeat(64) : 'forged';
        expect(validateBackendEvidence(proof, context)).toBeNull();
    });
    it.each(['server.js', 'package-lock.json', 'new-config.json'])('invalidates changes to %s', name => {
        const proof = issueBackendEvidence(context, 'json', checks, 1);
        fs.writeFileSync(path.join(context.backendRoot, name), '{"changed":true}');
        expect(validateBackendEvidence(proof, context)).toBeNull();
    });
    it('requires payload equality, not just a row ID', () => {
        expect(payloadMatches({ title: 'probe' }, { id: 1, title: 'different' })).toBe(false);
        expect(payloadMatches({}, { id: 1 })).toBe(false);
        expect(payloadMatches({ title: 'probe' }, { id: 1, title: 'probe' })).toBe(true);
    });
    it('refuses a source change during the measurement', () => {
        const before = backendFingerprint(context);
        fs.appendFileSync(path.join(context.backendRoot, 'server.js'), '\n// changed during probe');
        expect(issueMeasuredEvidence(context, 'json', checks, 1, before)).toBeNull();
        expect(issueMeasuredEvidence(context, 'json', checks, 1, null)).toBeNull();
    });
    it('reads matching JSON payload in an independent process and rejects a mismatch', () => {
        const script = durableReadScript(context, 'json', 1, { title: 'probe' })!;
        expect(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })).toContain('JOE_BACKEND_DURABLE_MATCH');
        const mismatch = durableReadScript(context, 'json', 1, { title: 'wrong' })!;
        expect(() => execFileSync(process.execPath, ['-e', mismatch], { stdio: 'pipe' })).toThrow();
    });
    it('rejects missing storage and tampered paths', () => {
        fs.unlinkSync(path.join(context.backendRoot, 'data.json'));
        expect(durableReadScript(context, 'json', 1, { title: 'probe' })).toBeNull();
        expect(durableReadScript({ ...context, backendRoot: os.tmpdir() }, 'json', 1, { title: 'probe' })).toBeNull();
        expect(durableReadScript({ ...context, resource: 'records;DROP TABLE users' }, 'sqlite', 1, { title: 'probe' })).toBeNull();
    });
    it('reads a real SQLite keyword table independently and detects a mismatched value', () => {
        context.resource = 'group';
        const file = path.join(context.backendRoot, 'data.db');
        const sql = 'CREATE TABLE "group"(id INTEGER PRIMARY KEY,title TEXT); INSERT INTO "group" VALUES(1,\'probe\')';
        execFileSync(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(${JSON.stringify(file)}); db.exec(${JSON.stringify(sql)}); db.close();`], { stdio: 'pipe' });
        const read = durableReadScript(context, 'sqlite', 1, { title: 'probe' })!;
        expect(execFileSync(process.execPath, ['-e', read], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })).toContain('JOE_BACKEND_DURABLE_MATCH');
        expect(() => execFileSync(process.execPath, ['-e', durableReadScript(context, 'sqlite', 1, { title: 'wrong' })!], { stdio: 'pipe' })).toThrow();
    });
    it('does not ask a model to fill missing storage evidence or call JSON a real database', async () => {
        const requirements = ['an Express API', 'a real database', 'persistence'].map((text, index) => ({ id: String(index), text, quote: text }));
        const provider = jest.fn(async () => { throw new Error('must not be called'); });
        const json = issueBackendEvidence(context, 'json', checks, 1);
        const verdicts = await verifyNamed(requirements, 'frontend source', false, provider, null, { evidence: json, context });
        expect(verdicts.map(value => value.verdict)).toEqual(['met', 'unprovable', 'met']);
        const missing = await verifyNamed(requirements, 'localStorage.setItem("data", "saved")', false, provider, null, { evidence: null, context });
        expect(missing.map(value => value.verdict)).toEqual(['met', 'unprovable', 'unprovable']);
        const foreign = await verifyNamed(requirements, 'frontend source', false, provider, null,
            { evidence: json, context: { ...context, runId: '' } });
        expect(foreign.every(value => value.verdict === 'unprovable')).toBe(true);
        expect(provider).not.toHaveBeenCalled();
    });
    // Synthetic contracts: these do not reconstruct the missing live-run quote.
    it('uses backend proof for a short database label grounded in a full request quote', async () => {
        const requirement = { id: 'database', text: 'a real database',
            quote: 'Create a checkout board with an Express API and a real database.' };
        const provider = jest.fn(async () => '{"verdicts":[]}');
        const proof = issueBackendEvidence(context, 'sqlite', checks, 1);
        const [result] = await verifyNamed([requirement], 'frontend source', false, provider, null,
            { evidence: proof, context });
        expect(result.verdict).toBe('met');
        expect(result.why).toContain('independent SQLite');
        expect(provider).not.toHaveBeenCalled();
    });
    it('reads a real SQLite database as one locally provable backend requirement', async () => {
        const requirement = { id: 'sqlite', text: 'a real SQLite database',
            quote: 'Create a reading queue with a real SQLite database.' };
        const provider = jest.fn(async () => { throw new Error('provider must not be called'); });
        const proof = issueBackendEvidence(context, 'sqlite', checks, 1);
        const [result] = await verifyNamed([requirement], 'frontend source', false, provider, null,
            { evidence: proof, context });
        expect(result.verdict).toBe('met');
        expect(result.decision?.route).toBe('local_backend');
        expect(provider).not.toHaveBeenCalled();
    });
    it('uses backend proof when the requirement reader retains a list connector', async () => {
        const requirement = { id: 'database-with-connector', text: 'and a real database',
            quote: 'Create a checkout board with an Express API and a real database.' };
        const provider = jest.fn(async () => '{"verdicts":[]}');
        const proof = issueBackendEvidence(context, 'sqlite', checks, 1);
        const [result] = await verifyNamed([requirement], 'frontend source', false, provider, null,
            { evidence: proof, context });
        expect(result.verdict).toBe('met');
        expect(result.decision?.route).toBe('local_backend');
        expect(provider).not.toHaveBeenCalled();
    });
    it('does not accept a source mention as an Express implementation with a full quote', async () => {
        fs.writeFileSync(path.join(context.backendRoot, 'server.js'), '// no server implementation');
        const requirement = { id: 'express', text: 'an Express API',
            quote: 'Create a checkout board with an Express API and a real database.' };
        const source = 'Documentation: an Express API is requested for this project.';
        const provider = jest.fn(async () => JSON.stringify({ verdicts: [{ id: 'express', verdict: 'met',
            evidence: source, why: 'The source mentions an Express API.' }] }));
        const [result] = await verifyNamed([requirement], source, false, provider, null,
            { evidence: null, context });
        expect(result.verdict).toBe('unprovable');
        expect(provider).not.toHaveBeenCalled();
    });
    it.each(['It must provide an Express API and encrypted offsite backups',
        'an Express API and encrypted offsite backups'])('does not certify a partial compound backend contract: %s', async text => {
        const requirement = { id: 'compound-backend', text, quote: text };
        const provider = jest.fn(async () => JSON.stringify({ verdicts: [{ id: requirement.id, verdict: 'met',
            evidence: text, why: 'The request is mentioned in the source.' }] }));
        const proof = issueBackendEvidence(context, 'sqlite', checks, 1);
        const [result] = await verifyNamed([requirement], `// ${text}`, false, provider, null,
            { evidence: proof, context });
        expect(result.verdict).not.toBe('met');
    });
    it.each(['missing', 'stale', 'foreign'])('refuses %s proof with a full-context database quote', async variant => {
        const proof = issueBackendEvidence(context, 'sqlite', checks, 1);
        if (variant === 'stale') fs.appendFileSync(path.join(context.backendRoot, 'server.js'), '\n// new revision');
        const provider = jest.fn(async () => '{"verdicts":[]}');
        const [result] = await verifyNamed([{ id: 'db', text: 'a real database',
            quote: 'Create a checkout board with an Express API and a real database.' }], 'frontend', false, provider, null,
            { evidence: variant === 'missing' ? null : proof, context: variant === 'foreign' ? { ...context, runId: 'other' } : context });
        expect(result.verdict).toBe('unprovable');
        expect(result.decision?.reasonCode).toBe('backend_evidence_rejected');
        expect(provider).not.toHaveBeenCalled();
    });
    it('keeps every part of a proven compound backend inventory', async () => {
        const text = 'It must provide an Express API and a real database and persistence';
        const proof = issueBackendEvidence(context, 'sqlite', checks, 1);
        const provider = jest.fn(async () => '');
        const [result] = await verifyNamed([{ id: 'all', text, quote: text }], 'frontend', false, provider, null,
            { evidence: proof, context });
        expect(result.verdict).toBe('met');
        expect(result.decision?.evidenceKind).toBe('compound');
        expect(provider).not.toHaveBeenCalled();
    });
    it('bounds decision telemetry and omits credentials even in IDs and unknown decision fields', () => {
        const secret = 'password=sample-private-password Bearer secret-token-123456789';
        const trace = namedDecisionTrace(Array.from({ length: 100 }, () => ({
            id: secret, text: secret, quote: secret.repeat(1000), why: secret,
            verdict: 'unprovable' as const,
            decision: { route: secret, evidenceKind: secret, reasonCode: secret } as any,
        })));
        expect(trace.criteria).toHaveLength(64);
        expect(trace.omitted).toBe(36);
        expect(JSON.stringify(trace)).not.toMatch(/sample-private-password|secret-token|password=|Bearer/);
        expect(JSON.stringify(trace).length).toBeLessThan(24000);
        expect(trace.criteria[0].reasonCode).toBe('unclassified');
    });
    it('rejects stale receipts and storage symlink escapes', () => {
        const proof = issueBackendEvidence(context, 'json', checks, 1);
        const now = Date.now();
        const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 3600001);
        expect(validateBackendEvidence(proof, context)).toBeNull();
        clock.mockRestore();
        const storage = path.join(context.backendRoot, 'data.json');
        fs.unlinkSync(storage);
        const outside = path.join(root, 'outside.json');
        fs.writeFileSync(outside, '{"rows":[]}');
        try { fs.symlinkSync(outside, storage, 'file'); }
        catch (error: any) {
            // Windows without symlink privilege: exercise a directory junction instead.
            if (error.code !== 'EPERM') throw error;
            fs.symlinkSync(root, storage, 'junction');
        }
        expect(durableReadScript(context, 'json', 1, { title: 'probe' })).toBeNull();
    });
    it.each(['server.js', 'package.json'])('does not read a linked source file: %s', name => {
        const file = path.join(context.backendRoot, name);
        const outside = path.join(root, `outside-${name}`);
        fs.copyFileSync(file, outside);
        fs.unlinkSync(file);
        try { fs.symlinkSync(outside, file, 'file'); }
        catch (error: any) {
            if (error.code !== 'EPERM') throw error;
            fs.symlinkSync(root, file, 'junction');
        }
        expect(ownedExpressSource(context)).toBe(false);
        expect(issueBackendEvidence(context, 'json', checks, 1)).toBeNull();
    });
});
