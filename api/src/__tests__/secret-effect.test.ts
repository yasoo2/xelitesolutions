import {
    compareSecretValue,
    ensureSecretValue,
    secretMismatchDetail,
    type FieldOps,
} from '../modules/browser/actionVerification';

function fakeField(initial: string | null, opts: { throwOnRead?: boolean; freeze?: boolean } = {}): FieldOps & { sets: string[] } {
    let value: string | null = initial;
    const sets: string[] = [];
    return {
        sets,
        read: async () => {
            if (opts.throwOnRead) throw new Error('detached');
            return value;
        },
        clearAndSet: async (text: string) => {
            sets.push(text);
            if (!opts.freeze) value = text;
        },
    };
}

describe('secret-with-locator effect evidence', () => {
    describe('compareSecretValue', () => {
        it('matches an exactly applied secret', () => {
            expect(compareSecretValue('harbor-lantern-7', 'harbor-lantern-7')).toEqual({ match: true, readOk: true });
        });

        it('names a transformed value as not applied', () => {
            expect(compareSecretValue('HARBOR-LANTERN-7', 'harbor-lantern-7')).toEqual({ match: false, readOk: true });
        });

        it('reports an unreadable field without claiming a mismatch verdict', () => {
            expect(compareSecretValue(null, 'harbor-lantern-7')).toEqual({ match: false, readOk: false });
            expect(compareSecretValue(undefined, 'harbor-lantern-7')).toEqual({ match: false, readOk: false });
        });

        it('carries booleans only: no lengths, no values', () => {
            expect(Object.keys(compareSecretValue('a', 'b')).sort()).toEqual(['match', 'readOk']);
        });
    });

    describe('ensureSecretValue', () => {
        it('accepts a first-read match without any repair', async () => {
            const field = fakeField('quay-cipher-3');
            const result = await ensureSecretValue(field, 'quay-cipher-3');
            expect(result).toEqual({ match: true, readOk: true, repaired: false });
            expect(field.sets).toEqual([]);
        });

        it('repairs once and confirms when the repair lands', async () => {
            const field = fakeField('stale');
            const result = await ensureSecretValue(field, 'quay-cipher-3');
            expect(result).toEqual({ match: true, readOk: true, repaired: true });
            expect(field.sets).toEqual(['quay-cipher-3']);
        });

        it('reports a persistent mismatch after exactly one repair', async () => {
            const field = fakeField('stale', { freeze: true });
            const result = await ensureSecretValue(field, 'quay-cipher-3');
            expect(result).toEqual({ match: false, readOk: true, repaired: true });
            expect(field.sets).toHaveLength(1);
        });

        it('reports an unreadable field without attempting repair', async () => {
            const field = fakeField('quay-cipher-3', { throwOnRead: true });
            const result = await ensureSecretValue(field, 'quay-cipher-3');
            expect(result).toEqual({ match: false, readOk: false, repaired: false });
            expect(field.sets).toEqual([]);
        });

        it('lets a throwing repair propagate so the caller classifies the real error', async () => {
            const field = fakeField('stale');
            field.clearAndSet = async () => { throw new Error('field detached mid-repair'); };
            await expect(ensureSecretValue(field, 'quay-cipher-3')).rejects.toThrow('field detached mid-repair');
        });

        it('result shape carries booleans only: no lengths, no values', async () => {
            const field = fakeField('stale');
            const result = await ensureSecretValue(field, 'quay-cipher-3');
            expect(Object.keys(result).sort()).toEqual(['match', 'readOk', 'repaired']);
        });
    });

    describe('secretMismatchDetail', () => {
        it('names the cure without lengths', () => {
            expect(secretMismatchDetail(false)).toBe('value_mismatch redacted');
        });

        it('notes the single repair without lengths', () => {
            expect(secretMismatchDetail(true)).toBe('value_mismatch redacted repaired_once');
        });

        it('contains no digits that could be lengths', () => {
            expect(secretMismatchDetail(false)).not.toMatch(/\d/);
            expect(secretMismatchDetail(true)).not.toMatch(/\d/);
        });
    });
});
