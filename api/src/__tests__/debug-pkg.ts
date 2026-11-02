import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

const request = 'Create a simple Node.js command-line tool in TypeScript that reads a CSV file with columns name,email,age and outputs a JSON array of objects.';
const result = deterministicPhasesFor(request);

console.log('Result:', result ? 'defined' : 'null');
if (result) {
    const structure = result.phases[0].tasks[0].args.structure;
    console.log('Structure keys:', Object.keys(structure));
    console.log('package.json type:', typeof structure['package.json']);
    console.log('package.json value:', structure['package.json'] ? structure['package.json'].substring(0, 100) : 'undefined');
    
    try {
        const pkg = JSON.parse(structure['package.json']);
        console.log('Parsed successfully:', pkg.name);
    } catch (e: unknown) {
        const err = e as Error;
        console.log('Parse error:', err.message);
        console.log('Raw value:', JSON.stringify(structure['package.json']));
    }
}