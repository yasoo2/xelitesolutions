/**
 * A 429 is a limit to wait out unless its words say the ACCOUNT is empty.
 * Review of r41-providers: Groq's per-minute limit links
 * console.groq.com/settings/billing and OpenAI's free tier links account/billing;
 * read as «no credit», the run stopped at the first limit on a free key.
 */
import { providerErrorCode } from '../core/llm/run-model-choice';

const GROQ_TPM = 'Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 12000, Used 11800, Requested 900. Please try again in 3.2s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing';
const OPENAI_RPM = 'Rate limit reached for gpt-4o-mini in organization org-x on requests per min (RPM): Limit 3, Used 3, Requested 1. Please try again in 20s. Visit https://platform.openai.com/account/rate-limits to learn more. You can increase your rate limit by adding a payment method to your account at https://platform.openai.com/account/billing.';
const OPENAI_EMPTY = 'You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. (insufficient_quota)';

describe('a rate limit that links a billing page is still a limit', () => {
    it('Groq per-minute 429 with a billing link → a limit to wait out', () => {
        expect(providerErrorCode(429, GROQ_TPM, false, 'groq')).toBe('PROVIDER_QUOTA');
    });
    it('OpenAI free-tier per-minute 429 with an account/billing link → a limit to wait out', () => {
        expect(providerErrorCode(429, OPENAI_RPM, false, 'openai')).toBe('PROVIDER_QUOTA');
    });
    it('OpenAI insufficient_quota 429 → the account is empty', () => {
        expect(providerErrorCode(429, OPENAI_EMPTY, false, 'openai')).toBe('PROVIDER_BILLING');
    });
    it('402 is always billing; Gemini 429 stays a limit', () => {
        expect(providerErrorCode(402, 'Payment Required', false, 'openrouter')).toBe('PROVIDER_BILLING');
        expect(providerErrorCode(429, 'You exceeded your current quota, please check your plan and billing details', false, 'gemini')).toBe('PROVIDER_QUOTA');
    });
});
