import { fileAppPackageJson, npmPackageNameForTest } from '../modules/tools/definitions/react-app-templates';

describe('generated npm metadata accepts every project writing system', () => {
    it('keeps an Arabic project buildable without changing its visible identity', () => {
        const first = npmPackageNameForTest('ميزانيتي');
        expect(first).toMatch(/^joe-app-[a-z0-9]+$/);
        expect(first).toBe(npmPackageNameForTest('ميزانيتي'));
        expect(first).not.toBe(npmPackageNameForTest('مواعيدي'));

        const manifest = JSON.parse(fileAppPackageJson('ميزانيتي', { deps: {} } as any));
        expect(manifest.name).toBe(first);
        expect(manifest.name).toMatch(/^[a-z0-9][a-z0-9._~-]*$/);
    });

    it('keeps readable Latin names when npm already accepts them', () => {
        expect(npmPackageNameForTest('Spend Wise')).toBe('spend-wise');
    });
});
