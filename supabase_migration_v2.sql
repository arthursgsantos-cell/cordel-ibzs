-- ═══════════════════════════════════════════════════════════════
--  AI - Alegria Inteligente (Cordel 2026) | Migração v2
--  Rode este arquivo INTEIRO no SQL Editor do Supabase.
--  É idempotente: pode rodar mais de uma vez sem causar erro.
-- ═══════════════════════════════════════════════════════════════

-- 1. Tabela de configuração (senhas do admin e do caixa)
CREATE TABLE IF NOT EXISTS config (
  chave         TEXT PRIMARY KEY,
  valor         TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE config DISABLE ROW LEVEL SECURITY;

-- Senhas iniciais (iguais às atuais — troque depois na aba "Senhas" do Admin)
INSERT INTO config (chave, valor) VALUES
  ('senha_admin', '9999'),
  ('senha_caixa', '5678')
ON CONFLICT (chave) DO NOTHING;

-- 2. Forma de pagamento nas transações
--    ('qr' | 'especie' | 'dinheiro' | 'pix' | 'cartao')
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS forma TEXT;
