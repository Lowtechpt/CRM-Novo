import type { Request, Response, RequestHandler } from 'express';
import { db } from './db.js';
import { requireRole } from './auth.js';

/**
 * Eliminação protegida e auditada.
 *
 * Antes, cada rota tinha o seu próprio DELETE de três linhas: sem verificação
 * de papel, sem 404, e sem deixar rasto. Só a eliminação de clientes estava
 * protegida — o que significa que qualquer conta `user` podia apagar negócios,
 * agenda, atividades, interlocutores, comerciais e registos de concorrência,
 * um a um, sem que ficasse registo de nada.
 *
 * Concentrar isto num sítio garante que as três coisas andam sempre juntas:
 * quem pode, o registo existe mesmo, e fica escrito quem o apagou.
 *
 * O rótulo é desnormalizado de propósito: o histórico tem de continuar legível
 * depois de a linha desaparecer.
 */
export function eliminarComAuditoria(opts: {
  /** Tabela onde apagar. Valor fixo no código — nunca vem do pedido. */
  tabela: string;
  /** Nome da entidade no histórico (ex.: 'deal'). */
  entidade: string;
  /** Colunas a ler antes de apagar, para compor o rótulo. */
  colunas: string;
  /** Texto legível do que foi apagado. */
  rotulo: (linha: Record<string, unknown>) => string;
}): RequestHandler[] {
  const handler = async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const antes = await db.execute({
      sql: `SELECT ${opts.colunas} FROM ${opts.tabela} WHERE id = ?`,
      args: [id],
    });
    if (!antes.rows.length) return res.status(404).json({ error: 'não encontrado' });

    const descricao = opts.rotulo(antes.rows[0] as Record<string, unknown>);

    /* Apagar e registar são uma coisa só. Em sequência, uma falha entre as
       duas deixava o registo apagado sem rasto nenhum — precisamente o cenário
       em que a auditoria faria falta. `batch` com modo `write` corre as duas
       na mesma transação: ou entram ambas, ou nenhuma. */
    await db.batch(
      [
        { sql: `DELETE FROM ${opts.tabela} WHERE id = ?`, args: [id] },
        {
          sql: `INSERT INTO audit_log (entity,entity_id,field,old_value,new_value,user_id,user_name)
                VALUES (?,?,?,?,?,?,?)`,
          args: [
            opts.entidade,
            id,
            'Eliminado',
            descricao,
            '',
            req.user?.id ?? null,
            req.user?.name ?? null,
          ],
        },
      ],
      'write',
    );

    res.status(204).end();
  };

  return [requireRole('admin'), handler as RequestHandler];
}
