import fs from 'fs';
import path from 'path';

const ROUTER = fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf8');

describe('offline local provider deadline', () => {
    it('keeps one real Ollama attempt bounded instead of waiting ten minutes', () => {
        expect(ROUTER).toContain('OFFLINE_LOCAL_TIMEOUT_MS');
        expect(ROUTER).toMatch(/OFFLINE_LOCAL_TIMEOUT_MS[\s\S]{0,500}45_000/);
        expect(ROUTER).toContain("if (offlineMode && p.name === 'Local (Auto)')");
        // Sized to the call over the measured speed, bounded by the operator leash (2026-10-23).
        expect(ROUTER).toContain('timeoutValue = Math.min(timeoutValue, Math.max(OFFLINE_LOCAL_TIMEOUT_MS, Math.min(Math.max(machineLeash, localSizeDeadline), LOCAL_LEASH_MAX_MS)));');
        expect(ROUTER).toContain("const localSizeDeadline = p.name === 'Local (Auto)'");
    });

    // Eval 2026-10-22: offline, the local model is the only brain; a fixed 45 s cut
    // aborted a two-sentence answer on a CPU that needs ~75 s to read the prompt.
    it('is never shorter than the leash measured on this machine', () => {
        expect(ROUTER).toMatch(/const machineLeash = internalLeashMs\(Number\(offlineWarmupMs\?\.\(\) \|\| 0\)\);/);
        expect(ROUTER).not.toContain('timeoutValue = Math.min(timeoutValue, OFFLINE_LOCAL_TIMEOUT_MS);');
    });

    it('allows a bounded environment override without accepting an unsafe value', () => {
        expect(ROUTER).toContain('Math.min(120_000, Math.max(10_000, configured))');
    });

    // Eval 2026-10-22: Auto + OFFLINE_MODE preflight reported a live CPU model as
    // TIMEOUT after 8 s (mesh) or 15 s (direct) while its warm-up was still running.
    it('offline Auto preflight probes the configured local model with the local cold-start bound', () => {
        expect(ROUTER).toContain("if (providerAllowedByCost('Local (Auto)') && localProvider.isConfigured()) {");
        expect(ROUTER).toContain('const localProbeTimeout = offlineOnlyLocal ? localVerificationBudgetMs() : 15_000;');
        expect(ROUTER).toContain('if (warmup > 0 && isLocalBrainReady()) {');
    });
});
