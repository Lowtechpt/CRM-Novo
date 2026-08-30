import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import type { LinhaBD } from './linhas.js';

/**
 * Quem pode mexer em que cliente.
 *
 * O problema: não havia resposta nenhuma para esta pergunta. Os clientes têm
 * `salesperson_id`, as contas de login têm `role`, e não existia ligação entre
 * as duas coisas — pelo que qualquer utilizador autenticado podia editar ou
 * reatribuir a carteira de qualquer colega, sem que isso fosse uma decisão de
 * ninguém. Era um vazio, não uma política.
 *
 * A política agora é explícita:
 *
 *  - **admin** — acesso total. Gere a equipa e a carteira toda.
 *  - **user ligado a um comercial** (`users.salesperson_id`) — só altera
 *    clientes seus ou ainda sem responsável. Pode reclamar um cliente órfão;
 *    não pode tirar um cliente a um colega.
 *  - **user não ligado** — acesso de leitura mais criação. Não altera fichas
 *    de clientes já atribuídos.
 *
 * A leitura fica aberta de propósito: a investigação que orienta este CRM
 * (INVESTIGACAO/top5-crms-mundiais.md) aponta o excesso de fricção como causa
 * principal de não adoção, e uma equipa comercial pequena precisa de ver a
 * carteira toda para se substituir em férias e passar contactos. O que se
 * fecha é a **escrita** sobre trabalho alheio, que é onde o estrago acontece.
 */

/** O comercial que esta conta representa, ou null. */
async function comercialDoUtilizador(userId: string): Promise<string | null> {
  const r = await db.execute({
    sql: 'SELECT salesperson_id FROM users WHERE id = ?',
    args: [userId],
  });
  const linha = r.rows[0] as LinhaBD | undefined;
  return linha?.salesperson_id ? String(linha.salesperson_id) : null;
}

/**
 * Exige que o cliente em `req.params.id` seja do utilizador (ou de ninguém).
 *
 * Assume `requireAuth` antes dele.
 */
export async function exigirPropriedade(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Autenticação necessária.' });
  if (req.user.role === 'admin') return next();

  const r = await db.execute({
    sql: 'SELECT salesperson_id FROM clients WHERE id = ?',
    args: [String(req.params.id)],
  });
  const cliente = r.rows[0] as LinhaBD | undefined;
  if (!cliente) return res.status(404).json({ error: 'não encontrado' });

  const dono = cliente.salesperson_id ? String(cliente.salesperson_id) : null;
  // Cliente sem responsável é de quem lhe pegar: bloquear aqui só criaria
  // trabalho parado à espera de um administrador.
  if (!dono) return next();

  const meu = await comercialDoUtilizador(req.user.id);
  if (meu && dono === meu) return next();

  return res.status(403).json({
    error: 'Este cliente está atribuído a outro comercial.',
  });
}
