/**
 * "DONE" IS A CLAIM, AND A CLAIM IS CHECKED.
 *
 * task_finish does not end the run. It hands the model's claim to Joe's
 * delivery checks, and the run is delivered only if they pass. A failed
 * check comes back to the model as an observation, with the measurement that
 * failed, and the loop goes on. The model cannot talk its way past a check:
 * the verdict is computed from files, commands, the served page and the
 * acceptance judge, never from the summary it wrote.
 */
import type { EngineTool, ParseResult, ToolContext, VerificationReport } from './types';
import { parseSignInAccount, type SignInAccount } from '../quality/sign-in';
import { parseRoleAccounts, type RoleAccount } from '../quality/role-probe';

export interface FinishArgs {
    summary: string;
    how_to_run?: string;
    url?: string;
    evidence?: { id: string; evidence: string }[];
    /**
     * An account the project seeds, for a system behind a sign-in. It is not
     * a claim about the work: Joe types it into the product's own sign-in
     * form and tests the screens behind it, and a wrong one fails to sign in
     * (core/quality/sign-in.ts).
     */
    sign_in?: SignInAccount;
    /** One seeded account per role, for a system whose roles have their own permissions (core/quality/role-probe.ts). */
    accounts?: RoleAccount[];
}

export type Verifier = (ctx: ToolContext, claim: FinishArgs) => Promise<VerificationReport>;

export function parseFinishArgs(raw: unknown): ParseResult<FinishArgs> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'task_finish takes {"summary": "...", "how_to_run": "...", "url": "...", "evidence": [{"id": "R1", "evidence": "..."}]}.' };
    const a = raw as Record<string, unknown>;
    const summary = String(a.summary ?? '').trim();
    if (!summary) return { ok: false, error: 'task_finish needs a "summary" of what you built, in the request\'s language.' };
    const out: FinishArgs = { summary: summary.slice(0, 4_000) };
    if (a.how_to_run != null) out.how_to_run = String(a.how_to_run).slice(0, 2_000);
    if (a.url != null && String(a.url).trim()) out.url = String(a.url).trim();
    if (a.evidence != null) {
        if (!Array.isArray(a.evidence)) return { ok: false, error: '"evidence" must be a list like [{"id": "R1", "evidence": "the form adds a row; seen in browser_act"}].' };
        out.evidence = a.evidence
            .map((e: any) => ({ id: String(e?.id ?? '').trim().toUpperCase(), evidence: String(e?.evidence ?? '').slice(0, 600) }))
            .filter(e => /^R\d+$/.test(e.id));
    }
    if (a.sign_in != null) {
        const account = parseSignInAccount(a.sign_in);
        if (!account) return { ok: false, error: '"sign_in" must be an account the project seeds, like {"username": "admin", "password": "…"} (or "email" in place of "username").' };
        out.sign_in = account;
    }
    if (a.accounts != null) {
        const accounts = parseRoleAccounts(a.accounts);
        if (!accounts) return { ok: false, error: '"accounts" must list one account the project seeds for each role, like [{"username": "admin", "password": "…", "role": "admin"}, {"username": "reception", "password": "…", "role": "receptionist"}].' };
        out.accounts = accounts;
    }
    return { ok: true, value: out };
}

export function reportText(report: VerificationReport): string {
    const lines = [report.passed ? 'VERIFIED: every check passed. The run is delivered.' : 'NOT VERIFIED. Fix what failed, then call task_finish again.'];
    for (const c of report.checks) {
        const mark = c.status === 'passed' ? 'ok  ' : c.status === 'failed' ? 'FAIL' : 'skip';
        lines.push(`${mark} ${c.id}: ${c.detail}`);
    }
    if (report.unproven.length) {
        lines.push('Not proven yet:');
        for (const u of report.unproven) lines.push(`  ${u.id} ${u.text}: ${u.reason}`);
    }
    return lines.join('\n');
}

export function finishTool(verify: Verifier): EngineTool<FinishArgs> {
    return {
        name: 'task_finish',
        description: 'Claim the work is complete. Joe then runs its delivery checks on the project: the files, the build, the served page, and every requirement against the source and the page. If every check passes, the run is delivered. If not, you get the failed checks; fix them and call task_finish again. Give a short summary in the request\'s language, how to run the project, the address you tested, and evidence per requirement id. If the system has a sign-in, give an account it seeds in sign_in: Joe signs in with it through the product\'s own sign-in form and tests the screens behind it.',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: 'What was built, in the request\'s language.' },
                how_to_run: { type: 'string', description: 'The commands that install and start it.' },
                url: { type: 'string', description: 'The address you opened and tested.' },
                evidence: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { id: { type: 'string' }, evidence: { type: 'string' } },
                        required: ['id', 'evidence'],
                    },
                },
                sign_in: {
                    type: 'object',
                    description: 'For a system with a sign-in: an account the project seeds (the one with the widest access). Joe signs in with it through the product\'s own form.',
                    properties: {
                        username: { type: 'string', description: 'What the sign-in form\'s first field takes: a username, an email or a phone number.' },
                        password: { type: 'string' },
                    },
                    required: ['username', 'password'],
                },
                accounts: {
                    type: 'array',
                    description: 'For a system whose roles have their own permissions: one account the project seeds for each role. Joe signs in as each and checks that what a role\'s screens hide from it, the server refuses it.',
                    items: {
                        type: 'object',
                        properties: {
                            username: { type: 'string' },
                            password: { type: 'string' },
                            role: { type: 'string', description: 'The role this account has, in the project\'s own words.' },
                        },
                        required: ['username', 'password', 'role'],
                    },
                },
            },
            required: ['summary'],
        },
        parse: parseFinishArgs,
        async run(args, ctx) {
            const report = await verify(ctx, args);
            ctx.state.verifications.push(report);
            ctx.emit({ type: 'verification', report });
            return { ok: report.passed, output: reportText(report), facts: { verification: report } };
        },
    };
}
