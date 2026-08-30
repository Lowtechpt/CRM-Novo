-- Esquema base do CRM.
-- Equivalente ao que o antigo initSchema() criava; passa a estar aqui para
-- que o esquema tenha história em vez de ser efeito colateral do arranque.

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nif TEXT, sector TEXT, cae TEXT,
  status TEXT NOT NULL DEFAULT 'Prospeto',
  contact TEXT, score INTEGER DEFAULT 50,
  email TEXT, phone TEXT, website TEXT,
  address TEXT, city TEXT, notes TEXT,
  lat REAL, lng REAL,
  starred INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  notes TEXT, spoke_to TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interlocutors (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL, role TEXT, phone TEXT, email TEXT
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL, value REAL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'Prospecao',
  probability INTEGER DEFAULT 20, due_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agenda (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'Reuniao',
  title TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  done INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS salespeople (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, email TEXT, phone TEXT, role TEXT
);

CREATE TABLE IF NOT EXISTS competition (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  competitor TEXT NOT NULL,
  product TEXT, notes TEXT, outcome TEXT,
  date TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_interlocutors_client ON interlocutors(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_client ON deals(client_id);
CREATE INDEX IF NOT EXISTS idx_agenda_client ON agenda(client_id);
CREATE INDEX IF NOT EXISTS idx_competition_client ON competition(client_id);
