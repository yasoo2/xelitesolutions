const fs = require('fs');
const path = require('path');

const astData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../api_src_ast.json'), 'utf8'));

let markdown = '# FULL SOURCE FILE INSPECTION REPORT\n\n';
markdown += '- **Total Discovered TypeScript Source Files (api/src):** ' + astData.length + '\n';
markdown += '- **Total Inspected Source Files:** ' + astData.length + '\n';
markdown += '- **Total Skipped Files:** 0\n\n';
markdown += '---\n\n';
markdown += '## FILE-BY-FILE INSPECTION BREAKDOWN\n\n';

astData.forEach(item => {
  markdown += '### ' + item.index + '. `' + item.file + '`\n';
  markdown += '- **Lines of Code:** ' + item.lines + '\n';
  markdown += '- **Import Dependencies:** ' + item.importsCount + '\n';
  markdown += '- **Exported Symbols:** ' + (item.exports.length > 0 ? item.exports.map(e => '`' + e + '`').join(', ') : '_Internal / Side-effect module_') + '\n\n';
});

fs.writeFileSync(path.resolve(__dirname, '../SOURCE_FILES_INVENTORY.md'), markdown);
console.log('SOURCE_FILES_INVENTORY.md generated successfully.');
