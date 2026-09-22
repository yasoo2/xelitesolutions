import { composeAnswer } from '../core/orchestrator/answerComposer';

const receipt = {
    version: 1,
    family: 'storage',
    selected: { id: 'storage-connect', route: 'account_connection', setup: 'CONNECT_ACCOUNT', reliability: 'UNKNOWN' },
    rankedAlternatives: [{ candidate: { id: 'storage-connect', route: 'account_connection', setup: 'CONNECT_ACCOUNT' } }],
    rejected: [{ id: 'storage-local', reasons: ['does not support the deployment target'] }],
    evidenceFreshness: 'stale_or_missing',
    requiredUserAction: 'CONNECT_ACCOUNT',
};

describe('capability decision delivery', () => {
    it('turns a route receipt into an inspectable user answer without claiming that action occurred', () => {
        const answer = composeAnswer([{ id: 'decision', tool: 'decide_capability_route', task: 'Choose a route', status: 'completed', result: { receipt, userAction: 'CONNECT_ACCOUNT' } }], 'en');
        expect(answer).toContain('account_connection (CONNECT_ACCOUNT)');
        expect(answer).toContain('storage-local: does not support the deployment target');
        expect(answer).toContain('Action required from you:** CONNECT_ACCOUNT.');
        expect(answer).toContain('No account was connected, key used, or payment made.');
    });

    it('keeps a compacted rejection reason inspectable instead of throwing during delivery', () => {
        const compacted = { ...receipt, rejected: [{ id: 'storage-local', reasons: 'does not support the deployment target' }] };
        expect(composeAnswer([{ id: 'decision', status: 'completed', result: { receipt: compacted } }], 'en'))
            .toContain('storage-local: does not support the deployment target');
    });

    it('renders the shallow runtime receipt without undefined alternatives', () => {
        const compact = {
            ...receipt,
            viableAlternatives: ['local (ZERO_SETUP)'],
            rejectedAlternatives: ['storage-local: does not support the deployment target'],
        };
        const answer = composeAnswer([{ id: 'decision', status: 'completed', result: { receipt: compact } }], 'en');
        expect(answer).toContain('Viable alternatives:** local (ZERO_SETUP)');
        expect(answer).not.toContain('undefined');
    });
});
