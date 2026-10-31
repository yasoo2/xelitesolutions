import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

describe('CLI scaffold fidelity - language/format specific artifacts', () => {
    const testCases = [
        {
            name: 'Python JSON CLI',
            request: 'Build a Python command-line tool that reads a local JSON file and prints matching entries to stdout. No website or browser interface.',
            expectedEntryPoint: 'main.py',
            expectedLanguage: 'python',
            shouldContain: ['def main', 'import json', 'sys.argv'],
            shouldNotContain: ['import fs', ': string', 'const ', 'export {'],
        },
        {
            name: 'TypeScript CSV CLI',
            request: 'Create a simple Node.js command-line tool in TypeScript that reads a CSV file with columns name,email,age and outputs a JSON array of objects.',
            expectedEntryPoint: 'src/index.ts',
            expectedLanguage: 'typescript',
            shouldContain: ['import fs', 'import path', 'csv-parse', ': string', 'const '],
            shouldNotContain: ['def main', 'import json', 'sys.argv', '#!/usr/bin/env python'],
        },
        {
            name: 'Python CSV CLI',
            request: 'Build a Python CLI tool that reads a CSV file with columns task_name,estimated_minutes,actual_minutes and outputs JSON',
            expectedEntryPoint: 'main.py',
            expectedLanguage: 'python',
            shouldContain: ['def main', 'import pandas', 'read_csv', 'sys.argv'],
            shouldNotContain: ['import fs', ': string', 'const ', 'export {', 'csv-parse'],
        },
        {
            name: 'Bash JSON CLI',
            request: 'Build a Bash command-line tool that reads a JSON file and filters by property value',
            expectedEntryPoint: 'main.sh',
            expectedLanguage: 'bash',
            shouldContain: ['#!/bin/bash', 'jq ', '\$1', '\$2'],
            shouldNotContain: ['import fs', 'def main', 'import json', 'const '],
        },
        {
            name: 'Go JSON CLI',
            request: 'Build a Go command-line tool that reads a JSON file and filters by property=value',
            expectedEntryPoint: 'main.go',
            expectedLanguage: 'go',
            shouldContain: ['package main', 'func main', 'json.Unmarshal', 'os.Args'],
            shouldNotContain: ['import fs', 'def main', 'const ', 'import pandas'],
        },
    ];

    it.each(testCases)('$name: generates correct language-specific scaffold', ({ request, expectedEntryPoint, shouldContain, shouldNotContain }) => {
        const result = deterministicPhasesFor(request);
        
        expect(result).not.toBeNull();
        expect(result!.phases[0].tasks[0].tool).toBe('scaffold_project');
        
        const structure = result!.phases[0].tasks[0].args.structure;
        expect(structure).toBeDefined();
        expect(structure[expectedEntryPoint]).toBeDefined();
        
        const entryContent = structure[expectedEntryPoint];
        
        // Check for language-specific markers
        for (const marker of shouldContain) {
            expect(entryContent).toContain(marker);
        }
        
        // Check that it doesn't contain markers from other languages
        for (const marker of shouldNotContain) {
            expect(entryContent).not.toContain(marker);
        }
        
        // Check package.json has correct scripts for the language
        const pkgJson = structure['package.json'];
        expect(pkgJson).toBeDefined();
        
        // Verify it's valid JSON
        const pkg = JSON.parse(pkgJson);
        expect(pkg.name).toBeDefined();
        expect(pkg.version).toBeDefined();
        expect(pkg.scripts).toBeDefined();
    });
});