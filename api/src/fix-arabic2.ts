const fs = require('fs');
const file = 'src/core/intelligence/requested-action.ts';
let c = fs.readFileSync(file, 'utf8');

// The current pattern has alternatives in wrong order - shorter matches first
// We need to put the longest alternative (three 那些) first
const oldPattern = '那些\\\\s+(那些|那些\\\\s+实施)|(那些|那些)\\\\s+(那些|那些|那些|那些)|那些\\\\s+(那些|那些)\\\\s+(那些|那些)\\\\s+(那些|那些)|那些\\\\s+那些\\\\s+那些';
const newPattern = '那些\\\\s+那些\\\\s+那些|那些\\\\s+(那些|那些\\\\s+实施)|(那些|那些)\\\\s+(那些|那些|那些|那些)|那些\\\\s+(那些|那些)\\\\s+(那些|那些)\\\\s+(那些|那些)';

if (c.includes(oldPattern)) {
  c = c.replace(oldPattern, newPattern);
  fs.writeFileSync('src/core/intelligence/requested-action.ts', c, 'utf8');
  console.log('Replaced successfully');
} else {
  console.log('Pattern not found - trying alternative');
  // Try to find the pattern in the file
  const content = fs.readFileSync('src/core/intelligence/requested-action.ts', 'utf8');
  const idx = content.indexOf('那些\\\\s+那些\\\\s+那些');
  if (idx >= 0) {
    console.log('Found at index:', idx);
    console.log('Context:', content.substring(idx - 50, idx + 100));
  } else {
    console.log('Not found at all');
  }
}
// Keep this standalone diagnostic in its own module scope.
export {};
