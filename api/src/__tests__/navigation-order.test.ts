import { claimNavigation } from '../modules/browser/navigation-order';

describe('page-scoped navigation ownership', () => {
    it('invalidates the older request without letting its cleanup clear the latest', () => {
        const page = {};
        const older = claimNavigation(page);
        expect(older.isCurrent()).toBe(true);
        const latest = claimNavigation(page);
        expect(older.isCurrent()).toBe(false);
        older.release();
        expect(latest.isCurrent()).toBe(true);
        latest.release();
        expect(latest.isCurrent()).toBe(false);
        expect(older.isCurrent()).toBe(false);
    });

    it('does not supersede another page or user', () => {
        const first = claimNavigation({});
        const second = claimNavigation({});
        first.release();
        expect(second.isCurrent()).toBe(true);
        second.release();
    });

    it('does not revive an older navigation after the newest completes', async () => {
        const page = {};
        const older = claimNavigation(page);
        await Promise.resolve();
        const latest = claimNavigation(page);
        latest.release();
        await Promise.resolve();
        expect(older.isCurrent()).toBe(false);
    });
});
