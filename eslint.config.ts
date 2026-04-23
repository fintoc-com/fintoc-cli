import antfu from '@antfu/eslint-config'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

export default antfu(
  {
    typescript: true,
    vue: false,
    stylistic: false,
    jsonc: false,
    yaml: false,
    markdown: false,
    toml: false,
    ignores: ['dist/**', 'node_modules/**'],
  },
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          printWidth: 100,
          singleQuote: true,
          semi: false,
        },
      ],
      'ts/no-explicit-any': 'error',
      'ts/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'ts/consistent-type-imports': 'error',
      'ts/consistent-type-definitions': ['error', 'type'],
      'no-console': 'error',
      'node/prefer-global/process': 'off',
      'test/consistent-test-it': ['error', { fn: 'test', withinDescribe: 'test' }],
    },
  },
)
