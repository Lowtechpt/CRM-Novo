import type { IncomingMessage, ServerResponse } from 'http';
import { app, garantirPronta } from '../backend/src/server.js';

/**
 * Ponte para o Vercel.
 *
 * O Express app já sabe responder a (req, res); só falta garantir que as
 * migrações e a conta admin estão prontas antes de o deixar tratar o pedido.
 *
 * `garantirPronta()` é chamada por pedido, não no carregamento do módulo: em
 * caso de falha volta a tentar no pedido seguinte, em vez de deixar a instância
 * a devolver o mesmo erro até ser reciclada.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await garantirPronta();
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Retry-After', '5');
    res.end(JSON.stringify({ error: 'Serviço a arrancar. Tenta de novo dentro de instantes.' }));
    return;
  }
  app(req, res);
}
