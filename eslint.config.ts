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
      // TypeScript
      'ts/no-explicit-any': 'error',
      'ts/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'ts/consistent-type-imports': 'error',
      'ts/consistent-type-definitions': ['error', 'type'],
      'ts/ban-ts-comment': 'error',
      'ts/no-non-null-asserted-optional-chain': 'error',

      // Code quality
      'no-console': 'error',
      curly: ['error', 'all'],
      'consistent-return': 'error',
      'no-constant-binary-expression': 'error',
      'no-constant-condition': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vitest',
              importNames: ['it'],
              message: "Please use 'test' instead.",
            },
          ],
        },
      ],
      'node/prefer-global/process': 'off',

      // Test
      'test/prefer-lowercase-title': 'off',
      'test/consistent-test-it': ['error', { fn: 'test', withinDescribe: 'test' }],
    },
  },
)
