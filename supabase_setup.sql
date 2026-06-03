-- ═══════════════════════════════════════════════════════════════
--  ALEGRIAS – Cordel 2026  |  Setup Supabase
-- ═══════════════════════════════════════════════════════════════

-- 1. CLIENTES
CREATE TABLE clientes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  codigo     TEXT NOT NULL UNIQUE,
  saldo      NUMERIC(10,2) NOT NULL DEFAULT 0,
  pin_hash   TEXT,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar pin_hash se não existir
DO $$ BEGIN
  ALTER TABLE clientes ADD COLUMN pin_hash TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. BARRACAS
CREATE TABLE barracas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  emoji       TEXT DEFAULT '🏪',
  responsavel TEXT,
  ativa       BOOLEAN DEFAULT TRUE
);

-- Adicionar responsavel se não existir
DO $$ BEGIN
  ALTER TABLE barracas ADD COLUMN responsavel TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

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

-- 3b. PRODUTOS
CREATE TABLE produtos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barraca_id  UUID REFERENCES barracas(id) NOT NULL,
  nome        TEXT NOT NULL,
  preco       NUMERIC(10,2) NOT NULL,
  ativo       BOOLEAN DEFAULT TRUE,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
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

-- ── PRODUTOS POR BARRACA (Cardápio Completo) ───────────────────
-- Primeiro buscamos os IDs das barracas para inserting
DO $$
DECLARE
  pamonha    UUID;
  bolo       UUID;
  lanche     UUID;
  cachorro   UUID;
  milho      UUID;
  acai       UUID;
  bebidas    UUID;
  salgados   UUID;
  pipoca     UUID;
  churrasco  UUID;
  cordelsinho UUID;
BEGIN
  SELECT id INTO pamonha    FROM barracas WHERE nome = 'Pamonha Assada';
  SELECT id INTO bolo       FROM barracas WHERE nome = 'Bolo com Café';
  SELECT id INTO lanche     FROM barracas WHERE nome = 'Lanche no Pote';
  SELECT id INTO cachorro   FROM barracas WHERE nome = 'Cachorro-quente';
  SELECT id INTO milho      FROM barracas WHERE nome = 'Milho, Cuscuz e Caldo';
  SELECT id INTO acai       FROM barracas WHERE nome = 'Açaí';
  SELECT id INTO bebidas    FROM barracas WHERE nome = 'Bebidas';
  SELECT id INTO salgados   FROM barracas WHERE nome = 'Salgados';
  SELECT id INTO pipoca     FROM barracas WHERE nome = 'Pipoca e Docinhos';
  SELECT id INTO churrasco  FROM barracas WHERE nome = 'Churrasco';
  SELECT id INTO cordelsinho FROM barracas WHERE nome = 'Cordelsinho (Pescaria/Camarim/Pula-pula)';

  -- Pamonha Assada 🌽
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (pamonha, 'Pamonha simples', 5, TRUE),
    (pamonha, 'Pamonha com queijo', 6, TRUE),
    (pamonha, 'Pamonha doce', 5, TRUE),
    (pamonha, 'Pamonha Assada', 6, TRUE),
    (pamonha, 'Combo (pamonha + caldo)', 10, TRUE);

  -- Bolo com Café 🍰
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (bolo, 'Bolo de milho', 5, TRUE),
    (bolo, 'Bolo de fubá', 5, TRUE),
    (bolo, 'Bolo caseiro', 6, TRUE),
    (bolo, 'Café', 3, TRUE),
    (bolo, 'Kit bolo + café', 7, TRUE);

  -- Lanche no Pote 🥪
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (lanche, 'Lanche no pote P', 10, TRUE),
    (lanche, 'Lanche no pote G', 14, TRUE),
    (lanche, 'Lanche especial', 16, TRUE),
    (lanche, 'Mini pizza', 8, TRUE);

  -- Cachorro-quente 🌭
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (cachorro, 'Cachorro simples', 8, TRUE),
    (cachorro, 'Cachorro completo', 12, TRUE),
    (cachorro, 'Mini cachorro', 5, TRUE),
    (cachorro, 'Hot dog especial', 14, TRUE);

  -- Milho, Cuscuz e Caldo 🍲
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (milho, 'Milho na espiga', 5, TRUE),
    (milho, 'Cuscuz', 5, TRUE),
    (milho, 'Caldo de cana', 6, TRUE),
    (milho, 'Pipoca doce', 5, TRUE),
    (milho, 'Combo caldo + pamonha', 10, TRUE);

  -- Açaí 🍧
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (acai, 'Açaí P (300ml)', 12, TRUE),
    (acai, 'Açaí M (500ml)', 16, TRUE),
    (acai, 'Açaí G (700ml)', 20, TRUE),
    (acai, 'Açaí c/ granola', 18, TRUE);

  -- Bebidas 🥤
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (bebidas, 'Água', 3, TRUE),
    (bebidas, 'Refrigerante lata', 6, TRUE),
    (bebidas, 'Suco natural', 7, TRUE),
    (bebidas, 'Limonada', 8, TRUE),
    (bebidas, 'H2O', 5, TRUE);

  -- Salgados 🧆
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (salgados, 'Salgado (un.)', 4, TRUE),
    (salgados, 'Coxinha', 5, TRUE),
    (salgados, 'Enroladão', 6, TRUE),
    (salgados, 'Bolinho de bacalhau', 9, TRUE);

  -- Pipoca e Docinhos 🍿
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (pipoca, 'Pipoca', 5, TRUE),
    (pipoca, 'Brigadeiro', 3, TRUE),
    (pipoca, 'Beijinho', 3, TRUE),
    (pipoca, 'Quindim', 4, TRUE),
    (pipoca, 'Brigadeiro + Pipoca', 7, TRUE);

  -- Churrasco 🔥
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (churrasco, 'Espetinho (un.)', 8, TRUE),
    (churrasco, 'Combo 2 espetos', 14, TRUE),
    (churrasco, 'Prato churrasquinho', 20, TRUE),
    (churrasco, 'Mini churrasquinho', 12, TRUE);

  -- Cordelsinho 🎠
  INSERT INTO produtos (barraca_id, nome, preco, ativo) VALUES
    (cordelsinho, 'Pescaria (1x)', 5, TRUE),
    (cordelsinho, 'Camarim (1x)', 5, TRUE),
    (cordelsinho, 'Pula-pula (1x)', 5, TRUE),
    (cordelsinho, 'Combo 3 atividades', 12, TRUE),
    (cordelsinho, 'Pula-pula livre', 15, TRUE);
END;
$$;
CREATE INDEX idx_transacoes_cliente ON transacoes(cliente_id);
CREATE INDEX idx_transacoes_barraca ON transacoes(barraca_id);
CREATE INDEX idx_transacoes_ts      ON transacoes(timestamp DESC);
CREATE INDEX idx_qr_confirmado      ON qr_pendentes(confirmado);

-- ── RLS (Row Level Security) — desabilite para desenvolvimento ───
-- ALTER TABLE clientes   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE barracas   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE transacoes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE qr_pendentes DISABLE ROW LEVEL SECURITY;

-- 5. PEDIDOS (compra direta pelo cliente)
CREATE TABLE pedidos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID REFERENCES clientes(id) NOT NULL,
  barraca_id  UUID REFERENCES barracas(id) NOT NULL,
  itens       TEXT NOT NULL,          -- JSON array: [{nome, preco, qty}]
  valor       NUMERIC(10,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmado')),
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pedidos_barraca    ON pedidos(barraca_id);
CREATE INDEX idx_pedidos_cliente    ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_status     ON pedidos(status);
CREATE INDEX idx_pedidos_criado     ON pedidos(criado_em DESC);

-- Se preferir usar anon key com acesso total (desenvolvimento):
-- Vá em: Supabase > Authentication > Policies
-- E crie policies "allow all" em cada tabela, ou desabilite RLS.
