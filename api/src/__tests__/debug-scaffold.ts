import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

const testCases = [
    {
        name: 'TypeScript CSV CLI',
        request: 'Create a simple Node.js command-line tool in TypeScript that reads a CSV file with columns name,email,age and outputs a JSON array of objects.',
    },
    {
        name: 'Python CSV CLI',
        request: 'Build a Python CLI tool that reads a CSV file with columns task_name,estimated_minutes,actual_minutes and outputs JSON',
    },
    {
        name: 'Python JSON CLI',
        request: 'Build a Python command-line tool that reads a local JSON file and prints matching entries to stdout. No website or browser interface.',
    },
];

for (const tc of testCases) {
    const result = deterministicPhasesFor(tc.request);
    console.log(`\n=== ${tc.name} ===`);
    if (result) {
        const structure = result.phases[0].tasks[0].args.structure;
        console.log(`Files: ${Object.keys(structure).join(', ')}`);
        
        for (const [file, content] of Object.entries(structure) as [string, string][]) {
            console.log(`\n--- ${file} ---`);
            console.log(content.substring(0, 500));
            console.log('...');
        }
    } else {
        console.log('NULL result');
    }
}