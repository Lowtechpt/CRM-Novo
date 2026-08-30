import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Regras de lint partilhadas por backend e frontend.
 *
 * O que está aqui é o que já causou problemas neste projeto, não uma lista
 * copiada: `no-floating-promises` apanha o `await` esquecido numa escrita à
 * base de dados, e as regras de hooks apanham o array de dependências
 * incompleto — que foi a causa de o registo de voz se repetir 12 vezes.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/graphify-out/**',
      '**/*.js',
      '**/*.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Um `_` à frente marca "não usado de propósito" (ex.: `_req` no Express).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // `any` é usado para as linhas cruas do libsql; avisa mas não bloqueia.
      '@typescript-eslint/no-explicit-any': 'warn',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
    },
  },

  // Backend: código de servidor, sem DOM.
  {
    files: ['backend/src/**/*.ts'],
    languageOptions: {
      parserOptions: { project: './backend/tsconfig.json' },
    },
    rules: {
      // Uma promessa de escrita na base de dados sem `await` perde-se em
      // silêncio e a resposta sai antes de os dados estarem gravados.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },

  // Frontend: React.
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },

  // Testes: mais liberdade (mocks precisam de `any`).
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);
