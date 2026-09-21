import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactProjectTool } from '../modules/tools/definitions/ReactProjectTool';
import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import * as blueprints from '../core/design/app-blueprints';
import { presentationShellContext } from '../core/quality/presentation-context';
import * as copyAuthor from '../core/design/authored-copy';
import * as catalogueAuthor from '../core/design/authored-catalogue';
import * as router from '../core/llm/intelligent-router';

describe('records presentation requires authoring', () => {
    it('reserves application authoring for its actual surface instead of unused marketing copy', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-records-copy-budget-'));
        const sessionId = path.basename(root);
        const previousEnv = process.env.NODE_ENV;
        const previousWorker = process.env.JEST_WORKER_ID;
        const route = jest.spyOn(router, 'routeToModel').mockResolvedValue('' as any);
        const cooling = jest.spyOn(router, 'isProviderCoolingDown').mockReturnValue(false);
        const copy = jest.spyOn(copyAuthor, 'authorCopy').mockResolvedValue({ fields: {}, rejected: [] } as any);
        const catalogue = jest.spyOn(catalogueAuthor, 'authorCatalogue').mockResolvedValue({ rows: [], rejected: [] });
        const author = jest.spyOn(AIGeneratorTool.prototype, 'execute').mockResolvedValue({ ok: false, error: 'provider_unavailable' } as any);
        try {
            process.env.NODE_ENV = 'development';
            delete process.env.JEST_WORKER_ID;
            await new ReactProjectTool().execute(
                { request: 'Build an inventory app with item name, quantity and category.', root, skipInstall: true },
                { sessionId, engineeringPipeline: true, allowModelAuthoringInTest: true },
            );
            expect(copy).not.toHaveBeenCalled();
            expect(author).toHaveBeenCalled();
            expect(author.mock.calls[0][0].path).toMatch(/RecordsView\.jsx$/);
        } finally {
            if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
            if (previousWorker === undefined) delete process.env.JEST_WORKER_ID; else process.env.JEST_WORKER_ID = previousWorker;
            author.mockRestore(); catalogue.mockRestore(); copy.mockRestore(); cooling.mockRestore(); route.mockRestore();
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 60000);

    it.each([
        'Build a library checkout app with title, borrower, due date and returned status.',
        'Build an inventory app with item name, quantity, price and category.',
    ])('does not silently deliver the default presentation when the provider fails: %s', async request => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-records-author-'));
        const sessionId = path.basename(root);
        const author = jest.spyOn(AIGeneratorTool.prototype, 'execute').mockResolvedValue({
            ok: false, error: 'provider_unavailable',
        } as any);
        try {
            const result: any = await new ReactProjectTool().execute(
                { request, root, skipInstall: true },
                { sessionId, engineeringPipeline: true, allowModelAuthoringInTest: true },
            );
            expect(author).toHaveBeenCalled();
            expect(author.mock.calls[0][0].path).toMatch(/RecordsView\.jsx$/);
            const project = path.resolve(path.dirname(author.mock.calls[0][0].path), '../..');
            const suppliedContext = author.mock.calls[0][0].context;
            for (const relativePath of ['src/content.js', 'src/app/records-controller.js']) {
                expect(suppliedContext).toContain(JSON.stringify(fs.readFileSync(path.join(project, relativePath), 'utf8')));
            }
            for (const entry of presentationShellContext(fs.readFileSync(path.join(project, 'src/App.jsx'), 'utf8'), fs.readFileSync(path.join(project, 'src/styles/app.css'), 'utf8'))) {
                expect(suppliedContext).toContain(JSON.stringify(entry));
            }
            expect(author.mock.calls[0][0].description).toContain('appropriate native list, table, or article semantics');
            expect(author.mock.calls[0][0].description).toContain('placeholder alone is not a label');
            expect(suppliedContext).toContain('submit(event)');
            expect(suppliedContext).toContain('edit(row)');
            expect(suppliedContext).toContain('setSort');
            expect(suppliedContext).not.toContain(JSON.stringify(fs.readFileSync(author.mock.calls[0][0].path, 'utf8')));
            expect(result.ok).toBe(false);
            expect(result.output.presentation).toEqual({ source: 'default', originality: 'unverified',
                path: 'src/components/RecordsView.jsx' });
        } finally {
            author.mockRestore();
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 60000);

    it('does not call an unchanged default view model-authored just because the author reports success', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-records-unchanged-'));
        const sessionId = path.basename(root);
        const author = jest.spyOn(AIGeneratorTool.prototype, 'execute').mockResolvedValue({ ok: true } as any);
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build an inventory app with item name, quantity and price.', root, skipInstall: true },
                { sessionId, engineeringPipeline: true, allowModelAuthoringInTest: true },
            );
            expect(author).toHaveBeenCalled();
            expect(result.ok).toBe(false);
            expect(result.error).toBe('records_presentation_unchanged');
            expect(result.output.presentation.source).toBe('default');
        } finally {
            author.mockRestore();
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 60000);

    it.each(['src/components/RecordsApp.jsx', 'src/app/records-controller.js', 'src/app/store.js', 'src/App.jsx'])(
        'rejects authoring outside the presentation: %s', async trustedFile => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-records-ownership-'));
            const sessionId = path.basename(root);
            let altered = '';
            const author = jest.spyOn(AIGeneratorTool.prototype, 'execute').mockImplementation(async (args: any) => {
                const project = path.resolve(path.dirname(args.path), '../..');
                altered = path.join(project, trustedFile);
                fs.appendFileSync(altered, '\n// unauthorized author edit\n');
                return { ok: true } as any;
            });
            try {
                const result: any = await new ReactProjectTool().execute(
                    { request: 'Build an inventory app with item name, quantity and price.', root, skipInstall: true },
                    { sessionId, engineeringPipeline: true, allowModelAuthoringInTest: true },
                );
                expect(result.ok).toBe(false);
                expect(result.error).toBe('records_presentation_ownership_violation');
                expect(result.output.changedTrustedFiles).toContain(trustedFile);
                expect(fs.readFileSync(altered, 'utf8')).toContain('unauthorized author edit');
            } finally {
                author.mockRestore();
                delete (global as any).joeProjects?.[sessionId];
                fs.rmSync(root, { recursive: true, force: true });
            }
        }, 60000);

    it.each(['default restoration', 'trusted mutation'])('rejects %s during later repair', async scenario => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-records-repair-'));
        const sessionId = path.basename(root);
        const gaps = jest.spyOn(blueprints, 'uncoveredFeatures').mockReturnValue([]);
        let original = '';
        let calls = 0;
        const author = jest.spyOn(AIGeneratorTool.prototype, 'execute').mockImplementation(async (args: any) => {
            calls++;
            if (calls === 1) {
                original = fs.readFileSync(args.path, 'utf8');
                fs.writeFileSync(args.path, 'import React from "react"; export default function RecordsView({content, controller}) { return <main><h1>{content.brand}</h1><form onSubmit={controller.submit}><input value={controller.draft.title || ""} onChange={e => controller.setDraft({...controller.draft, title:e.target.value})}/><button disabled={controller.mutationBusy}>Add</button></form></main>; }');
                gaps.mockReturnValueOnce(['missing interaction']);
            } else if (scenario === 'default restoration') {
                const project = path.resolve(path.dirname(args.path), '../..');
                expect(args.context).toContain(JSON.stringify(fs.readFileSync(path.join(project, 'src/app/records-controller.js'), 'utf8')));
                expect(args.context).toContain(JSON.stringify(fs.readFileSync(path.join(project, 'src/content.js'), 'utf8')));
                for (const entry of presentationShellContext(fs.readFileSync(path.join(project, 'src/App.jsx'), 'utf8'), fs.readFileSync(path.join(project, 'src/styles/app.css'), 'utf8'))) {
                    expect(args.context).toContain(JSON.stringify(entry));
                }
                fs.writeFileSync(args.path, original);
            } else {
                fs.appendFileSync(path.resolve(path.dirname(args.path), '../app/records-controller.js'), '\n// unauthorized repair\n');
            }
            return { ok: true } as any;
        });
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build an inventory app with item name, quantity and price.', root, skipInstall: true },
                { sessionId, engineeringPipeline: true, allowModelAuthoringInTest: true },
            );
            expect(calls).toBe(2);
            expect(result.ok).toBe(false);
            expect(result.output.delivery.blockers).toContain(scenario === 'default restoration'
                ? 'records_presentation_not_authored' : 'records_presentation_ownership_violation');
            expect(result.output.presentation.originality).toBe('unverified');
            if (scenario === 'default restoration') {
                expect(result.output.presentation.source).toBe('default');
                expect(result.output.authorMode).not.toBe('model');
            }
        } finally {
            author.mockRestore();
            gaps.mockRestore();
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 60000);

    it('does not certify originality when authoring only changes a comment', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-records-provenance-'));
        const sessionId = path.basename(root);
        const author = jest.spyOn(AIGeneratorTool.prototype, 'execute').mockImplementation(async (args: any) => {
            fs.appendFileSync(args.path, '\n// presentation annotation\n');
            return { ok: true } as any;
        });
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build an inventory app with item name, quantity and price.', root, skipInstall: true },
                { sessionId, engineeringPipeline: true, allowModelAuthoringInTest: true },
            );
            expect(author).toHaveBeenCalled();
            expect(result.output.presentation.originality).toBe('unverified');
        } finally {
            author.mockRestore();
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 60000);
});
