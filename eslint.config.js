import globals from 'globals';

export default [
  {
    ignores: [
      'app/vendor/**',
      'app/js/data/basemap.js',
      'app/js/data/local/**',
      'src-tauri/**',
      'legacy/**',
      'tests/fixtures/**',
      'tests/golden/**',
      'node_modules/**',
    ],
  },
  {
    files: ['app/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-unreachable': 'warn',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-empty': 'off',
    },
  },
  { files: ['app/js/app/dialogs.js'], languageOptions: { sourceType: 'script' } },
  {
    files: ['tests/**/*.mjs', 'tools/**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-undef': 'error' },
  },
];
