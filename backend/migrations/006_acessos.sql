CREATE TABLE IF NOT EXISTS acessos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  ip TEXT,
  agente TEXT,
  entrada_em TEXT NOT NULL DEFAULT (datetime('now')),
  ultima_atividade TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_acessos_entrada ON acessos(entrada_em);
