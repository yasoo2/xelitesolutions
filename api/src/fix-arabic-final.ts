const fs = require('fs');
const file = 'src/core/intelligence/requested-action.ts';
let c = fs.readFileSync(file, 'utf8');
const lines = c.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('ANSWER_ONLY_AR') && lines[i].includes('那些')) {
    console.log('Found at line', i + 1);
    console.log('Before:', lines[i]);
    
    // Replace the end of the pattern to allow Chinese 那些 at the start of the last group
    lines[i] = lines[i].replace(
      '那些\\\\s+(那些|那些)\\\\s+(那些|那些))`;',
      '那些\\\\s+(那些|那些)\\\\s+(那些|那些)|那些\\\\s+那些\\\\s+那些)`;'
    );
    
    fs.writeFileSync('src/core/intelligence/requested-action.ts', lines.join('\n'), 'utf8');
    console.log('After:', lines[i]);
    console.log('Modified successfully');
    break;
  }
}
// Keep this standalone diagnostic in its own module scope.
export {};
