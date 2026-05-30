-- ═══════════════════════════════════════════════════════════════
--  ALEGRIAS – Cordel 2026  |  Setup Supabase
-- ═══════════════════════════════════════════════════════════════

-- 1. CLIENTES
CREATE TABLE clientes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  codigo     TEXT NOT NULL UNIQUE,
  saldo      NUMERIC(10,2) NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BARRACAS
CREATE TABLE barracas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  emoji       TEXT DEFAULT '🏪',
  responsavel TEXT,
  ativa       BOOLEAN DEFAULT TRUE
);

-- 3. TRANSAÇÕES
CREATE TABLE transacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL CHECK (tipo IN ('venda','recarga')),
  cliente_id  UUID REFERENCES clientes(id),
  barraca_id  UUID REFERENCES barracas(id),
  valor       NUMERIC(10,2) NOT NULL,
  itens       TEXT,
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);

-- 4. QR PENDENTES
CREATE TABLE qr_pendentes (
  id          UUID PRIMARY KEY,
  barraca_id  UUID REFERENCES barracas(id),
  valor       NUMERIC(10,2) NOT NULL,
  itens       TEXT,
  confirmado  BOOLEAN DEFAULT FALSE,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ── BARRACAS DO EVENTO ──────────────────────────────────────────
INSERT INTO barracas (nome, emoji, ativa) VALUES
  ('Pamonha Assada',                              '🌽', TRUE),
  ('Bolo com Café',                               '🍰', TRUE),
  ('Lanche no Pote',                              '🥪', TRUE),
  ('Cachorro-quente',                             '🌭', TRUE),
  ('Milho, Cuscuz e Caldo',                       '🍲', TRUE),
  ('Açaí',                                        '🍧', TRUE),
  ('Bebidas',                                     '🥤', TRUE),
  ('Salgados',                                    '🧆', TRUE),
  ('Pipoca e Docinhos',                           '🍿', TRUE),
  ('Churrasco',                                   '🔥', TRUE),
  ('Cordelsinho (Pescaria/Camarim/Pula-pula)',    '🎠', TRUE);

-- ── ÍNDICES ──────────────────────────────────────────────────────
CREATE INDEX idx_transacoes_cliente ON transacoes(cliente_id);
CREATE INDEX idx_transacoes_barraca ON transacoes(barraca_id);
CREATE INDEX idx_transacoes_ts      ON transacoes(timestamp DESC);
CREATE INDEX idx_qr_confirmado      ON qr_pendentes(confirmado);

-- ── RLS (Row Level Security) — desabilite para desenvolvimento ───
-- ALTER TABLE clientes   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE barracas   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE transacoes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE qr_pendentes DISABLE ROW LEVEL SECURITY;

-- Se preferir usar anon key com acesso total (desenvolvimento):
-- Vá em: Supabase > Authentication > Policies
-- E crie policies "allow all" em cada tabela, ou desabilite RLS.
