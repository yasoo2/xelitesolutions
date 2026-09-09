import fs from 'fs';
import path from 'path';
import { capabilityFromRequest, discoverIntegrationForRequest, externalDataAppSource } from '../core/api-discovery/integration';
import { isExternalIntegrationArtifact } from '../modules/tools/definitions/ReactProjectTool';
import { guardUnverifiedBuilderClaims } from '../core/api-discovery/reporting';

describe('external API generation contract', () => {
    it('detects only supported external-data capabilities', () => {
        expect(capabilityFromRequest('Build a simple weather dashboard using a free public API.')).toBe('weather');
        expect(capabilityFromRequest('Create a currency converter using a public API')).toBe('currency');
        expect(capabilityFromRequest('Build an IP information page')).toBe('ip');
        expect(capabilityFromRequest('Build a todo list')).toBeNull();
    });

    it('generates bounded clients with response validation and no embedded secret', async () => {
        const plan = await discoverIntegrationForRequest('Create a currency converter using a public API that does not require authentication if possible.', { validate: false });
        expect(plan?.candidate).toMatchObject({ name: 'Frankfurter', auth: 'none', https: true, cors: 'yes' });
        expect(plan?.clientSource).toContain('AbortController');
        expect(plan?.clientSource).toContain("response.ok");
        expect(plan?.clientSource).toContain('Unexpected currency response');
        expect(plan?.clientSource).not.toMatch(/API_KEY\s*=\s*['"][^'"]+/);
        const app = externalDataAppSource(plan!);
        expect(app).toContain('Loading');
        expect(app).toContain('role="alert"');
        expect(app).toContain('Retry');
    });

    it('wires discovery artifacts into the existing React builder', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
        expect(source).toContain('discoverIntegrationForRequest(request)');
        expect(source).toContain("'src/integrations/externalApi.js'");
        expect(source).toContain("'.joe/external-api.json'");
        expect(source).toContain("files['src/App.jsx'] = externalApp");
        expect(source.indexOf("files['src/App.jsx'] = externalApp"))
            .toBeLessThan(source.indexOf('for (const [rel, body] of Object.entries(files))'));
    });

    it('keeps discovery artifacts when the React builder switches to an application blueprint', () => {
        expect([
            'src/integrations/externalApi.js',
            '.joe/external-api.json',
            '.env.example',
        ].every(isExternalIntegrationArtifact)).toBe(true);
        expect(isExternalIntegrationArtifact('src/App.jsx')).toBe(false);
    });

    it('does not preserve a source-level acceptance claim after live verification fails', () => {
        const report = guardUnverifiedBuilderClaims(
            'Build succeeded.\n✅ Acceptance accepted: all 1/1 requested criteria were proven.\nFiles exist.',
            false,
            false,
        );
        expect(report).not.toContain('Acceptance accepted');
        expect(report).toContain('live acceptance has not been proven');
        expect(guardUnverifiedBuilderClaims('✅ Acceptance accepted: all 1/1 requested criteria were proven.', true, false))
            .toContain('Acceptance accepted');
    });
});
