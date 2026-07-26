import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

// Node globals used by the CommonJS scripts and the .mjs configs. Declared by
// hand rather than pulling in the `globals` package for seven names.
const nodeGlobals = {
    require: 'readonly',
    module: 'writable',
    exports: 'writable',
    process: 'readonly',
    console: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    URL: 'readonly',
    Buffer: 'readonly'
};

// Node built-ins are imported with the `node:` prefix everywhere, so a package
// in node_modules cannot shadow one and resolution skips the package lookup.
// The pin is `no-restricted-imports` rather than `n/prefer-node-protocol` or
// `unicorn/prefer-node-protocol`: either would mean a dev dependency and a rule
// set to tune for the single rule actually wanted here.
const bareNodeBuiltins = [
    'assert',
    'assert/strict',
    'buffer',
    'child_process',
    'crypto',
    'dns',
    'events',
    'fs',
    'fs/promises',
    'http',
    'https',
    'module',
    'net',
    'os',
    'path',
    'process',
    'querystring',
    'readline',
    'stream',
    'stream/promises',
    'string_decoder',
    'timers',
    'timers/promises',
    'tls',
    'tty',
    'url',
    'util',
    'worker_threads',
    'zlib'
];

const noBareNodeBuiltins = bareNodeBuiltins.map((name) => ({
    name,
    message: `Import Node built-ins with the 'node:' prefix -- 'node:${name}'.`
}));

export default tseslint.config(
    {
        ignores: ['out/**', 'node_modules/**', '.vscode-test/**', 'coverage/**', 'media/**', 'docs/**']
    },
    js.configs.recommended,
    // Type-aware linting: the rules that need a TypeScript program (floating
    // promises, misused promises, unnecessary assertions) cannot run without
    // one, and the plugin silently skips them otherwise. `projectService`
    // hands ESLint the same program `tsc -b` builds, both projects included.
    ...tseslint.configs.recommendedTypeChecked.map((config) => ({
        ...config,
        files: ['**/*.ts']
    })),
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-require-imports': 'error',
            // An async function with no await is usually a signature that
            // outgrew its body, or one about to grow back into it; worth
            // seeing, not worth failing a build over.
            '@typescript-eslint/require-await': 'warn',
            radix: ['error', 'always'],
            // A type-only import erases at emit; a value import does not. The
            // distinction is load-bearing here, because the helpers inlined
            // into the agenda page travel as bare function sources: a value
            // import in one of those modules becomes an `exports.NAME` read
            // that is undefined in the page. Spelling the harmless case
            // `import type` leaves any real import visible in review -- on its
            // own line, which is why the fix keeps type and value imports in
            // separate declarations rather than inlining `type` markers into a
            // mixed one.
            '@typescript-eslint/consistent-type-imports': 'error'
        }
    },
    // Import hygiene. `no-unresolved` stays off: `npm run typecheck` already
    // resolves every specifier against the same tsconfig, and the rule would
    // only duplicate it more slowly.
    {
        files: ['**/*.ts'],
        plugins: { 'import-x': importX },
        settings: {
            'import-x/resolver-next': [createTypeScriptImportResolver()]
        },
        rules: {
            // `vscode` is pulled ahead of the Node built-ins on purpose: the
            // host modules have always opened with it, and it reads as what the
            // file is -- extension code -- before anything else.
            'import-x/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
                    pathGroups: [{ pattern: 'vscode', group: 'builtin', position: 'before' }],
                    pathGroupsExcludedImportTypes: ['builtin']
                }
            ],
            'import-x/no-cycle': 'error',
            'import-x/no-duplicates': 'error',
            'import-x/no-self-import': 'error',
            'import-x/no-useless-path-segments': 'error'
        }
    },
    // Plain scripts and configs: same baseline rules, no type-aware ones (they
    // are outside the TypeScript program). `eslint .` covers them now -- the
    // lint script used to scan `src` only, so these files were never checked.
    {
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            globals: nodeGlobals
        }
    },
    {
        // Baseline for every file, whatever its extension: `no-var` and
        // `prefer-const` otherwise arrive only through the TypeScript preset,
        // and `eqeqeq` came from nowhere at all.
        rules: {
            'no-var': 'error',
            'prefer-const': 'error',
            // `null: 'ignore'` keeps the deliberate `value == null` idiom (one
            // check covering null and undefined) and rejects every other loose
            // comparison.
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-restricted-imports': ['error', { paths: noBareNodeBuiltins }]
        }
    },
    {
        // Test code drives stubs and hand-built payloads, where `any` flows in
        // from sinon and from JSON fixtures by design, and where passing an
        // assertion helper around is not the unbound-method hazard the rule is
        // about. Keeping these on would mean casting noise in every stub.
        files: ['src/test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off'
        }
    },
    {
        files: ['src/test/unit/**/*.ts'],
        rules: {
            // Repeats the built-in restriction: a rule configured twice is not
            // merged, the later config replaces the earlier one outright, so
            // dropping it here would let unit tests import `fs` bare again.
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        ...noBareNodeBuiltins,
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
