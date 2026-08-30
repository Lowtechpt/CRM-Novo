-- Colunas acrescentadas depois do esquema inicial.
-- Antes viviam em chamadas ensureColumn() dispersas pelo arranque.

ALTER TABLE clients ADD COLUMN call_state TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN salesperson_id TEXT;

-- Hierarquia de contas: grupos empresariais e filiais.
-- Ausência disto é queixa recorrente do Pipedrive (ver INVESTIGACAO/).
ALTER TABLE clients ADD COLUMN parent_id TEXT;

-- Receita recorrente por negócio, para MRR/ARR (Pipedrive e Zoho não têm nativo).
ALTER TABLE deals ADD COLUMN recurring_value REAL DEFAULT 0;

ALTER TABLE activities ADD COLUMN salesperson_id TEXT;

-- Concorrência: modelo alinhado com o CRM de referência
ALTER TABLE competition ADD COLUMN competitor_product TEXT;
ALTER TABLE competition ADD COLUMN our_product TEXT;
ALTER TABLE competition ADD COLUMN competitor_value REAL;
ALTER TABLE competition ADD COLUMN our_value REAL;
ALTER TABLE competition ADD COLUMN status TEXT DEFAULT 'Em disputa';
ALTER TABLE competition ADD COLUMN salesperson_id TEXT;
ALTER TABLE competition ADD COLUMN deal_id TEXT;
