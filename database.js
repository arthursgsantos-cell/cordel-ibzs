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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { global: { fetch: customFetch } }
);

module.exports = supabase;
