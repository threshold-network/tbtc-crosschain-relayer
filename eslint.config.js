import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores - these apply to all subsequent configurations
  {
    ignores: [
      'node_modules/',
      'dist/', // Ignore all compiled output
      'build/',
      'coverage/',
      'logs/',
      '*.log',
      'jest.config.js', // Often uses require (matches .eslintrc.js)
      'jest.setup.js',
      '.eslintrc.js', // Old ESLint config file (matches .eslintrc.js)
    ],
  },
  // Base JS config (applies to .js files not caught by TS config)
  js.configs.recommended,
  {
    files: ['.js'], // Specifically target JS files for JS globals
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
      },
      sourceType: 'commonjs', // Assume CommonJS for .js files unless specified otherwise in package.json
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
      parser: tsParser, // Specifies the ESLint parser for TypeScript (from .eslintrc.js)
      parserOptions: {
        ecmaVersion: 'latest', // Allows for the parsing of modern ECMAScript features (from .eslintrc.js)
        sourceType: 'module', // Allows for the use of imports (from .eslintrc.js)
        project: './tsconfig.json', // Important for rules requiring type information (from .eslintrc.js)
      },
      globals: {
        ...globals.node, // Enables Node.js global variables and Node.js scoping (from .eslintrc.js env.node)
        ...globals.jest, // Adds Jest global variables (from .eslintrc.js env.jest)
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin, // Loads the plugin "@typescript-eslint/eslint-plugin" (from .eslintrc.js)
      prettier: prettierPlugin, // Loads the plugin "eslint-plugin-prettier" (from .eslintrc.js)
    },
    rules: {
      // Start with recommended rules and override as needed
      ...tsPlugin.configs.recommended.rules, // Uses the recommended rules from @typescript-eslint/eslint-plugin (from .eslintrc.js extends)
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules, // Uses the recommended rules from ESLint (from .eslintrc.js extends)
      ...prettierConfig.rules, // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors (from .eslintrc.js extends plugin:prettier/recommended)

      // Custom rules / Overrides from .eslintrc.js
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }, // Rule to find unused variables/imports (from .eslintrc.js)
      ],
      '@typescript-eslint/no-explicit-any': 'warn', // Warn about using 'any' type (from .eslintrc.js)

      // Additional rules from existing eslint.config.js, kept for consistency
      'prettier/prettier': 'error',
      'no-case-declarations': 'off',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
