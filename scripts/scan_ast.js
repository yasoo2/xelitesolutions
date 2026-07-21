const fs = require('fs');
const path = require('path');

function getTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist' || file === 'build') continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getTsFiles(filePath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const root = path.resolve(__dirname, '../api/src');
const tsFiles = getTsFiles(root);

console.log('Total TypeScript source files in api/src:', tsFiles.length);

const summary = tsFiles.map((filePath, idx) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(path.resolve(__dirname, '..'), filePath);
  const lines = content.split('\n').length;
  const exports = (content.match(/export\s+(class|function|const|interface|type|async function|enum)\s+([A-Za-z0-9_]+)/g) || []).map(e => e.trim());
  const imports = (content.match(/import\s+.*?from\s+['"].*?['"]/g) || []).length;
  return {
    index: idx + 1,
    file: relPath.replace(/\\/g, '/'),
    lines,
    importsCount: imports,
    exports
  };
});

fs.writeFileSync(path.resolve(__dirname, '../api_src_ast.json'), JSON.stringify(summary, null, 2));
console.log('AST summary written to api_src_ast.json successfully.');
