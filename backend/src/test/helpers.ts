import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { app } from '../server.js';
import { db } from '../db.js';
import { runMigrations } from '../migrations.js';
import { initAuthSchema } from '../auth.js';

/**
 * Utilitários partilhados pelos testes de rotas.
 *
 * `app` é importado sem arrancar o `listen()` — o server.ts só ouve quando
 * NODE_ENV não é 'test'. Supertest liga-se diretamente ao handler.
 */

export { app, db };
export const req = () => request(app);

let ready = false;

/** Aplica migrations e cria a conta inicial. Idempotente. */
export async function prepararBase() {
  if (ready) return;
  await runMigrations();
  await initAuthSchema();
  ready = true;
}

/** Esvazia as tabelas de dados, preservando utilizadores e esquema. */
export async function limparDados() {
  for (const t of [
    'audit_log',
    'competition',
    'agenda',
    'deals',
    'interlocutors',
    'activities',
    'clients',
    'salespeople',
  ]) {
    await db.execute(`DELETE FROM ${t}`);
  }
}

/** Cria um utilizador com o papel indicado e devolve o token dele. */
export async function tokenPara(role: 'admin' | 'user'): Promise<string> {
  const email = `${role}-${randomUUID().slice(0, 8)}@teste.pt`;
  const password = 'teste-1234';
  await db.execute({
    sql: 'INSERT INTO users (id,email,name,password_hash,role) VALUES (?,?,?,?,?)',
    args: [randomUUID(), email, `Utilizador ${role}`, await bcrypt.hash(password, 10), role],
  });

  const res = await req().post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login de teste falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

/** Cliente de exemplo válido, com os campos que o schema exige. */
export function clienteExemplo(over: Record<string, unknown> = {}) {
  return {
    name: 'Móveis Alentejo, Lda',
    nif: '501234567',
    sector: 'Mobiliário',
    status: 'Prospeto',
    email: 'geral@moveisalentejo.pt',
    phone: '266 123 456',
    city: 'Évora',
    score: 60,
    ...over,
  };
}

/** Insere um cliente via API e devolve-o. */
export async function criarCliente(token: string, over = {}) {
  const res = await req()
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send(clienteExemplo(over));
  if (res.status !== 201) {
    throw new Error(`criar cliente falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
}
