-- ═══════════════════════════════════════════════════════════════
--  AI - Alegria Inteligente (Cordel 2026) | Migração v3
--  Rode este arquivo INTEIRO no SQL Editor do Supabase.
--  É idempotente: pode rodar mais de uma vez sem causar erro.
-- ═══════════════════════════════════════════════════════════════

-- Permite pedidos sem cliente vinculado (vendas em espécie pelo gerente)
ALTER TABLE pedidos ALTER COLUMN cliente_id DROP NOT NULL;
