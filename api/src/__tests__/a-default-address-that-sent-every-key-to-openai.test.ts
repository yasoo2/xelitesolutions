/**
 * AN UNKNOWN PROVIDER DID NOT FAIL — IT QUIETLY WENT TO OPENAI, CARRYING THE
 * USER'S KEY.
 *
 * The owner asked one question: «so if I choose any provider, does the system
 * work correctly?» I audited all eleven entries in his providers menu, end to
 * end, and four of them failed:
 *
 *     deepseek   its API IS OpenAI-compatible; Joe resolved NO address for it,
 *                so the SDK defaulted to api.openai.com and posted a DeepSeek
 *                key to OpenAI
 *     grok       address came from the UI alone; without it, the same silent
 *                fall to api.openai.com
 *     anthropic  not OpenAI-compatible at all — repaired separately
 *     hack       not a provider: `let hack: any = pollinationsProvider` and
 *                never referenced again
 *
 * ⛔ THREE OF THE FOUR SHARE ONE ROOT, and it was a ternary that knew two
 * vendors:
 *
 *     effectiveBaseUrl = cfgBaseUrl?.trim() ||
 *         (openrouter ? … : gemini|google ? … : undefined)
 *
 * `undefined` is not «no address» to the OpenAI SDK — it is
 * `https://api.openai.com/v1`. So a provider the ternary had never heard of
 * did not error: it went somewhere else with the user's key and came back with
 * a 401 that reads exactly like a wrong key.
 *
 * ⛔ THE CLASS is the most expensive one in this repository: a signal that
 * looks like the user's fault when it is ours. He pastes a valid key, is told
 * it is invalid, and has no way to learn that Joe posted it to another
 * company.
 *
 * The negatives below matter more than the positives: the UI must still win,
 * and an unknown name must still resolve to nothing rather than to OpenAI.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'),
    'utf-8',
);

/** The table as the source really declares it. */
const TABLE = SRC.slice(SRC.indexOf('const VENDOR_BASE'), SRC.indexOf('const effectiveBaseUrl'));

describe('every vendor Joe offers resolves to its own address', () => {
    it('⛔ POSITIVE — the two that broke now have real addresses', () => {
        expect(TABLE).toMatch(/deepseek:\s*'https:\/\/api\.deepseek\.com'/);
        expect(TABLE).toMatch(/grok:\s*'https:\/\/api\.x\.ai\/v1'/);
    });

    it('POSITIVE — and the ones that already worked keep theirs, unchanged', () => {
        expect(TABLE).toMatch(/openrouter:\s*'https:\/\/openrouter\.ai\/api\/v1'/);
        expect(TABLE).toMatch(/gemini:\s*'https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\/'/);
        expect(TABLE).toMatch(/google:\s*'https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\/'/);
    });

    it('POSITIVE — the rest of the menu is covered too', () => {
        //  A table that fixed only the two reported failures would leave the
        //  next provider to fall into api.openai.com the same way.
        for (const id of ['groq', 'mistral', 'cerebras', 'openai']) {
            expect({ id, present: new RegExp(id + ":\\s*'https://").test(TABLE) })
                .toEqual({ id, present: true });
        }
    });

    it('⛔ NEGATIVE — the UI still wins when it sends an address', () => {
        //  The table is a floor, never an override. A user pointing a provider
        //  at a proxy or a self-hosted gateway must keep that.
        expect(SRC).toMatch(/const effectiveBaseUrl = cfgBaseUrl\?\.trim\(\) \|\| VENDOR_BASE\[/);
    });

    it('⛔ NEGATIVE — an unknown provider resolves to NOTHING, not to OpenAI', () => {
        //  The whole defect, stated as the property that must hold. If a name
        //  Joe does not know silently mapped to a default host, the repair
        //  would have preserved the bug behind a nicer table.
        expect(SRC).toMatch(/VENDOR_BASE\[String\(cfgProvider \|\| ''\)\.toLowerCase\(\)\] \|\| undefined/);
        expect(TABLE).not.toMatch(/default:/);
    });

    it('NEGATIVE — the lookup is case-insensitive, so «DeepSeek» is «deepseek»', () => {
        //  A menu value that differs only in case would fall through to
        //  undefined — the same silent trip to OpenAI, one keystroke away.
        expect(SRC).toContain(".toLowerCase()]");
    });

    it('NEGATIVE — and anthropic is NOT in this table', () => {
        //  It does not speak this protocol. Listing it here would send a
        //  Claude key to an OpenAI-shaped client — the exact failure that
        //  reads like a bad key, reintroduced by a well-meant table.
        expect(TABLE).not.toMatch(/anthropic:/);
        expect(SRC).toMatch(/cfgProvider === 'anthropic' \|\| cfgProvider === 'claude'/);
    });
});
