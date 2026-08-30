import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { db } from './db.js';
import { log } from './logger.js';
import type { LinhaBD } from './linhas.js';

/**
 * Migrations versionadas.
 *
 * Substitui o `ensureColumn()` ad-hoc que existia antes. A diferença que
 * interessa: com ficheiros numerados há um histórico do esquema — sabe-se
 * *quando* cada coluna entrou e por que ordem — e o mesmo código produz o
 * mesmo esquema em qualquer máquina. Com `ensureColumn` espalhado pelo
 * arranque, o esquema era o efeito colateral de ler o código todo.
 *
 * Regras:
 *  - Um ficheiro `NNN_nome.sql` por migration, em `backend/migrations/`.
 *  - Nunca editar uma migration já aplicada: cria-se a seguinte.
 *  - Statements separados por `;` e executados em ordem.
 *
 * Uma migration aplicada fica registada em `schema_migrations`, pelo que
 * arrancar duas vezes não a repete.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Migrations cujo efeito já existia no esquema pré-migrations. */
const BASELINE = ['001_esquema_inicial', '002_extensoes'];

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
    args: [name],
  });
  return r.rows.length > 0;
}

/** Divide o ficheiro em statements, ignorando comentários e linhas vazias. */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

export async function runMigrations() {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    (await db.execute('SELECT version FROM schema_migrations')).rows.map((r: LinhaBD) =>
      String(r.version),
    ),
  );

  // Adoção de baseline: bases criadas antes deste sistema já têm o esquema
  // das duas primeiras migrations (vinha do initSchema + ensureColumn).
  // Reaplicar `ALTER TABLE ADD COLUMN` numa coluna existente é erro em SQLite,
  // por isso marcam-se como aplicadas em vez de correr.
  if (applied.size === 0 && (await tableExists('clients'))) {
    for (const version of BASELINE) {
      await db.execute({
        sql: 'INSERT INTO schema_migrations (version) VALUES (?)',
        args: [version],
      });
      applied.add(version);
    }
    log.info({ versions: BASELINE }, 'base existente adotada como baseline');
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of splitStatements(sql)) {
      await db.execute(statement);
    }
    await db.execute({
      sql: 'INSERT INTO schema_migrations (version) VALUES (?)',
      args: [version],
    });
    log.info({ migration: version }, 'migration aplicada');
    count++;
  }

  if (count === 0) log.debug('esquema já atualizado');
  else log.info({ count }, 'migrations aplicadas');
}
