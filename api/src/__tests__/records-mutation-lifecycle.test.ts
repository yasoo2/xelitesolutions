import { fileAppStoreJs, fileRecordsAppJsx } from '../modules/tools/definitions/react-app-templates';

function deferred() {
    let resolve!: (value: any) => void;
    const promise = new Promise<any>(done => { resolve = done; });
    return { promise, resolve };
}

function harness(api: string | null = '/api/checkouts') {
    const source = fileRecordsAppJsx(false);
    const start = source.indexOf('  const submit =');
    const end = source.indexOf("  /** The parent's own name", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const state: any = {
        content: { api, doneValue: 'Yes' }, fields: [],
        statusField: { key: 'returned', options: ['No', 'Yes'] },
        rows: [], draft: { title: 'Test book', returned: 'No' }, editing: '', selected: null,
        error: '', server: Boolean(api), mutationLock: { current: false }, mutationBusy: false,
        blank: () => ({}), uid: () => 'local-test-id', invalidNumericField: () => null,
        invalidFieldMessage: () => 'Invalid numeric field',
        whyLocal: (result: any) => result?.ok === false ? 'Request failed' : '',
        mutationRefusal: new Function('refusalOf', `${source.slice(source.indexOf('function mutationRefusal('), source.indexOf('function invalidNumericField('))}; return mutationRefusal;`)(
            new Function(`${fileAppStoreJs().slice(fileAppStoreJs().indexOf('export function refusalOf('), fileAppStoreJs().indexOf('// ── THE TEAM')).replace('export ', '')}; return refusalOf;`)()),
        window: { confirm: jest.fn(() => true), scrollTo: jest.fn() },
        apiCreate: jest.fn(), apiUpdate: jest.fn(), apiDelete: jest.fn(),
    };
    for (const key of ['rows', 'draft', 'editing', 'selected', 'error', 'mutationBusy']) {
        state[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value: any) => {
            state[key] = typeof value === 'function' ? value(state[key]) : value;
        };
    }
    const actions = new Function('ctx', `with (ctx) { ${source.slice(start, end)}; return { submit, edit, remove, toggleDone }; }`)(state);
    return { state, actions, submit: () => actions.submit({ preventDefault() {} }) };
}

describe('generated record mutation lifecycle', () => {
    it.each([
        [{ ok: false, status: 401 }, 'sign in'],
        [{ ok: false, status: 403, error: 'read_only' }, 'read-only'],
        [{ ok: false, status: 403, error: 'not_your_row' }, 'not yours'],
        [{ ok: false, status: 403 }, 'permission'],
    ])('preserves the refusal reason for every mutation: %p', async (response, message) => {
        for (const action of ['create', 'update', 'remove', 'toggleDone']) {
            const { state, actions, submit } = harness();
            const row = { id: '42', title: 'Original', returned: 'No' };
            state.rows = [row];
            state.apiCreate.mockResolvedValue(response);
            state.apiUpdate.mockResolvedValue(response);
            state.apiDelete.mockResolvedValue(response);
            if (action === 'update') state.editing = row.id;
            if (action === 'create' || action === 'update') await submit();
            else await actions[action](row);
            expect(state.error).toContain(message);
            expect(state.error).toContain('Change not saved');
            expect(state.rows).toEqual([row]);
            expect(state.draft.title).toBe('Test book');
        }
    });
    it('rejects invalid input before either a local or remote mutation', async () => {
        const { state, submit } = harness();
        state.invalidNumericField = () => ({ min: 0 });
        await submit();
        expect(state.rows).toEqual([]);
        expect(state.apiCreate).not.toHaveBeenCalled();
        expect(state.error).toBe('Invalid numeric field');
    });
    it.each([{ item: { id: 42 } }, { row: { id: 42 } }, {}])('only accepts an actual create response object: %p', async body => {
        const source = fileAppStoreJs();
        const start = source.indexOf('export async function apiCreate(');
        const end = source.indexOf('\n}\n', start) + 2;
        const fetch = jest.fn(async () => ({ ok: true, json: async () => body }));
        const create = new Function('fetch', 'resolvedApi', 'authHeaders',
            `${source.slice(start, end).replace('export ', '')}; return apiCreate;`)(fetch, async (api: string) => api, () => ({}));
        const result = await create('/api/checkouts', { id: 'local-test-id' });
        expect(result.item).toEqual('item' in body ? body.item : 'row' in body ? body.row : null);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not expose a temporary row or allow handlers to mutate it before POST settles', async () => {
        const { state, actions, submit } = harness();
        const post = deferred();
        state.apiCreate.mockReturnValue(post.promise);
        const pending = submit();
        const temporary = { id: 'local-test-id', title: 'Test book', returned: 'No' };
        const before = [...state.rows];
        await actions.remove(temporary);
        await actions.toggleDone(temporary);
        actions.edit(temporary);
        await submit();
        post.resolve({ ok: true, item: { ...temporary, id: 42 } });
        await pending;
        expect(before).toEqual([]);
        expect(state.apiCreate).toHaveBeenCalledTimes(1);
        expect(state.apiDelete).not.toHaveBeenCalled();
        expect(state.apiUpdate).not.toHaveBeenCalled();
        expect(state.rows).toEqual([expect.objectContaining({ id: '42' })]);
        expect(state.editing).toBe('');
    });

    it.each([null, { ok: false, status: 403 }])('retains the row when DELETE fails: %p', async failure => {
        const { state, actions } = harness();
        const row = { id: '42', title: 'Keep me' };
        state.rows = [row];
        state.apiDelete.mockResolvedValue(failure);
        await actions.remove(row);
        expect(state.rows).toEqual([row]);
        expect(state.error).not.toBe('');
    });

    it('waits for server acknowledgement before changing returned state', async () => {
        const { state, actions } = harness();
        const row = { id: '42', returned: 'No' };
        state.rows = [row];
        const update = deferred();
        state.apiUpdate.mockReturnValue(update.promise);
        const pending = actions.toggleDone(row);
        const before = state.rows[0].returned;
        update.resolve({ ok: true });
        await pending;
        expect(before).toBe('No');
        expect(state.apiUpdate).toHaveBeenCalledWith('/api/checkouts', '42', { returned: 'Yes' });
        expect(state.rows[0].returned).toBe('Yes');
    });

    it('keeps the draft and reports rejected creation', async () => {
        const { state, submit } = harness();
        state.apiCreate.mockResolvedValue({ ok: false, status: 401 });
        await submit();
        expect(state.rows).toEqual([]);
        expect(state.draft.title).toBe('Test book');
        expect(state.error).not.toBe('');
    });

    it.each([null, { ok: true, item: null }, { ok: true, item: {} }])('rejects an unconfirmed create response: %p', async response => {
        const { state, submit } = harness();
        state.apiCreate.mockResolvedValue(response);
        await submit();
        expect(state.rows).toEqual([]);
        expect(state.draft.title).toBe('Test book');
        expect(state.error).not.toBe('');
        expect(state.mutationLock.current).toBe(false);
    });

    it('keeps edits and existing data on update failure, then permits retry', async () => {
        const { state, submit } = harness();
        state.rows = [{ id: '42', title: 'Original' }];
        state.editing = '42';
        state.draft = { title: 'Edited' };
        state.apiUpdate.mockRejectedValueOnce(new Error('network down'));
        await submit();
        expect(state.rows[0].title).toBe('Original');
        expect(state.draft.title).toBe('Edited');
        expect(state.editing).toBe('42');
        expect(state.error).not.toBe('');
        expect(state.mutationBusy).toBe(false);
        state.apiUpdate.mockResolvedValue({ ok: true });
        await submit();
        expect(state.rows[0].title).toBe('Edited');
        expect(state.editing).toBe('');
    });

    it('keeps returned state unchanged when the server refuses it', async () => {
        const { state, actions } = harness();
        state.rows = [{ id: '42', returned: 'No' }];
        state.apiUpdate.mockResolvedValue({ ok: false, status: 403 });
        await actions.toggleDone(state.rows[0]);
        expect(state.rows[0].returned).toBe('No');
        expect(state.error).not.toBe('');
        expect(state.mutationLock.current).toBe(false);
    });

    it('removes the row and ends editing only after DELETE acknowledgement', async () => {
        const { state, actions } = harness();
        const row = { id: '42', title: 'Test only' };
        state.rows = [row];
        state.editing = '42';
        const deletion = deferred();
        state.apiDelete.mockReturnValue(deletion.promise);
        const pending = actions.remove(row);
        expect(state.rows).toEqual([row]);
        expect(state.editing).toBe('42');
        await actions.toggleDone(row);
        expect(state.apiUpdate).not.toHaveBeenCalled();
        deletion.resolve({ ok: true });
        await pending;
        expect(state.rows).toEqual([]);
        expect(state.editing).toBe('');
    });

    it('keeps local-only create, toggle and delete working without HTTP', async () => {
        const { state, actions, submit } = harness(null);
        await submit();
        expect(state.rows).toHaveLength(1);
        await actions.toggleDone(state.rows[0]);
        expect(state.rows[0].returned).toBe('Yes');
        await actions.remove(state.rows[0]);
        expect(state.rows).toEqual([]);
        expect(state.apiCreate).not.toHaveBeenCalled();
        expect(state.apiUpdate).not.toHaveBeenCalled();
        expect(state.apiDelete).not.toHaveBeenCalled();
    });
});
