-- Regista QUEM fez cada alteração.
--
-- Sem isto, o histórico dizia "Estado: Prospeto -> Ativo" sem dizer por quem —
-- o que não serve como auditoria num CRM com vários utilizadores. O nome fica
-- desnormalizado de propósito: o histórico tem de continuar legível mesmo
-- depois de a conta ser apagada.

ALTER TABLE audit_log ADD COLUMN user_id TEXT;
ALTER TABLE audit_log ADD COLUMN user_name TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
