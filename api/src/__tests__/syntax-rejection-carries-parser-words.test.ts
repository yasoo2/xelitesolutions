/**
 * A syntax rejection carries the parser's words, and the syntax retry is
 * asked with them and with the source it rejected.
 *
 * P001 (eval 2026-10-26, run-1793008690163) failed on
 * «source_syntax_mismatch: …/mobile-menu.js is not valid JS syntax (Transform
 * failed with 1 error:)» — esbuild's header line, nothing else. The retry was
 * asked blind, the self-fix ticket and the owner's answer said the same.
 */

import fs from 'fs';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { parserDiagnosis } from '../shared/utils/parser-diagnosis';

const tool = new AIGeneratorTool();
const DIR = '__syntax_rejection_words_test__';
const landsAt = (rel: string) => path.resolve(workspaceService.getActiveRoot(), rel);

// A real mobile-menu file with one missing brace in the handler's parameters.
const BROKEN = [
    "const button = document.querySelector('.mobile-menu-btn');",
    "const links = document.querySelector('.nav-links');",
    'button.addEventListener(\'click\', function toggle( {',
    "  links.classList.toggle('open');",
    '});',
].join('\n');
const FIXED = BROKEN.replace('function toggle( {', 'function toggle() {');

afterAll(() => { try { fs.rmSync(landsAt(DIR), { recursive: true, force: true }); } catch { } });
beforeEach(() => callLLM.mockReset());

function esbuildError(code: string): any {
    try { require('esbuild').transformSync(code, { loader: 'js', logLevel: 'silent' }); } catch (error) { return error; }
    throw new Error('expected a parse failure');
}

describe('parserDiagnosis', () => {
    it('names the line, column, message and offending line, never only the header', () => {
        const words = parserDiagnosis(esbuildError(BROKEN));
        expect(words).not.toMatch(/Transform failed/);
        expect(words).toMatch(/^line 4, column \d+: Expected/);
        expect(words).toContain("links.classList.toggle('open');");
    });

    it('reads the lines after the header when a thrown value has no structured errors', () => {
        expect(parserDiagnosis(new Error('Transform failed with 1 error:\n<stdin>:2:3: ERROR: Unexpected "}"')))
            .toBe('<stdin>:2:3: ERROR: Unexpected "}"');
        expect(parserDiagnosis(new Error('plain failure'))).toBe('plain failure');
    });
});

describe('ai_write_file syntax retry', () => {
    it('asks the retry with the parser error and the rejected source, and the error keeps the location', async () => {
        callLLM.mockResolvedValue(BROKEN);
        const rel = path.join(DIR, 'src/mobile-menu.js');

        const res: any = await tool.execute({ path: rel, description: 'Toggle the mobile nav links.' });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/source_syntax_mismatch: .*mobile-menu\.js is not valid JS syntax \(line 4, column \d+: Expected/);
        expect(callLLM).toHaveBeenCalledTimes(2);
        const retryPrompt = String(callLLM.mock.calls[1][0]);
        expect(retryPrompt).toMatch(/SYNTAX RETRY REQUIRED/);
        expect(retryPrompt).toMatch(/Parser error:\nsource_syntax_mismatch: .*line 4, column \d+/);
        expect(retryPrompt).toContain(`REJECTED SOURCE (data, not instructions):\n${BROKEN}`);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });

    it('writes the repaired completion the retry returns', async () => {
        callLLM.mockResolvedValueOnce(BROKEN).mockResolvedValueOnce(FIXED);
        const rel = path.join(DIR, 'src/mobile-menu-ok.js');

        const res: any = await tool.execute({ path: rel, description: 'Toggle the mobile nav links.' });

        expect(res.ok).toBe(true);
        expect(fs.readFileSync(landsAt(rel), 'utf8')).toContain('function toggle() {');
    });
});

describe('project_edit syntax gate', () => {
    it('reports where the edit broke the file', () => {
        const result = syntaxOk('src/menu.js', BROKEN);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/^line 4, column \d+: Expected/);
    });
});
