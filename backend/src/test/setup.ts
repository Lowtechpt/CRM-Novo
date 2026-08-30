import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Ambiente da suite de testes.
 *
 * Corre ANTES de qualquer import dos módulos da aplicação, que é o que
 * importa: `db.ts` lê TURSO_URL no momento em que é carregado. Se estas
 * variáveis fossem definidas dentro de um teste, já seria tarde — a suite
 * escreveria na base de dados real.
 *
 * Cada execução usa uma base própria numa pasta temporária, apagada no fim.
 */

process.env.NODE_ENV = 'test';

const dir = mkdtempSync(join(tmpdir(), 'crm-test-'));
process.env.TURSO_URL = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;
delete process.env.TURSO_AUTH_TOKEN;

// Segredo fixo: os testes precisam de assinar tokens de forma determinística.
process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

// Conta semeada no arranque, usada pelos helpers para autenticar.
process.env.ADMIN_EMAIL = 'admin@teste.pt';
process.env.ADMIN_PASSWORD = 'teste-1234';
process.env.ADMIN_NAME = 'Admin Teste';

// Nada de logs a poluir a saída da suite.
process.env.LOG_LEVEL = 'silent';

// A suite faz dezenas de logins legítimos. O limite fica alto o suficiente
// para não os travar, mas finito — há um teste que o esgota de propósito.
process.env.LOGIN_RATE_LIMIT = '60';

// A chave da IA é deliberadamente removida: nenhum teste deve chamar a API
// externa. Se algum o tentar, falha de imediato em vez de gastar quota.
delete process.env.KILO_API_KEY;

export async function teardown() {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* no Windows o ficheiro pode continuar aberto; a pasta temporária é limpa pelo SO */
  }
}
