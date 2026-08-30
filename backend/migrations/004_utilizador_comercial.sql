-- Liga a conta de login ao comercial que ela representa.
--
-- Não existia ligação nenhuma entre `users` (quem entra) e `salespeople` (a
-- quem os clientes estão atribuídos). Sem ela é impossível responder à
-- pergunta "este utilizador pode mexer neste cliente?", e por isso qualquer
-- conta autenticada podia editar a carteira de qualquer colega.
--
-- Fica NULL para contas que não representam um comercial (administração,
-- integrações). O que isso significa em termos de permissões está em
-- `backend/src/propriedade.ts`.

ALTER TABLE users ADD COLUMN salesperson_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_salesperson ON users(salesperson_id);
