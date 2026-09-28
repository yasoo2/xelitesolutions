/**
 * A MENTION IS NOT AN ORDER.
 *
 * Observed in a real Joe UI run: asked «أجب بكلمة واحدة: اختبار»
 * (answer with one word: test), Joe routed to api_tester and asked for a
 * URL and method — the mentioned word was treated as an order to perform
 * the capability it names.
 *
 * Words the user marks as literal content-to-reproduce (quoted spans, or a
 * short tail after an explicit answer-colon) must not score as capability
 * evidence. The action verb lives outside the mention; real orders keep it.
 */
import { capableTools } from '../core/orchestrator/capability-match';

function names(request: string): string[] {
    return capableTools(request, 4).map(c => c.name);
}

describe('a mentioned word is content, not an order', () => {
    it('declines the observed answer-colon mention', () => {
        // Observed shape from the real UI run.
        expect(names('أجب بكلمة واحدة: اختبار')).toEqual([]);
    });

    it('declines fresh mention variants across tools and languages', () => {
        // Same grammar, unseen tool + language combinations.
        expect(names('Reply with exactly one word: testing')).not.toContain('api_tester');
        expect(names('Reply with exactly one word: testing')).not.toContain('auto_tester');
        expect(names('قل كلمة واحدة: انشر')).not.toContain('deploy_project');
        expect(names('Say the word "deploy" and nothing else')).not.toContain('deploy_project');
        expect(names('Answer with the word "database"')).not.toEqual(
            expect.arrayContaining([expect.stringMatching(/database|sql/)])
        );
        expect(names('أجب بهذه الكلمة: "اختبار"')).not.toContain('api_tester');
        expect(names('قل: مرحبا')).toEqual([]);
        expect(names('Say the phrase: hello world')).not.toContain('deploy_project');
    });

    it('matches whole utter-verbs, never substrings', () => {
        // «essay» contains «say» but orders no saying; the file-writing
        // verb outside the mention must still reach its tool.
        expect(names('Write an essay: hello world')).toContain('write_file');
    });

    it('keeps real orders that quote their data', () => {
        // The URL is data; the order (test the API) stands outside it.
        expect(names('Test the API at "https://example.com/health"')).toContain('api_tester');
        expect(names('اختبر الواجهة البرمجية على هذا الرابط')).toContain('api_tester');
        expect(names('انشر الموقع على صفحات الاستضافة')).toContain('deploy_project');
    });

    it('keeps colons that introduce a spec, not a literal', () => {
        // A long tail after the colon is a specification to act on.
        expect(
            names('Answer in detail: explain the deployment steps, the database schema, and the test plan').length
        ).toBeGreaterThan(0);
        // A colon after a non-utter verb is layout, not a mention marker.
        expect(names('حلّل المستودع: البنية والاعتماديات').length).toBeGreaterThan(0);
    });
});
