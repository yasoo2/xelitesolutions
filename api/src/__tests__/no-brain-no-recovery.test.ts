/**
 * A dead brain is the end of the run, not a failure to recover from.
 *
 * When every LLM provider is unreachable, the orchestrator used to hand the
 * failure to the PLANNER — which is itself an LLM call, on the engine that just
 * proved unreachable. Worse, the planner reads the failure TEXT, and that text
 * is Joe's advice to the USER:
 *
 *   «⚠️ تعذّر الوصول إلى محرّك الذكاء … شغّل Ollama محلياً … أو تحقّق من اتصال
 *    الإنترنت»
 *
 * It turned that advice into a task list and executed it. Measured in a real
 * session, after the user asked only to recolour a page: a seven-node plan whose
 * first step `check_internet` went to the BROWSER agent — opening a real browser
 * window and asking the user to intervene — and whose second, `run_ollama_locally`,
 * ran `ollama serve` in their terminal. The user's words: «فتح المتصفح لأسباب لا
 * أعلمها».
 *
 * Remediation text is written for a human to read. It must never be read back
 * as instructions.
 */

import { PROVIDER_FAILURE_PREFIX, isProviderFailure } from '../core/llm/intelligent-router';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');

describe('the message shown when no provider answers', () => {
    it('is recognised by the detector the orchestrator uses', () => {
        const real = `${PROVIDER_FAILURE_PREFIX} (لم يستجب أي مزوّد). لم أستطع تنفيذ الطلب.`;
        expect(isProviderFailure(real)).toBe(true);
    });

    it('is still recognised once something has wrapped it', () => {
        // By the time a failure reaches the recovery branch it usually reads
        // "Node build_page failed: …", which no longer STARTS with the prefix.
        const wrapped = `Node build_page failed: ${PROVIDER_FAILURE_PREFIX} (لم يستجب أي مزوّد).`;
        expect(isProviderFailure(wrapped)).toBe(false);          // anchored, by design
        expect(wrapped.includes(PROVIDER_FAILURE_PREFIX)).toBe(true);
    });
});

describe('the orchestrator refuses to plan its way out of an outage', () => {
    it('checks for a provider failure BEFORE attempting recovery', () => {
        const guard = SRC.indexOf('saysNoBrain(result.error)');
        const recover = SRC.indexOf('await this.attemptRecovery(');
        expect(guard).toBeGreaterThan(-1);
        expect(recover).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(recover);
    });

    it('matches a wrapped message, not only one that starts with the prefix', () => {
        expect(SRC).toContain('PROVIDER_FAILURE_PREFIX');
        expect(SRC).toMatch(/includes\(PROVIDER_FAILURE_PREFIX\)/);
    });

    it('ends the run rather than injecting repair nodes', () => {
        const block = SRC.slice(SRC.indexOf('if (saysNoBrain(result.error)'));
        // Engineering nodes may receive one bounded retry before this final return;
        // the dead brain must still end the run rather than inject repair nodes.
        expect(block).toMatch(/return \{ ok: false, result: result\.error/);
    });
});
