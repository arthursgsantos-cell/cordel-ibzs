-- ═══════════════════════════════════════════════════════════════
--  AI - Alegria Inteligente (Cordel 2026) | Migração v6
--  Rode este arquivo INTEIRO no SQL Editor do Supabase.
--  É idempotente: pode rodar mais de uma vez sem causar erro.
-- ═══════════════════════════════════════════════════════════════

-- Avatar do cliente: config JSON com as escolhas de personalização
-- (fundo, pele, cabelo, chapéu, acessório, expressão). O avatar é
-- redesenhado em SVG no app a partir desta config — nada de imagem.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS avatar JSONB;
