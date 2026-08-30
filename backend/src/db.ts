import { createClient } from '@libsql/client';

const url = process.env.TURSO_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient(authToken ? { url, authToken } : { url });

/**
 * O esquema vive em `backend/migrations/*.sql` e é aplicado por
 * `runMigrations()` (ver migrations.ts). Este ficheiro só expõe a ligação.
 */
