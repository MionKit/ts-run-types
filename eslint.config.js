import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.dist/**',
      '**/coverage/**',
      '**/.coverage/**',
      '**/.nx/**',
      'third_party/**',
      'bin/**',
      'examples/**',
      'scripts/**',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      'eslint.config.js',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],
      'no-unused-vars': ['warn', {args: 'none'}],
    },
  }
);
