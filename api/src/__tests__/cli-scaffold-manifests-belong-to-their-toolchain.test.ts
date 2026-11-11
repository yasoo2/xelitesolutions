import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

/**
 * The CLI skeleton's manifests must be files its own toolchain can read.
 *
 * Eval P301 (2026-10-25): a Python CSV tool was delivered with a package.json
 * declaring `"pandas": "^2.0.0"` as an npm dependency. Reading the scaffold
 * showed the same class in every language: the JavaScript CSV manifest ended
 * its dependency list with a comma (not JSON), the Go project's go.mod held a
 * tsconfig, the Rust project had no Cargo.toml for the crates its entry uses,
 * and the stock Python CSV entry imported pandas, which nothing installs.
 */
describe('CLI scaffold manifests belong to their toolchain', () => {
    const structureFor = (request: string): Record<string, string> => {
        const plan = deterministicPhasesFor(request);
        const task = plan?.phases[0]?.tasks.find((t: any) => t.tool === 'scaffold_project');
        expect(task).toBeDefined();
        return task.args.structure;
    };
    const npmDeps = (pkgJson: string) => {
        const pkg = JSON.parse(pkgJson);
        return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    };

    const languages = [
        { lang: 'javascript', csv: 'Write a JavaScript command-line tool that reads a CSV file and prints it as JSON to stdout.' },
        { lang: 'typescript', csv: 'Write a TypeScript command-line tool that reads a CSV file and prints it as JSON to stdout.' },
        { lang: 'python', csv: 'Write a Python command-line tool that reads a CSV file and prints it as JSON to stdout.' },
        { lang: 'go', csv: 'Write a Go command-line tool that reads a CSV file and prints it as JSON to stdout.' },
        { lang: 'rust', csv: 'Write a Rust command-line tool that reads a CSV file and prints it as JSON to stdout.' },
        { lang: 'bash', csv: 'Write a bash command-line tool that reads a CSV file and prints it as JSON to stdout.' },
    ];

    it.each(languages)('$lang: package.json is valid JSON', ({ csv }) => {
        expect(() => JSON.parse(structureFor(csv)['package.json'])).not.toThrow();
    });

    it.each(languages.filter(l => !['javascript', 'typescript'].includes(l.lang)))(
        '$lang: npm is never asked for another ecosystem\'s libraries', ({ csv }) => {
            expect(npmDeps(structureFor(csv)['package.json'])).toEqual({});
        });

    it('python: the stock CSV program runs on the standard library alone', () => {
        const structure = structureFor(languages.find(l => l.lang === 'python')!.csv);
        expect(structure['main.py']).toMatch(/^import csv$/m);
        expect(structure['main.py']).not.toMatch(/\bpandas\b/);
    });

    it('go: go.mod is a Go module file, not a tsconfig', () => {
        const structure = structureFor(languages.find(l => l.lang === 'go')!.csv);
        expect(structure['go.mod']).toMatch(/^module [a-z0-9._-]+\n/);
        expect(structure['go.mod']).not.toMatch(/compilerOptions/);
        expect(structure['tsconfig.json']).toBeUndefined();
    });

    it('rust: Cargo.toml declares every crate the entry uses', () => {
        const structure = structureFor(languages.find(l => l.lang === 'rust')!.csv);
        const cargo = structure['Cargo.toml'];
        expect(cargo).toMatch(/^\[package\]\nname = "[a-z0-9_-]+"/);
        for (const crate of ['csv', 'serde_json']) {
            if (new RegExp(`\\b${crate}::`).test(structure['src/main.rs'])) {
                expect(cargo).toMatch(new RegExp(`^${crate} = `, 'm'));
            }
        }
    });

    it('a quote or newline in the request still yields a valid manifest', () => {
        const pkg = structureFor('Write a JavaScript command-line tool that reads a CSV file named "in.csv"\nand prints it as JSON to stdout.')['package.json'];
        expect(() => JSON.parse(pkg)).not.toThrow();
    });
});
