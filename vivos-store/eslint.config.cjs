const js = require('@eslint/js');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
module.exports = [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.github/**'] },
  js.configs.recommended,
  {
    files: ['apps/api/**/*.js'],
    linterOptions: { reportUnusedDisableDirectives: true },
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { require: 'readonly', process: 'readonly', console: 'readonly' } },
    rules: {}
  },
  {
    files: ['jest.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { module: 'readonly', require: 'readonly' } },
    rules: {}
  },
  {
    files: ['apps/web/**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: { console: 'readonly', window: 'readonly', document: 'readonly' } },
    plugins: { react: reactPlugin, 'react-hooks': reactHooksPlugin },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^React$' }],
      'react/no-unknown-property': 'warn',
      'react/jsx-no-duplicate-props': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    },
    settings: { react: { version: 'detect' } }
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tsPlugin, react: reactPlugin, 'react-hooks': reactHooksPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-misused-promises': 'warn',
      'react/no-unknown-property': 'warn',
      'react/jsx-no-duplicate-props': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    },
    settings: { react: { version: 'detect' } }
  },
  {
    files: ['apps/web/**/*.{test,spec}.{js,jsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { test: 'readonly', expect: 'readonly', describe: 'readonly', it: 'readonly', vi: 'readonly' } },
    rules: {}
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { test: 'readonly', expect: 'readonly' } },
    rules: {}
  }
];
