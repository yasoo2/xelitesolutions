import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

/**
 * Eval L3-cli, 2026-10-22: a word counter named wordcount.js came back as
 * src/index.ts holding a JSON property=value filter, with a test that filters
 * Alice/Bob/Charlie — the one program every CLI request received. A template
 * may give the skeleton; the behaviour comes from the request (law 4).
 */
const wordcount = 'Write a Node.js command-line tool wordcount.js that takes a file path argument and prints the number of words in that file. Include a package.json.';
const tasksOf = (request: string) => deterministicPhasesFor(request)!.phases[0].tasks;

describe('a CLI is the program he asked for, not the stock filter', () => {
    it('the file he named is the entry, in the language its extension says', () => {
        const [scaffold] = tasksOf(wordcount);
        const structure = scaffold.args.structure;
        expect(Object.keys(structure)).toContain('wordcount.js');
        expect(Object.keys(structure)).not.toContain('src/index.ts');
        const pkg = JSON.parse(structure['package.json']);
        expect(pkg.main).toBe('wordcount.js');
        expect(pkg.scripts.start).toBe('node wordcount.js');
    });

    it('the stock filter and its Alice test are not shipped as his program', () => {
        const tasks = tasksOf(wordcount);
        const structure = tasks[0].args.structure;
        expect(JSON.stringify(structure)).not.toMatch(/Alice|Charlie/);
        expect(Object.keys(structure)).not.toContain('sample.json');
        const authored = tasks.filter((t: any) => t.tool === 'ai_write_file');
        expect(authored.map((t: any) => t.args.path)).toEqual(['wordcount.js', 'test.js']);
        expect(authored[0].args.description).toContain(wordcount);
        expect(authored[0].args.description).toContain('node wordcount.js');
    });

    it('a request that IS the stock filter keeps the stock program and its test', () => {
        const tasks = tasksOf('Build a Python command-line tool that reads a local JSON file and prints matching entries to stdout. No website or browser interface.');
        expect(tasks.map((t: any) => t.tool)).toEqual(['scaffold_project']);
        // Its test is a standard-library unittest named after the program (eval round 19).
        expect(Object.keys(tasks[0].args.structure)).toEqual(expect.arrayContaining(['main.py', 'test_main.py', 'sample.json']));
        expect(tasks[0].args.structure['test_main.py']).toMatch(/import unittest/);
    });

    it('his quotes and newlines cannot break the manifest', () => {
        const tasks = tasksOf('Write a Node.js CLI tool "greet.js" that prints "hello"\nto the name given as an argument');
        expect(() => JSON.parse(tasks[0].args.structure['package.json'])).not.toThrow();
    });
});
