const fs = require('fs');
const c = fs.readFileSync('src/core/intelligence/requested-action.ts', 'utf8');
const lines = c.split('\n');
const line = lines[12];
console.log('Line 13:', line);

const start = line.indexOf('`') + 1;
const end = line.lastIndexOf('`');
const pattern = line.substring(start, end);
console.log('Pattern:', pattern);

console.log('Has 那些 那些 那些:', pattern.includes('那些 那些 那些'));
console.log('Has 那些 那些:', pattern.includes('那些 那些'));

const idx1 = pattern.indexOf('那些 那些 那些');
if (idx1 >= 0) console.log('Found 那些 那些 那些 at', idx1);
const idx2 = pattern.indexOf('那些 那些');
if (idx2 >= 0) console.log('Found 那些 那些 at', idx2);

const idx3 = pattern.indexOf('那些 那些 那些');
if (idx3 >= 0) {
  const sub = pattern.substring(idx3, idx3 + 20);
  console.log('Bytes at 那些 那些 那些:', Buffer.from(sub, 'utf8').toString('hex'));
}
const idx4 = pattern.indexOf('那些 那些');
if (idx4 >= 0) {
  const sub = pattern.substring(idx4, idx4 + 12);
  console.log('Bytes at 那些 那些:', Buffer.from(sub, 'utf8').toString('hex'));
}
// Keep this standalone diagnostic in its own module scope.
export {};
