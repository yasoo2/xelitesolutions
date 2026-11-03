import { hasRequestedAction } from '../core/intelligence/requested-action';
import { classifyIntent } from '../core/intelligence/intent-classifier';

describe('requested-action consumer contract: the 5 permanent FAIL cases now PASS', () => {
    // Case 1: English polite build
    it('English polite build ("Can you create an inventory register...") → isBuild=true', async () => {
        const result = await classifyIntent('Can you create an inventory register with products, categories, and stock levels?');
        expect(result.isBuild).toBe(true);
        expect(result.isKnowledgeQuestion).toBe(false);
        expect(result.isReadOnly).toBe(false);
    });

    // Case 2: Arabic polite build
    it('Arabic polite build ("هل يمكنك إنشاء تطبيق مخزون...") → isBuild=true', async () => {
        const result = await classifyIntent('هل يمكنك إنشاء تطبيق مخزون مع منتجات وتصنيفات ومستويات مخزون؟');
        expect(result.isBuild).toBe(true);
        expect(result.isKnowledgeQuestion).toBe(false);
        expect(result.isReadOnly).toBe(false);
    });

    // Case 3: Calculator with targeted exclusions
    it('Calculator with targeted exclusions ("Build a calculator. Do not create a database or login page...") → isBuild=true', async () => {
        const result = await classifyIntent('Build a calculator. Do not create a database or login page.');
        expect(result.isBuild).toBe(true);
        expect(result.isKnowledgeQuestion).toBe(false);
        expect(result.isReadOnly).toBe(false);
    });

    // Case 4: Explain-then-build
    it('Explain-then-build ("Explain the approach briefly, then create a working unit converter...") → isBuild=true', async () => {
        const result = await classifyIntent('Explain the approach briefly, then create a working unit converter.');
        expect(result.isBuild).toBe(true);
        expect(result.isKnowledgeQuestion).toBe(false);
        expect(result.isReadOnly).toBe(false);
    });

    // Case 5: Long quoted spec with answer-only
    it('Long quoted spec with answer-only ("Explain this proposed specification without executing it... No file changes.") → routes to central_answer (isBuild=false)', async () => {
        const result = await classifyIntent('Explain this proposed specification without executing it: "Create a user management system with roles and permissions." No file changes.');
        expect(result.isBuild).toBe(false);
        expect(result.isKnowledgeQuestion).toBe(true);
        expect(result.isReadOnly).toBe(false);
    });
});