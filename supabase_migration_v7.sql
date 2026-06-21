-- Migration v7 — corrige a constraint de status dos pedidos.
-- O app passou a usar o status 'pronto' (etapa "pronto p/ retirada") e
-- 'cancelado' (cancelamento), mas a constraint original só permitia
-- ('pendente','confirmado'), causando o erro:
--   new row for relation "pedidos" violates check constraint "pedidos_status_check"
--
-- Rode no Supabase → SQL Editor (ou via MCP).

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;

ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('pendente', 'pronto', 'confirmado', 'cancelado'));
