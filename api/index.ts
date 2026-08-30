import type { IncomingMessage, ServerResponse } from 'http';
import { app, pronta } from '../backend/src/server.js';

/**
 * Ponte para o Vercel.
 *
 * O Express app já sabe responder a (req, res); só falta esperar que as
 * migrações e a conta admin estejam prontas antes de o deixar tratar o
 * pedido — ver o comentário em `pronta`, em server.ts.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await pronta;
  app(req, res);
}
