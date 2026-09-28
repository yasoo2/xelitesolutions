import fs from 'fs';
import os from 'os';
import path from 'path';

describe('provider cooldown across a Joe process restart', () => {
    const previousSecret = process.env.JWT_SECRET;
    const previousStore = process.env.JOE_PROVIDER_CIRCUIT_STORE_DIR;
    const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-provider-circuits-'));

    beforeAll(() => {
        process.env.JWT_SECRET = 'test-only-provider-continuity-secret-20260928';
        process.env.JOE_PROVIDER_CIRCUIT_STORE_DIR = storeDir;
    });
    afterAll(() => {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
        if (previousStore === undefined) delete process.env.JOE_PROVIDER_CIRCUIT_STORE_DIR;
        else process.env.JOE_PROVIDER_CIRCUIT_STORE_DIR = previousStore;
        const file = path.join(storeDir, 'provider-circuits.json');
        if (fs.existsSync(file)) fs.unlinkSync(file);
        fs.rmdirSync(storeDir);
    });

    it('retains an active 429 while keeping custom credentials isolated by workspace', () => {
        type Continuity = typeof import('../core/llm/provider-continuity');
        let before!: Continuity;
        jest.isolateModules(() => { before = require('../core/llm/provider-continuity'); });
        const localKey = before.providerCircuitKey('Local (Auto)');
        const customA = before.providerCircuitKey('groq', {
            apiKey: 'test-private-key', userId: 'owner', workspaceId: 'A',
        });
        const now = Date.now();
        before.recordProviderCircuitFailure(localKey, { status: 429, headers: { 'Retry-After': '600' } }, now);
        before.recordProviderCircuitFailure(customA, { status: 429, headers: { 'Retry-After': '600' } }, now);

        let after!: Continuity;
        jest.isolateModules(() => { after = require('../core/llm/provider-continuity'); });
        expect(after.providerCircuitKey('Local (Auto)')).toBe(localKey);
        expect(after.providerCircuitStatus(localKey, now + 1)).toMatchObject({
            blocked: true, state: 'RATE_LIMITED', retryAt: now + 600_000,
        });
        const sameWorkspace = after.providerCircuitKey('groq', {
            apiKey: 'test-private-key', userId: 'owner', workspaceId: 'A',
        });
        const otherWorkspace = after.providerCircuitKey('groq', {
            apiKey: 'test-private-key', userId: 'owner', workspaceId: 'B',
        });
        expect(after.providerCircuitStatus(sameWorkspace, now + 1).blocked).toBe(true);
        expect(after.providerCircuitStatus(otherWorkspace, now + 1).blocked).toBe(false);
        const persisted = fs.readFileSync(path.join(storeDir, 'provider-circuits.json'), 'utf8');
        expect(persisted).not.toContain('test-private-key');
        expect(persisted).not.toContain('owner');
        expect(persisted).not.toContain('workspaceId');
        expect(persisted).not.toContain('probingUntil');
        expect(persisted).not.toContain('lease');

        const recoveryAt = now + 600_001;
        expect(after.claimProviderCircuit(localKey, recoveryAt)).toMatchObject({ allowed: true, probe: true });
        let restartedDuringProbe!: Continuity;
        jest.isolateModules(() => { restartedDuringProbe = require('../core/llm/provider-continuity'); });
        const recovery = restartedDuringProbe.claimProviderCircuit(localKey, recoveryAt);
        expect(recovery).toMatchObject({ allowed: true, probe: true });
        restartedDuringProbe.markProviderCircuitHealthy(localKey, recovery.lease, recoveryAt);
        let afterSuccess!: Continuity;
        jest.isolateModules(() => { afterSuccess = require('../core/llm/provider-continuity'); });
        expect(afterSuccess.providerCircuitStatus(localKey, recoveryAt)).toEqual({ blocked: false });
        expect(afterSuccess.providerCircuitStatus(sameWorkspace, now + 1).blocked).toBe(true);

        const file = path.join(storeDir, 'provider-circuits.json');
        const tampered = JSON.parse(fs.readFileSync(file, 'utf8'));
        tampered.circuits[0].retryAt += 60_000;
        fs.writeFileSync(file, JSON.stringify(tampered), 'utf8');
        let afterTamper!: Continuity;
        jest.isolateModules(() => { afterTamper = require('../core/llm/provider-continuity'); });
        expect(afterTamper.providerCircuitStatus(sameWorkspace, now + 1).blocked).toBe(false);
    });
});
