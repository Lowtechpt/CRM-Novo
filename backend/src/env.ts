import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Carrega backend/.env.local.
 *
 * Isto vive num módulo próprio por causa de como os módulos ESM são avaliados:
 * TODOS os `import` de um ficheiro são resolvidos e executados ANTES da
 * primeira linha do corpo desse ficheiro. Ter o carregamento no topo de
 * `server.ts` parecia certo mas corria tarde demais — quando `auth.ts` e
 * `db.ts` liam `process.env`, o ficheiro ainda não tinha sido lido. O resultado
 * era o servidor a avisar que faltava o JWT_SECRET (assinando com um segredo
 * efémero, o que expulsava todas as sessões a cada reinício) e a ignorar o
 * TURSO_URL configurado.
 *
 * Como módulo separado importado em primeiro lugar, executa antes dos outros.
 *
 * Em testes não se carrega nada: o ambiente é montado por `test/setup.ts`, e
 * ler o ficheiro aqui podia apontar a suite à base de dados real.
 */

const caminho = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local');

if (process.env.NODE_ENV !== 'test' && existsSync(caminho)) {
  process.loadEnvFile(caminho);
}
