-- Execute este SQL no Supabase SQL Editor para adicionar a tabela de produtos
CREATE TABLE produtos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barraca_id UUID REFERENCES barracas(id),
  nome       TEXT NOT NULL,
  preco      NUMERIC(10,2) NOT NULL,
  ativo      BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_produtos_barraca ON produtos(barraca_id);
