/**
 * «CRITICAL: All LLM providers failed» — WITH NO REASON UNDER IT.
 *
 * From his running system, with Groq connected and paid for:
 *
 *     [brain] Groq متصل — الدماغ الأساسي (Llama 3.3 70B)
 *     [IntelligentRouter] 🔄 Attempting provider: Groq (Free)...
 *     [IntelligentRouter] 🔄 Attempting provider: LLM7 (Keyless)...
 *
 * Groq was tried and abandoned between those two lines and never said why.
 * Every HARD failure printed its reason; a SOFT failure — the provider replied,
 * but with nothing usable — printed nothing at all. He has been reading «all
 * providers failed» for weeks with the cause hidden on the one provider he
 * actually relies on.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf-8');

describe('every way a provider can fail says so out loud', () => {
    it('a hard failure names the provider and the error', () => {
        expect(SRC).toMatch(/console\.warn\(`\[IntelligentRouter\] \$\{p\.name\} failed or timed out: \$\{e\.message\}/);
    });

    it('and a SOFT failure — an empty or too-short reply — no longer passes in silence', () => {
        expect(SRC).toMatch(/console\.warn\(`\[IntelligentRouter\] \$\{p\.name\} answered but the reply was unusable/);
        // It reports the sizes, so «empty» and «two characters» are told apart.
        expect(SRC).toContain('raw → ');
        expect(SRC).toContain('clean');
    });

    it('the log line sits with the markProviderFailed it explains', () => {
        const at = SRC.indexOf('answered but the reply was unusable');
        const mark = SRC.indexOf('markProviderFailed(p.name);', at);
        expect(at).toBeGreaterThan(-1);
        expect(mark - at).toBeLessThan(600);
    });

    it('and success is still announced, so the log reads as a decision either way', () => {
        expect(SRC).toMatch(/console\.info\(`\[IntelligentRouter\] ✅ Success via \$\{p\.name\}/);
    });
});
