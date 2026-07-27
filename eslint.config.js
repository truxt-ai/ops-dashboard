'use strict';

const { defineConfig } = require('eslint/config');
const js = require('@eslint/js');

module.exports = defineConfig([
  {
    ignores: ['node_modules/**', 'views/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'no-useless-assignment': 'off',
    },
  },
]);
