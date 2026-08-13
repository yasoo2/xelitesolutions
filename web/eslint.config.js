import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * THE CONFIG THAT DID NOT KNOW ITS OWN RULES.
 *
 * `JoeIDELayout.tsx` carries an `eslint-disable-next-line
 * react-hooks/exhaustive-deps`, and this config never defined the plugin that
 * rule belongs to — so `npm run lint` failed outright with «Definition for
 * rule 'react-hooks/exhaustive-deps' was not found». Not a warning: an error,
 * on a command that is supposed to be the gate. A lint that cannot run is a
 * lint nobody will fix.
 *
 * The rules are registered as warnings rather than errors on purpose. Turning
 * them on as errors today would fail the build on code that already exists,
 * which is how a gate gets switched off for good. They are visible now, and
 * they get driven to zero before they start blocking.
 */
export default [
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];
