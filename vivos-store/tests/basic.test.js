const fs = require('fs');
test('API index exists', () => {
  expect(fs.existsSync('apps/api/src/index.js')).toBe(true);
});
test('Web App exists', () => {
  expect(fs.existsSync('apps/web/src/App.jsx')).toBe(true);
});
