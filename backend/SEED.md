# Seed de Amostras — CRM Pessoal

## Como usar

1. Garante que o backend está a correr.
2. Executa o seed com uma ferramenta de HTTP ou diretamente pelo browser:
   - `POST http://localhost:3001/api/seed`
3. O seed apaga os dados existentes nas tabelas `clients`, `interlocutors`, `deals`, `activities` e `agenda` e insere 5 registos de exemplo em cada.

## Estrutura

- `backend/src/seed.ts` — seed executável via rota `/api/seed`
- `backend/src/server.ts` — rota já montada
