/**
 * CLAUDE IS PAID, AND RUNS ONLY WHEN THE USER CHOOSES IT.
 *
 * Measured on 2026-11-01 in Joe's interface: «Auto» sat in the FREE section
 * of the provider button and ran on Claude, because the deployment named
 * Claude as the engine's default; Claude's own entry was connected for the
 * user on the server's key; its model list was a fixed list in the code; and
 * a Claude key the user typed was refused by the free_only policy. The
 * owner's words: Claude is not free, the key needs credit bought for it.
 *
 * The flow he described, and what this file holds Joe to:
 *  - he opens Claude in the providers and puts his key: Joe asks Anthropic
 *    for the models his account offers, and lists them;
 *  - he picks a model and presses Connect: one tiny real call with that key
 *    and that model, through the budget guard, and green only if it answered;
 *  - Joe then runs on that model and that key, and every call is on a ledger;
 *  - Auto stays free: it is never Claude.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../core/engine/anthropic', () => {
    const actual = jest.requireActual('../core/engine/anthropic');
    return { ...actual, serverClaudeChat: jest.fn(actual.serverClaudeChat), listClaudeModels: jest.fn(actual.listClaudeModels) };
});

import * as anthropic from '../core/engine/anthropic';
import { claudeAccount, listClaudeModels, claudeModelRuns, CLAUDE_MODELS } from '../core/engine/anthropic';
import { keyLedger, priceRule, SpendLedger } from '../core/engine/budget';
import { providerModels } from '../core/engine/provider-models';

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-claude-paid-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const SERVER = { JOE_ENGINE_ANTHROPIC_API_KEY: 'sk-ant-server-owner', JOE_ENGINE_BUDGET_USD: '10', JOE_DATA_DIR: root } as NodeJS.ProcessEnv;

/** What Anthropic's Models API lists, as the SDK's iterator yields it. */
function modelsClient(rows: any[]) {
    return { models: { async *list() { yield* rows; } } };
}

describe('whose key a Claude call spends, and the ledger that guards it', () => {
    it('the key the user typed is theirs, on a ledger of its own named by a hash, never by the key', async () => {
        const account: any = await claudeAccount('sk-ant-users-own-key', SERVER);
        expect(account).toMatchObject({ apiKey: 'sk-ant-users-own-key', whose: 'user' });
        expect(account.ledger.file).toContain(path.join(root, 'engine-spend-keys'));
        expect(account.ledger.file).not.toMatch(/users-own-key/);
    });

    it('a typed key that is the server\'s key spends the owner\'s budget, whichever way it arrives', async () => {
        const typed: any = await claudeAccount('sk-ant-server-owner', SERVER);
        const named: any = await claudeAccount('server-key', SERVER);
        expect(typed.whose).toBe('server');
        expect(named.whose).toBe('server');
        expect(typed.ledger).toBe(named.ledger);
        expect(typed.ledger.totalBudgetUsd).toBe(10);
    });

    it('no key is no Claude: the server\'s key is never borrowed unasked', async () => {
        for (const k of [undefined, '', 'free-mode', 'auto-mode', 'مفتاح']) {
            expect(await claudeAccount(k, SERVER)).toMatchObject({ error: expect.stringMatching(/without a key\. Claude is paid/) });
        }
        expect(await claudeAccount('server-key', { JOE_DATA_DIR: root } as any)).toMatchObject({ error: expect.stringMatching(/without a key/) });
        expect(await claudeAccount('server-key', { JOE_ENGINE_ANTHROPIC_API_KEY: 'sk-ant-x' } as any)).toMatchObject({ error: expect.stringMatching(/server's budget.*JOE_ENGINE_BUDGET_USD/) });
    });

    it('a typed key\'s run still stops at the run budget; its total is the user\'s own credit unless the deployment caps it', async () => {
        const ledger = keyLedger('sk-ant-run-cap', SERVER);
        expect(ledger.runBudgetUsd).toBe(3);
        expect(ledger.totalBudgetUsd).toBe(Number.POSITIVE_INFINITY);
        await expect(ledger.reserve('run-1', 3.5)).rejects.toMatchObject({ code: 'ENGINE_BUDGET_EXHAUSTED' });
        const hold = await ledger.reserve('run-1', 0.2);
        await hold.charge({ at: 1, model: 'claude-haiku-5-5', costUsd: 0.05, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 } as any, purpose: 'step' });
        expect((await new SpendLedger(ledger.file, 1, 1).spent('run-1')).runUsd).toBeCloseTo(0.05);
        expect(keyLedger('sk-ant-capped', { ...SERVER, JOE_ENGINE_KEY_BUDGET_USD: '20' }).totalBudgetUsd).toBe(20);
    });
});

describe('the models the account offers, asked of Anthropic', () => {
    const ROWS = [
        { id: 'claude-opus-4-1', display_name: 'Claude Opus 4.1', lifecycle: 'retired', created_at: '2025-08-05T00:00:00Z' },
        { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', lifecycle: 'active', created_at: '2026-02-01T00:00:00Z' },
        { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', lifecycle: 'active', created_at: '2026-10-01T00:00:00Z' },
        { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', lifecycle: 'active', created_at: '2026-09-01T00:00:00Z' },
        { id: 'claude-fable-5-1', display_name: 'Claude Fable 5.1', lifecycle: 'active', created_at: '2026-10-15T00:00:00Z' },
        { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', lifecycle: 'active', created_at: '2026-10-01T00:00:00Z' },
        { id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5', lifecycle: 'deprecated', created_at: '2025-09-29T00:00:00Z' },
    ];

    it('the models Joe runs come first, cheapest first; the others follow, marked; retired ones are left out', async () => {
        const list = await listClaudeModels('sk-ant-x', modelsClient(ROWS));
        expect(list.map(m => [m.id, m.runs])).toEqual([
            ['claude-haiku-5-5', true], ['claude-sonnet-5-5', true], ['claude-opus-5-5', true], ['claude-fable-5-1', true],
            ['claude-sonnet-4-6', false], ['claude-sonnet-4-5', false],
        ]);
        expect(list[0].name).toBe('Claude Haiku 5.5');
    });

    it('every model Joe runs has a checked price, so the guard can hold its worst case', () => {
        for (const m of CLAUDE_MODELS) expect(priceRule(m)).toBeDefined();
        expect(claudeModelRuns('claude-haiku-5-5-20261001')).toBe(true);
        expect(claudeModelRuns('claude-haiku-4-5')).toBe(false);
        expect(claudeModelRuns('claude-opus-5')).toBe(false);
    });

    it('the provider panel gets the account\'s list with the key the user typed, and the key stays on the server', async () => {
        const seen: string[] = [];
        const out = await providerModels({ provider: 'anthropic', apiKey: 'sk-ant-users-own' }, {
            env: SERVER, claudeModels: async key => { seen.push(key); return listClaudeModels(key, modelsClient(ROWS)); },
        });
        expect(seen).toEqual(['sk-ant-users-own']);
        expect(out).toMatchObject({
            source: 'live',
            models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'],
            unsupported: ['claude-sonnet-4-6', 'claude-sonnet-4-5'],
            deprecated: ['claude-sonnet-4-5'],
            names: { 'claude-opus-5-5': 'Claude Opus 5.5' },
        });
        expect(JSON.stringify(out)).not.toMatch(/sk-ant-users-own/);
    });

    it('the server key lists only when asked for by name; a refused key says so with a code', async () => {
        const seen: string[] = [];
        const list = async (key: string) => { seen.push(key); return listClaudeModels(key, modelsClient(ROWS)); };
        expect(await providerModels({ provider: 'anthropic', apiKey: 'free-mode' }, { env: SERVER, claudeModels: list })).toMatchObject({ source: 'catalog', reason: { code: 'needs_key' } });
        expect(seen).toEqual([]);
        await providerModels({ provider: 'anthropic', apiKey: 'server-key' }, { env: SERVER, claudeModels: list });
        expect(seen).toEqual(['sk-ant-server-owner']);
        const refused = await providerModels({ provider: 'anthropic', apiKey: 'sk-ant-wrong' }, {
            env: SERVER, claudeModels: async () => { throw Object.assign(new Error('invalid x-api-key'), { status: 401 }); },
        });
        expect(refused).toMatchObject({ source: 'catalog', reason: { code: 'refused', status: 401 } });
    });
});

describe('Connect is one real call with that key and that model, through the guard', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const router = require('../api/routes/run').default;
    const verify = router.stack.find((e: any) => e.route?.path === '/verify' && e.route?.methods?.post).route.stack.at(-1).handle;
    const response = () => ({ statusCode: 200, body: undefined as any, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } });
    const mock = anthropic.serverClaudeChat as jest.Mock;

    it('green: the typed key ran the chosen model', async () => {
        mock.mockResolvedValueOnce('OK');
        const res = response();
        await verify({ auth: { sub: 'u1' }, body: { provider: 'anthropic', apiKey: 'sk-ant-users-own', model: 'claude-sonnet-5-5' } }, res);
        expect(res.body).toMatchObject({ ok: true, provider: 'anthropic', model: 'claude-sonnet-5-5' });
        expect(mock.mock.calls.at(-1)?.[1]).toBe('claude-sonnet-5-5');
        expect(mock.mock.calls.at(-1)?.[6]).toBe('sk-ant-users-own');
    });

    it('red, with the reason\'s code: no credit, a wrong key, a model Joe does not run', async () => {
        mock.mockRejectedValueOnce(Object.assign(new Error('Your credit balance is too low.'), { code: 'MODEL_BILLING' }));
        const billing = response();
        await verify({ auth: { sub: 'u1' }, body: { provider: 'anthropic', apiKey: 'sk-ant-no-credit', model: 'claude-haiku-5-5' } }, billing);
        expect(billing.body).toMatchObject({ ok: false, code: 'MODEL_BILLING' });

        const calls = mock.mock.calls.length;
        const notRun = response();
        await verify({ auth: { sub: 'u1' }, body: { provider: 'anthropic', apiKey: 'sk-ant-users-own', model: 'claude-haiku-4-5' } }, notRun);
        expect(notRun.body).toMatchObject({ ok: false, code: 'MODEL_NOT_RUN' });
        expect(mock.mock.calls.length).toBe(calls);
    });

    it('the check on every page load spends nothing: the key must list the chosen model', async () => {
        const list = anthropic.listClaudeModels as jest.Mock;
        const calls = mock.mock.calls.length;
        list.mockResolvedValueOnce([{ id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', runs: true, lifecycle: 'active' }]);
        const listed = response();
        await verify({ auth: { sub: 'u1' }, body: { provider: 'anthropic', apiKey: 'sk-ant-users-own', model: 'claude-haiku-5-5', light: true } }, listed);
        expect(listed.body).toMatchObject({ ok: true, detail: 'listed' });
        expect(list.mock.calls.at(-1)?.[0]).toBe('sk-ant-users-own');

        list.mockResolvedValueOnce([{ id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', runs: true, lifecycle: 'active' }]);
        const missing = response();
        await verify({ auth: { sub: 'u1' }, body: { provider: 'anthropic', apiKey: 'sk-ant-users-own', model: 'claude-opus-5-5', light: true } }, missing);
        expect(missing.body).toMatchObject({ ok: false, code: 'MODEL_NOT_FOUND' });

        list.mockRejectedValueOnce(Object.assign(new Error('invalid x-api-key'), { status: 401 }));
        const refused = response();
        await verify({ auth: { sub: 'u1' }, body: { provider: 'anthropic', apiKey: 'sk-ant-wrong', model: 'claude-haiku-5-5', light: true } }, refused);
        expect(refused.body).toMatchObject({ ok: false, code: 'MODEL_AUTH' });
        expect(mock.mock.calls.length).toBe(calls);
    });

    it('no key: refused before any call, saying Claude is paid', async () => {
        const res = response();
        const saved = process.env.JOE_ENGINE_ANTHROPIC_API_KEY;
        process.env.JOE_ENGINE_ANTHROPIC_API_KEY = 'sk-ant-server-owner';
        try {
            await verify({ auth: { sub: 'u1' }, body: { provider: 'anthropic', apiKey: 'free-mode', model: 'claude-haiku-5-5' } }, res);
        } finally {
            if (saved === undefined) delete process.env.JOE_ENGINE_ANTHROPIC_API_KEY; else process.env.JOE_ENGINE_ANTHROPIC_API_KEY = saved;
        }
        expect(res.body).toMatchObject({ ok: false, code: 'MODEL_AUTH', error: expect.stringMatching(/Claude is paid/) });
    });
});
