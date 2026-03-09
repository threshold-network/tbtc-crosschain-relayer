import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  // Global ignores - these apply to all subsequent configurations
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      'logs/',
      '*.log',
      'jest.config.cjs',
      'jest.setup.js',
      'test/',
    ],
  },
  // Config for Jest global setup/teardown files
  {
    files: ['jest.global-setup.js', 'jest.global-teardown.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest, // Jest might inject some globals here too
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
      },
      sourceType: 'commonjs',
    },
    rules: {
      'no-undef': 'error', // These files should have well-defined globals
    },
  },
  js.configs.recommended,
  {
    files: ['.js', '*.config.js'],
    ignores: ['jest.global-setup.js', 'jest.global-teardown.js', 'eslint.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
      },
      sourceType: 'commonjs',
    },
    rules: {
      'no-undef': 'warn',
      'no-case-declarations': 'off', // Also turn off for JS if necessary
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'require-yield': 'off', // Often a false positive for transpiled async without await
    },
  },
  // TypeScript specific configuration
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.jest, // Adds Jest global variables
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts'],
        },
      },
      'import/parsers': {
        // Specify parser for .ts/.tsx files
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
    },
    rules: {
      // Start with recommended rules and override as needed
      ...tsPlugin.configs.recommended.rules,
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...prettierConfig.rules,
      ...(importPlugin.configs.recommended ? importPlugin.configs.recommended.rules : {}),
      ...(importPlugin.configs.typescript ? importPlugin.configs.typescript.rules : {}),

      // Custom rules / Overrides from .eslintrc.js
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      'prettier/prettier': 'error',
      'no-case-declarations': 'off',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Enforce .js extension for all local imports
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          js: 'always',
          jsx: 'always',
          ts: 'never',
          tsx: 'never',
        },
      ],
    },
  },
  // Add a separate config object for test files to override no-explicit-any
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
