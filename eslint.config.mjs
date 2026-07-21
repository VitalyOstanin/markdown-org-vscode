import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['out/**', 'node_modules/**', '.vscode-test/**', 'media/**', 'docs/**']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module'
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-require-imports': 'error',
            radix: ['error', 'always']
        }
    },
    {
        files: ['src/test/unit/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'vscode',
                            message:
                                'Unit tests must not import the vscode API. Put VS Code-dependent assertions in src/test/integration/*.integration.test.ts.'
                        }
                    ]
                }
            ]
        }
    },
    // Must be last: disables any ESLint rules that would conflict with
    // Prettier's formatting. The current config declares no stylistic rules, so
    // this is defence-in-depth for future rule additions rather than a fix for
    // an active conflict.
    prettier
);
