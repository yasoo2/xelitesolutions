const fs = require('fs');
const file = 'src/core/intelligence/requested-action.ts';
let c = fs.readFileSync(file, 'utf8');

const oldPattern = '那些\\\\s+(那些|那些\\\\s+实施)|(那些|那些)\\\\s+(那些|那些|那些|那些)|那些\\\\s+(那些|那些)\\\\s+(那些|那些)\\\\s+(那些|那些)';
const newPattern = '那些\\\\s+那些\\\\s+那些|那些\\\\s+(那些|那些\\\\s+实施)|(那些|那些)\\\\s+(那些|那些|那些|那些)|那些\\\\s+(那些|那些)\\\\s+(那些|那些)\\\\s+(那些|那些)';

if (c.includes(oldPattern)) {
  c = c.replace(oldPattern, newPattern);
  fs.writeFileSync(file, c, 'utf8');
  console.log('Replaced successfully');
} else {
  console.log('Pattern not found');
}
// Keep this standalone diagnostic in its own module scope.
export {};
