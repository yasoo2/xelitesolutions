import {
    capabilityFromRequest,
    externalDataAppSource,
    integrationPlanFromSelection,
    resolveProxyClientUrl,
} from '../core/api-discovery/integration';
import { transformSync } from 'esbuild';
import type { ApiSelectionArtifact, RankedApiCandidate } from '../core/api-discovery/types';
import { selectValidatedCandidate } from '../modules/tools/definitions/PublicApiDiscoveryTools';

const selected = (capability: 'currency' | 'ip', profile: string): ApiSelectionArtifact => ({
    version: 1,
    apiId: `test-${capability}`,
    integrationProfileId: profile,
    providerName: capability === 'currency' ? 'Frankfurter' : 'ipapi.co',
    source: 'public-apis/public-apis',
    auth: 'none',
    cors: 'yes',
    pricing: 'UNKNOWN',
    health: 'HEALTHY',
    reasons: ['Exact capability match'],
    warnings: [],
    requiredEnvNames: [],
});

const executableGeneratedApp = (source: string, load: jest.Mock) => {
    const state: any[] = [];
    let cursor = 0;
    const React = {
        createElement: (type: any, props: any, ...children: any[]) => ({
            type,
            props: { ...(props || {}), children },
        }),
        useEffect: () => undefined,
        useState: (initial: any) => {
            const slot = cursor++;
            if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
            return [state[slot], (next: any) => {
                state[slot] = typeof next === 'function' ? next(state[slot]) : next;
            }];
        },
    };
    const compiled = transformSync(source, { loader: 'jsx', format: 'cjs', target: 'node18' }).code;
    const module = { exports: {} as any };
    const localRequire = (id: string) => {
        if (id === 'react') return { __esModule: true, default: React, ...React };
        if (id.endsWith('/integrations/externalApi.js')) return { externalApi: { load } };
        if (id.endsWith('.css')) return {};
        throw new Error(`Unexpected generated-app import: ${id}`);
    };
    new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
    return () => {
        cursor = 0;
        return module.exports.default();
    };
};

const findNode = (node: any, predicate: (candidate: any) => boolean): any => {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of node.props?.children || []) {
        const found = findNode(child, predicate);
        if (found) return found;
    }
    return undefined;
};

const renderedText = (node: any): string => {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    return (node.props?.children || []).map(renderedText).join(' ');
};

describe('issue #86 live acceptance follow-up', () => {
    it('recognises external-data intent without requiring the user to say API', () => {
        expect(capabilityFromRequest('Build a simple weather dashboard.')).toBe('weather');
        expect(capabilityFromRequest('Create a currency converter.')).toBe('currency');
        expect(capabilityFromRequest('Build an IP information page.')).toBe('ip');
    });

    it('keeps proxy requests under the durable preview project key', () => {
        expect(resolveProxyClientUrl(
            '/api/joe-external/currency',
            'http://localhost:5002/project-preview/session-1/index.html?v=1',
        ).toString()).toBe('http://localhost:5002/project-preview/session-1/api/joe-external/currency');
    });

    it('normalises Arabic digits and rejects mixed text in the English currency UI', () => {
        const plan = integrationPlanFromSelection(selected('currency', 'frankfurter-currency-v2'))!;
        const source = externalDataAppSource(plan);
        expect(source).toContain('charCodeAt(0)-1632');
        expect(source).toContain("setAmountError('Use digits and one decimal point only')");
        expect(source).toContain('lang="en-US"');
        expect(source).toContain('aria-invalid={amountError');
    });

    it('keeps optional IP lookup keyboard-submit semantics with explicit English validation', () => {
        const plan = integrationPlanFromSelection(selected('ip', 'ipapi-co-v1'))!;
        const source = externalDataAppSource(plan);
        expect(source).toContain('<form onSubmit={run} noValidate');
        expect(source).toContain('data-optional-submit="true"');
        expect(source).toContain('data-api-ip="true"');
        expect(source).toContain('data-api-submit="true"');
        expect(source).toContain('data-api-retry="true"');
        expect(source).toContain('Enter a valid IPv4 address, for example 8.8.8.8');
        expect(source).toContain("Number(part)<=255");
    });

    it('runs an IP request, exposes a network failure, and recovers through the generated retry control', async () => {
        const load = jest.fn()
            .mockResolvedValueOnce({ ip: '8.8.8.8', city: 'Mountain View', country_name: 'United States' })
            .mockRejectedValueOnce(new Error('Network failed'))
            .mockResolvedValueOnce({ ip: '1.1.1.1', city: 'Sydney', country_name: 'Australia' });
        const plan = integrationPlanFromSelection(selected('ip', 'ipapi-co-v1'))!;
        const render = executableGeneratedApp(externalDataAppSource(plan), load);

        let tree = render();
        const submit = findNode(tree, node => node.props?.['data-api-submit'] === 'true');
        const form = findNode(tree, node => node.type === 'form');
        expect(submit?.props?.disabled).toBe(false);
        await form.props.onSubmit({ preventDefault: jest.fn() });

        tree = render();
        expect(load).toHaveBeenCalledTimes(1);
        expect(renderedText(findNode(tree, node => node.props?.['data-api-result'] === 'true'))).toContain('8.8.8.8');

        findNode(tree, node => node.props?.['data-api-ip'] === 'true').props.onChange({ target: { value: 'not-an-ip' } });
        tree = render();
        await findNode(tree, node => node.type === 'form').props.onSubmit({ preventDefault: jest.fn() });
        tree = render();
        expect(load).toHaveBeenCalledTimes(1);
        expect(renderedText(findNode(tree, node => node.props?.id === 'ip-error'))).toContain('Enter a valid IPv4 address');
        expect(findNode(tree, node => node.props?.['data-api-result'] === 'true')).toBeUndefined();

        findNode(tree, node => node.props?.['data-api-ip'] === 'true').props.onChange({ target: { value: '8.8.8.8' } });
        tree = render();
        await findNode(tree, node => node.type === 'form').props.onSubmit({ preventDefault: jest.fn() });
        tree = render();
        const alert = findNode(tree, node => node.props?.['data-api-error'] === 'true');
        const retry = findNode(tree, node => node.props?.['data-api-retry'] === 'true');
        expect(renderedText(alert)).toContain('Network failed');
        expect(findNode(tree, node => node.props?.['data-api-result'] === 'true')).toBeUndefined();

        await retry.props.onClick();
        tree = render();
        expect(load).toHaveBeenCalledTimes(3);
        expect(findNode(tree, node => node.props?.['data-api-error'] === 'true')).toBeUndefined();
        expect(renderedText(findNode(tree, node => node.props?.['data-api-result'] === 'true'))).toContain('1.1.1.1');
    });

    it('skips an unavailable first candidate and selects the next maintained candidate', async () => {
        const candidates = [
            { id: 'dead', integrationProfileId: 'ipapi-co-v1', health: 'UNKNOWN' },
            { id: 'healthy', integrationProfileId: 'ipapi-co-v1', health: 'UNKNOWN' },
        ] as RankedApiCandidate[];
        const service = {
            search: jest.fn(async () => candidates),
            validate: jest.fn(async (id: string) => ({
                ...candidates.find(candidate => candidate.id === id)!,
                health: id === 'dead' ? 'UNAVAILABLE' : 'HEALTHY',
            })),
        };
        const result = await selectValidatedCandidate(service as any, {
            query: 'IP information',
            integrationRequired: true,
        }, candidates);
        expect(result.selected?.id).toBe('healthy');
        expect(result.attempted).toEqual(['dead', 'healthy']);
    });
});
