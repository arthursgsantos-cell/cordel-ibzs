-- ═══════════════════════════════════════════════════════════════
--  AI - Alegria Inteligente (Cordel 2026) | Migração v5
--  Rode este arquivo INTEIRO no SQL Editor do Supabase.
--  É idempotente: pode rodar mais de uma vez sem causar erro.
-- ═══════════════════════════════════════════════════════════════

-- Registra quem operou a transação (nome do caixa nas recargas,
-- nome do gerente nas vendas em espécie). Aparece nos históricos.
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS operador TEXT;
