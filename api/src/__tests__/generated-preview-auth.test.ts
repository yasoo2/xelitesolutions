import vm from 'vm';
import { transformSync } from 'esbuild';
import { fileAppStoreJs } from '../modules/tools/definitions/react-app-templates';

const code = transformSync(fileAppStoreJs(), { format: 'cjs' }).code;

function openStore(pathname: string, storage: Map<string, string>, token: string) {
    const fetch = jest.fn(async (url: string, _options?: { headers?: Record<string, string> }) => ({
        ok: url !== '/api/health',
        json: async () => ({ token, user: { role: 'owner' }, items: [] }),
    }));
    const module = { exports: {} as any };
    vm.runInNewContext(code, {
        module, exports: module.exports, fetch,
        location: { pathname },
        localStorage: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
        },
    });
    return { store: module.exports, fetch };
}

it('keeps preview tokens and roles separate while preserving navigation and reload', async () => {
    const storage = new Map<string, string>([['joe:auth', 'unrelated-root-token']]);
    const first = openStore('/project-preview/first/index.html', storage, 'first-token');
    const second = openStore('/project-preview/second/index.html', storage, 'second-token');
    expect(first.store.getToken()).toBe('');
    await first.store.apiLogin('/api/items', 'test@example.invalid', 'test-password');
    expect(second.store.getToken()).toBe('');
    expect(second.store.getRole()).toBe('');
    await second.store.apiList('/api/items');
    expect(second.fetch.mock.calls[second.fetch.mock.calls.length - 1]?.[1]?.headers?.Authorization).toBeUndefined();
    await second.store.apiLogin('/api/items', 'test@example.invalid', 'test-password');
    const navigated = openStore('/project-preview/first/admin', storage, 'unused');
    expect(navigated.store.getToken()).toBe('first-token');
    expect(navigated.store.getRole()).toBe('owner');
    await navigated.store.apiList('/api/items');
    expect(navigated.fetch.mock.calls[navigated.fetch.mock.calls.length - 1]?.[1]?.headers?.Authorization).toBe('Bearer first-token');
    navigated.store.apiLogout();
    expect(first.store.getToken()).toBe('');
    expect(second.store.getToken()).toBe('second-token');
    expect(storage.get('joe:auth')).toBe('unrelated-root-token');
});

it('keeps deployed root and admin routes on the same origin session', async () => {
    const storage = new Map<string, string>();
    const root = openStore('/', storage, 'root-token');
    await root.store.apiLogin('/api/items', 'test@example.invalid', 'test-password');
    expect(openStore('/admin', storage, 'unused').store.getToken()).toBe('root-token');
});
