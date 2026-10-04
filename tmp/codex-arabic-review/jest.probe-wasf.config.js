module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/probe-wasf.test.ts'],
  transform: {
    '^.+\\.ts$': ['D:/Joe/worktrees/codex-readonly-browser-20261004/api/node_modules/ts-jest', { diagnostics: false }],
  },
};
