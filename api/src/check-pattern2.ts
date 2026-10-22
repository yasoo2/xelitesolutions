const fs = require('fs');
const c = fs.readFileSync('src/core/intelligence/requested-action.ts', 'utf8');
const lines = c.split('\n');
const line = lines[12];
console.log('Line:', JSON.stringify(line));
const idx = line.indexOf('ANSWER_ONLY_AR');
if (idx >= 0) {
  const start = line.indexOf('`', idx);
  const end = line.indexOf('`;', start);
  if (start >= 0 && end >= 0) {
    const pattern = line.substring(start + 1, end);
    console.log('Pattern:', pattern);
    console.log('Bytes:', Buffer.from(pattern, 'utf8').toString('hex'));
  }
}
// Keep this standalone diagnostic in its own module scope.
export {};
