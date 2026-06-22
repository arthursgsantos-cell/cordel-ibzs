require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Node 18+ native fetch pode enviar Content-Type: text/plain para corpos string,
// causando erro no PostgREST. Este wrapper força application/json quando há body.
const customFetch = (url, options = {}) => {
  // options.headers pode ser um objeto Headers (instância) ou plain object.
  // Headers instância não é copiada corretamente com spread, então usamos entries().
  const existingHeaders = options.headers instanceof Headers
    ? Object.fromEntries(options.headers.entries())
    : { ...(options.headers || {}) };

  const headers = { ...existingHeaders };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
};

// Preferimos a SERVICE ROLE key (servidor confiável, ignora RLS). Assim podemos
// LIGAR o RLS no banco: mesmo que a chave pública (anon) vaze num cliente antigo,
// ela não consegue ler/escrever nada. Se a service_role não estiver configurada,
// caímos na anon key (compatibilidade) — mas o ideal é configurá-la no Render.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY não definida — usando ANON key. Defina a service_role no Render e ligue o RLS (supabase_migration_v8.sql).');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  SUPABASE_KEY,
  { global: { fetch: customFetch }, auth: { persistSession: false, autoRefreshToken: false } }
);

module.exports = supabase;
