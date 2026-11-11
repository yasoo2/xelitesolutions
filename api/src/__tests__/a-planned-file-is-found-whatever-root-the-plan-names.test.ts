import fs from 'fs';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { workspaceService } from '../modules/services/WorkspaceService';

/**
 * Eval round 13, 2026-10-23 (P001): the plan named its files relative to the
 * workspace («clinic-landing-ar/src/components/Hero.jsx»). The import gate
 * resolved them against the PROJECT root, doubling the folder, so no planned
 * file ever matched — App.jsx was rejected for importing Navbar and Hero
 * planned in the same phase, and Footer planned for a later one.
 */
const tool = new AIGeneratorTool();
const DIR = '__planned_root_test__';
const landsAt = (rel: string) => path.resolve(workspaceService.getActiveRoot(), rel);
const APP = "import React from 'react';\nimport Navbar from './components/Navbar';\nimport Hero from './components/Hero';\nimport Footer from './components/Footer';\nexport default function App(){ return <div><Navbar /><Hero /><Footer /></div>; }\n";

afterAll(() => { try { fs.rmSync(landsAt(DIR), { recursive: true, force: true }); } catch { } });
beforeEach(() => callLLM.mockReset());

describe('a planned file is found whatever root the plan names', () => {
    const project = () => {
        const root = landsAt(path.join(DIR, 'clinic-landing-ar'));
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'clinic-landing-ar', dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', vite: '^5.0.0' } }));
        return root;
    };

    it.each([
        ['workspace-relative, with the project folder', ['clinic-landing-ar/src/App.jsx', 'clinic-landing-ar/src/components/Navbar.jsx', 'clinic-landing-ar/src/components/Hero.jsx', 'clinic-landing-ar/src/components/Footer.jsx']],
        ['project-relative', ['src/App.jsx', 'src/components/Navbar.jsx', 'src/components/Hero.jsx', 'src/components/Footer.jsx']],
    ])('%s paths satisfy the import gate', async (_label, planned) => {
        const root = project();
        callLLM.mockResolvedValue(APP);
        const res: any = await tool.execute(
            { path: path.join(DIR, 'clinic-landing-ar', 'src', 'App.jsx'), description: 'Main App composing the sections.' },
            { projectRoot: root, projectName: 'clinic-landing-ar', plannedPhaseFiles: planned },
        );
        expect(res.error || '').not.toMatch(/unresolved_local_import/);
        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(1);
    });

    it('an import nothing plans is still refused', async () => {
        const root = project();
        callLLM.mockResolvedValue(APP);
        const res: any = await tool.execute(
            { path: path.join(DIR, 'clinic-landing-ar', 'src', 'App.jsx'), description: 'Main App composing the sections.' },
            { projectRoot: root, projectName: 'clinic-landing-ar', plannedPhaseFiles: ['clinic-landing-ar/src/App.jsx', 'clinic-landing-ar/src/components/Navbar.jsx'] },
        );
        expect(res.ok).toBe(false);
        expect(String(res.error || '')).toMatch(/unresolved_local_import/);
    });
});
