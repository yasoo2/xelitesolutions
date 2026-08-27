/**
 * A PROVIDER NAMED IN THREE PLACES AND BUILT IN NONE.
 *
 * The owner: «I want to run Joe on a Claude provider through the providers
 * button — what do you think?» And then, describing what he expected: «there
 * is a providers button in the send box; you press it, you choose a provider,
 * and the system must work correctly according to what you chose. Is that
 * right?»
 *
 * It is right, and the path he described exists end to end:
 *
 *     CommandComposer.tsx:1053   selectedProvider
 *          ->  api/routes/run.ts:279   modelConfig: { provider, model, apiKey, baseUrl }
 *          ->  AgentLoopService.ts:466 options.modelConfig
 *          ->  intelligent-router      Custom Route: Provider=…
 *
 * ⛔ BUT ONE OF THE NAMES ON THAT MENU HAD NOTHING BEHIND IT. Measured before
 * answering him:
 *
 *     intelligent-router.ts:21     provider: 'groq'|'openrouter'|'anthropic'|…
 *     intelligent-router.ts:2520   case 'anthropic': -> 'no_key: مزوّد مدفوع'
 *     core/llm/providers/          no anthropic.ts at all
 *     intelligent-router.ts:1544   new OpenAI({ apiKey, baseURL })
 *
 * Declared in three places, built in none — this repository's most repeated
 * class in its purest form. And the failure it would have produced is the
 * cruel kind: the custom route builds an OpenAI client, Anthropic's Messages
 * API is not OpenAI-compatible, so a correct key would have failed with a 400
 * that reads exactly like a wrong key.
 *
 * Four differences make that so, and each is asserted below, because each one
 * alone is enough to break it: `x-api-key` rather than a bearer token, an
 * `anthropic-version` header, the system prompt as a TOP-LEVEL string rather
 * than a message in the array, and `max_tokens` as a REQUIRED field.
 */

import fs from 'fs';
import path from 'path';
import { AnthropicProvider } from '../core/llm/providers/anthropic';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
const PROVIDER = SRC('core/llm/providers/anthropic.ts');
const ROUTER = SRC('core/llm/intelligent-router.ts');

describe('the provider behind the name really exists', () => {
    it('⛔ POSITIVE — the router reaches it BEFORE it builds an OpenAI client', () => {
        //  Order is the whole fix: below this point everything is OpenAI-shaped.
        const at = ROUTER.indexOf("cfgProvider === 'anthropic'");
        const openai = ROUTER.indexOf('new OpenAI({');
        expect({ found: at > 0, beforeTheOpenAIClient: at > 0 && at < openai })
            .toEqual({ found: true, beforeTheOpenAIClient: true });
    });

    it('POSITIVE — and «claude» reaches it too, since that is what he calls it', () => {
        expect(ROUTER).toMatch(/cfgProvider === 'anthropic' \|\| cfgProvider === 'claude'/);
    });

    it('⛔ POSITIVE — it speaks the Messages API, not the OpenAI one', () => {
        //  The four differences that make an OpenAI-shaped call fail.
        expect(PROVIDER).toContain("'x-api-key'");
        expect(PROVIDER).toContain("'anthropic-version'");
        expect(PROVIDER).toMatch(/max_tokens:/);
        expect(PROVIDER).not.toMatch(/Authorization.*Bearer/);
    });

    it('⛔ POSITIVE — the system prompt is lifted OUT of the message array', () => {
        //  Anthropic takes it as a top-level string. Leaving it in the array is
        //  a 400 that reads like a malformed request rather than a misplaced
        //  field, so the split is explicit and tested rather than trusted.
        const p = new AnthropicProvider('k') as any;
        const { system, turns } = p.split([
            { role: 'system', content: 'you are careful' },
            { role: 'user', content: 'build me a shop' },
            { role: 'assistant', content: 'ok' },
        ]);
        expect(system).toBe('you are careful');
        expect(turns).toEqual([
            { role: 'user', content: 'build me a shop' },
            { role: 'assistant', content: 'ok' },
        ]);
    });

    it('NEGATIVE — no key means it says so, rather than sending an empty header', () => {
        expect(new AnthropicProvider('').isAvailable()).toBe(false);
        expect(new AnthropicProvider('dummy').isAvailable()).toBe(false);
        expect(new AnthropicProvider('free-mode').isAvailable()).toBe(false);
        expect(new AnthropicProvider('sk-ant-real').isAvailable()).toBe(true);
    });

    it('⛔ NEGATIVE — a request with nothing to send is refused, not padded', () => {
        //  Inventing a message to satisfy the API would be Joe speaking for
        //  him — the class this repository spent a day removing.
        return expect(new AnthropicProvider('k').chatComplete([{ role: 'system', content: 'x' }]))
            .rejects.toThrow(/nothing to send/);
    });

    it('NEGATIVE — an error keeps the body, so a diagnosis has something to read', () => {
        //  «the provider did not work» is not a report. The status and the
        //  server's own words are what separate a bad key from a bad model
        //  name from a rate limit.
        expect(PROVIDER).toMatch(/Anthropic \$\{res\.status\}: \$\{detail/);
    });

    it('NEGATIVE — an empty answer is an error, never a success', () => {
        //  A stop_reason with no text is a real statement about a refusal or a
        //  truncation. Returning '' would make it look like a clean empty
        //  reply — a signal that looks like success, which is the most
        //  expensive class in this repository.
        expect(PROVIDER).toMatch(/returned no text \(stop_reason/);
    });
});
