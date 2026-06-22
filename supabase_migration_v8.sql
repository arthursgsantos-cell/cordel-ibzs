-- ════════════════════════════════════════════════════════════════════════════
--  Migração v8 — SEGURANÇA: ligar Row Level Security (RLS) em TODAS as tabelas
-- ════════════════════════════════════════════════════════════════════════════
--
--  POR QUÊ: até aqui o RLS estava DESLIGADO e o servidor usava a chave "anon"
--  (pública). Se essa chave vazasse, qualquer um leria/gravaria o banco direto,
--  sem passar pelo servidor — exatamente o tipo de furo que permitiu as fraudes.
--
--  COMO FUNCIONA: com o RLS LIGADO e SEM policies, a chave anon fica sem acesso
--  a nada. O servidor passa a usar a chave SERVICE_ROLE, que IGNORA o RLS — ou
--  seja, o app continua funcionando 100%, mas só através do servidor.
--
--  ⚠️ ORDEM OBRIGATÓRIA (senão o app sai do ar):
--    1) No Render, configure a variável SUPABASE_SERVICE_ROLE_KEY
--       (Supabase → Project Settings → API → service_role  "secret").
--    2) Faça o redeploy e confirme que o app abre normalmente.
--    3) SÓ ENTÃO rode este SQL (Supabase → SQL Editor).
--
--  Para conferir depois:  os logs do servidor NÃO devem mostrar o aviso
--  "SUPABASE_SERVICE_ROLE_KEY não definida".
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE clientes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE barracas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_pendentes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log  ENABLE ROW LEVEL SECURITY;

-- (Opcional, recomendado) FORCE garante que nem o "owner" da tabela escape do RLS.
-- A service_role continua ignorando o RLS de qualquer forma.
ALTER TABLE clientes      FORCE ROW LEVEL SECURITY;
ALTER TABLE barracas      FORCE ROW LEVEL SECURITY;
ALTER TABLE transacoes    FORCE ROW LEVEL SECURITY;
ALTER TABLE qr_pendentes  FORCE ROW LEVEL SECURITY;
ALTER TABLE pedidos       FORCE ROW LEVEL SECURITY;
ALTER TABLE produtos      FORCE ROW LEVEL SECURITY;
ALTER TABLE config        FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_log  FORCE ROW LEVEL SECURITY;

-- Conferência: deve listar todas as tabelas com rowsecurity = true
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
