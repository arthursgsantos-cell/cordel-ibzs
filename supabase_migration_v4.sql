-- ═══════════════════════════════════════════════════════════════
--  AI - Alegria Inteligente (Cordel 2026) | Migração v4
--  Rode este arquivo INTEIRO no SQL Editor do Supabase.
--  É idempotente: pode rodar mais de uma vez sem causar erro.
-- ═══════════════════════════════════════════════════════════════

-- Desativa RLS em todas as tabelas operacionais do app
-- (necessário para que DELETE/UPDATE via anon key funcionem no servidor)
ALTER TABLE transacoes   DISABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos      DISABLE ROW LEVEL SECURITY;
ALTER TABLE clientes     DISABLE ROW LEVEL SECURITY;
ALTER TABLE barracas     DISABLE ROW LEVEL SECURITY;
ALTER TABLE produtos     DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
