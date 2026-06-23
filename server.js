require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const crypto = require('crypto');
const supabase = require('./database');

const app = express();
// Render coloca exatamente 1 proxy na frente do app. Com isso, req.ip passa a ser
// o IP REAL do cliente (o último salto antes do proxy) e NÃO o que o atacante
// injeta no cabeçalho X-Forwarded-For. Sem isto, todo rate-limit/anti-brute-force
// era contornável só mandando um X-Forwarded-For falso a cada requisição.
app.set('trust proxy', 1);
// O front é servido pelo PRÓPRIO servidor (express.static), então requisições
// são de mesma origem e não precisam de CORS. Por padrão NÃO liberamos outras
// origens (mais seguro). Para permitir um domínio externo específico, defina
// APP_ORIGIN no ambiente (ex.: https://meuapp.com).
app.use(cors(process.env.APP_ORIGIN ? { origin: process.env.APP_ORIGIN } : { origin: false }));
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));
app.use(express.static('public'));

// ════════════════════════════════════════════════════════════════════════════
//  SEGURANÇA — autorização de staff + anti-flood (em memória, sem dependências)
//  Contexto: antes, TODAS as rotas eram públicas. Um bot criou ~950 contas e
//  setou 50.000 de saldo via PUT /api/clientes/:id. Aqui exigimos o código de
//  admin/caixa (header x-staff-codigo) nas ações sensíveis e limitamos a taxa.
// ════════════════════════════════════════════════════════════════════════════
function ipDe(req) {
  // req.ip respeita 'trust proxy' acima: é o IP real do cliente, não o que o
  // atacante forja em X-Forwarded-For. NÃO voltar a ler o cabeçalho diretamente.
  return req.ip || req.socket?.remoteAddress || 'desconhecido';
}

// Limitador de taxa por IP+rota (janela deslizante simples).
const _hits = new Map();
function rateLimit(nome, windowMs, max) {
  return (req, res, next) => {
    const key = nome + ':' + ipDe(req);
    const now = Date.now();
    let e = _hits.get(key);
    if (!e || now - e.start > windowMs) { e = { start: now, count: 0 }; _hits.set(key, e); }
    e.count++;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: 'Muitas requisições. Aguarde um momento e tente de novo.' });
    }
    next();
  };
}

// Bloqueio progressivo após muitas falhas de código (anti força-bruta no PIN).
const _staffFails = new Map();
function staffBloqueado(req) {
  const f = _staffFails.get(ipDe(req));
  return !!(f && Date.now() - f.start < 600000 && f.count >= 25);
}
function registrarFalhaStaff(req) {
  const ip = ipDe(req); const now = Date.now();
  let f = _staffFails.get(ip);
  if (!f || now - f.start > 600000) { f = { start: now, count: 0 }; _staffFails.set(ip, f); }
  f.count++;
}

// Retorna 'admin' | 'caixa' | null conforme o código enviado no header.
async function checkStaff(req) {
  // 1) Token de sessão assinado (caminho normal após o login).
  const h = req.headers['authorization'] || '';
  const raw = h.startsWith('Bearer ') ? h.slice(7).trim() : (req.headers['x-auth-token'] ? String(req.headers['x-auth-token']) : null);
  if (raw) {
    const tk = verificarToken(raw);
    if (tk && tk.t === 'staff' && (tk.role === 'admin' || tk.role === 'caixa')) return tk.role;
  }
  // 2) Código cru no header (compatibilidade durante a transição p/ tokens).
  const codigo = String(req.headers['x-staff-codigo'] || (req.body && req.body.staffCodigo) || '').trim();
  if (!codigo) return null;
  if (codigo === await getSenha('admin')) return 'admin';
  if (codigo === await getSenha('caixa')) return 'caixa';
  return null;
}
async function requireStaff(req, res, next) {
  if (staffBloqueado(req)) return res.status(429).json({ error: 'Bloqueado temporariamente por excesso de tentativas.' });
  const perfil = await checkStaff(req);
  if (!perfil) { registrarFalhaStaff(req); return res.status(401).json({ error: 'Não autorizado' }); }
  req.staffPerfil = perfil;
  next();
}
async function requireAdmin(req, res, next) {
  if (staffBloqueado(req)) return res.status(429).json({ error: 'Bloqueado temporariamente por excesso de tentativas.' });
  const perfil = await checkStaff(req);
  if (perfil !== 'admin') { if (!perfil) registrarFalhaStaff(req); return res.status(perfil ? 403 : 401).json({ error: perfil ? 'Requer perfil admin' : 'Não autorizado' }); }
  req.staffPerfil = perfil;
  next();
}

// ════════════════════════════════════════════════════════════════════════════
//  SESSÃO ASSINADA (token HMAC, sem dependências e sem estado no servidor)
//  Em vez de repetir a senha crua em todo request, o login devolve um token
//  assinado com validade. O cliente envia no header Authorization: Bearer <tok>.
//  Defina SESSION_SECRET no ambiente (Render) — senão um segredo aleatório é
//  gerado a cada boot e todos precisam relogar quando o servidor reinicia.
// ════════════════════════════════════════════════════════════════════════════
// Resolve o segredo de assinatura. Prioridade:
//  1) SESSION_SECRET explícito (ideal — defina no Render se quiser).
//  2) Segredo ESTÁVEL derivado da credencial do Supabase (que já existe e é
//     secreta no ambiente). Isso garante o MESMO segredo após restart/spin-down e
//     entre instâncias — sem precisar configurar nada novo — e sem expor o segredo
//     no código-fonte. Corrige o "logout instantâneo" causado por segredo efêmero.
//  3) Último recurso: aleatório por boot (só se faltar tudo) — todos relogam ao reiniciar.
function resolverSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_URL;
  if (base) return crypto.createHash('sha256').update('alegrias-sessao|' + base).digest('hex');
  console.warn('⚠️  SESSION_SECRET e credenciais Supabase ausentes — segredo efêmero (todos relogam a cada restart).');
  return crypto.randomBytes(32).toString('hex');
}
const SESSION_SECRET = resolverSessionSecret();

// Token de sessão SEM expiração. A segurança do cadastro é garantida pelo gate de
// QR Code (presença física), então a sessão pode durar indefinidamente — uma vez
// logado, a pessoa fica logada. O token continua assinado (HMAC) para não poder
// ser forjado; apenas não tem mais prazo de validade.
function assinarToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verificarToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const esperado = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  return p; // sem checagem de validade: a sessão não expira
}
function tokenDe(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return verificarToken(h.slice(7).trim());
  if (req.headers['x-auth-token']) return verificarToken(String(req.headers['x-auth-token']));
  return null;
}

// Exige que o request seja do PRÓPRIO cliente cujo id está na rota/no corpo.
// Aceita o token de cliente OU um token/código de staff (admin/caixa atuando em
// nome do cliente, ex.: caixa recarregando). Bloqueia "agir como outro cliente".
async function requireDono(req, res, next) {
  const alvo = String(req.params.id || req.body.cliente_id || '');
  const tk = tokenDe(req);
  if (tk && tk.t === 'cliente' && String(tk.cid) === alvo) { req.clienteId = tk.cid; return next(); }
  if (await checkStaff(req)) { req.staffAgindo = true; return next(); }
  if (tk && tk.t === 'gerente') { req.gerenteBarraca = tk.barraca_id; return next(); }
  return res.status(401).json({ error: 'Não autorizado' });
}

// Exige token de gerente (barraca) OU staff. Usado nas ações de balcão/barraca.
async function requireGerente(req, res, next) {
  const tk = tokenDe(req);
  if (tk && (tk.t === 'gerente' || tk.t === 'staff')) { req.authTok = tk; return next(); }
  if (await checkStaff(req)) { req.staffAgindo = true; return next(); }
  if (await codigoGerenteValido(req)) return next();
  return res.status(401).json({ error: 'Não autorizado' });
}

// ── Anti-robô: Cloudflare Turnstile ("não sou um robô") ─────────────────────
//  O spam de cadastro vem do autocadastro público (perfil 'cliente'). Aqui o
//  cliente precisa passar no Turnstile. Staff (caixa/admin) e gerente autenticado
//  passam direto. Se a chave secreta não estiver configurada (TURNSTILE_SECRET_KEY),
//  entramos em "modo de transição": não bloqueia — assim o app nunca trava à toa.
async function verificarTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;            // sem chave → modo de transição (não bloqueia)
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: String(token), remoteip: ip || '' }),
    });
    const j = await r.json();
    return !!j.success;
  } catch (e) {
    console.error('[turnstile] falha ao verificar:', e.message);
    return false;                      // com chave configurada, em dúvida bloqueia
  }
}

// Código de gerente = código de uma barraca ativa. Serve como bypass do Turnstile
// nas telas internas (gerente cadastra cliente na venda em espécie).
async function codigoGerenteValido(req) {
  const codigo = String(req.headers['x-staff-codigo'] || (req.body && req.body.staffCodigo) || '').trim();
  if (!codigo) return false;
  const { data } = await supabase.from('barracas').select('id').eq('codigo', codigo).eq('ativa', true).maybeSingle();
  return !!data;
}

// Limpeza periódica dos mapas em memória.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _hits) if (now - v.start > 900000) _hits.delete(k);
  for (const [k, v] of _staffFails) if (now - v.start > 900000) _staffFails.delete(k);
  for (const [k, v] of _loginFails) if (now - v.start > 900000) _loginFails.delete(k);
}, 300000).unref();

// Busca TODOS os registros, contornando o teto de 1000 linhas por requisição do
// Supabase/PostgREST. makeQuery(ini, fim) deve retornar uma query com .range().
// Usado nas listas do admin que precisam exibir tudo (com paginação no front).
async function fetchAllRows(makeQuery, hardCap = 50000) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await makeQuery(from, from + 999);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < 1000 || all.length >= hardCap) break;
    from += 1000;
  }
  return all;
}

// ── Helper: decrementa estoque de uma lista de itens ─────────────────────────
async function decrementarEstoque(itens, barracaId) {
  if (!Array.isArray(itens)) return;
  for (const item of itens) {
    const qty = parseInt(item.qty) || 1;
    let prod = null;
    // Tenta pelo id primeiro
    if (item.id && !String(item.id).startsWith('mem_')) {
      const { data } = await supabase.from('produtos').select('id,estoque').eq('id', item.id).single();
      prod = data;
    }
    // Fallback: busca pelo nome + barraca
    if (!prod && item.nome && barracaId) {
      const { data } = await supabase.from('produtos').select('id,estoque')
        .eq('barraca_id', barracaId).eq('nome', item.nome).maybeSingle();
      prod = data;
    }
    if (prod && prod.estoque >= 0) {
      await supabase.from('produtos')
        .update({ estoque: Math.max(0, prod.estoque - qty) })
        .eq('id', prod.id);
    }
  }
}

// Calcula o valor de um pedido usando o preço OFICIAL do banco — nunca o preço
// que o navegador enviou. Sem isto, o cliente podia mandar preco:0 e comer de
// graça. Para cada item resolve o produto por id (ou nome+barraca) e usa o preço
// do DB; só cai no preço enviado quando o produto não existe no banco (modo
// fallback com cardápio em memória), cenário em que não há preço oficial.
async function valorOficial(itens, barracaId) {
  if (!Array.isArray(itens)) return { valor: 0, suspeito: true };
  let total = 0, suspeito = false;
  for (const item of itens) {
    const qty = Math.max(1, parseInt(item.qty) || 1);
    let prod = null;
    if (item.id && !String(item.id).startsWith('mem_')) {
      const { data } = await supabase.from('produtos').select('id,preco').eq('id', item.id).maybeSingle();
      prod = data;
    }
    if (!prod && item.nome && barracaId) {
      const { data } = await supabase.from('produtos').select('id,preco')
        .eq('barraca_id', barracaId).eq('nome', item.nome).maybeSingle();
      prod = data;
    }
    if (prod) {
      total += parseFloat(prod.preco) * qty;
    } else {
      // Sem produto no banco (cardápio em memória): usa o preço enviado, mas
      // nunca negativo. Marca como suspeito para auditoria.
      total += Math.max(0, parseFloat(item.preco) || 0) * qty;
      suspeito = true;
    }
  }
  return { valor: Math.round(total * 100) / 100, suspeito };
}

// ── CARDÁPIO OFICIAL DO EVENTO ────────────────────────────────────────────────
const CARDAPIO_PRODUTOS = {
  'Pamonha Assada':         [{ nome:'Pamonha simples', preco:5 }, { nome:'Pamonha com queijo', preco:6 }, { nome:'Pamonha doce', preco:5 }, { nome:'Pamonha Assada', preco:6 }, { nome:'Combo (pamonha + caldo)', preco:10 }],
  'Bolo com Café':           [{ nome:'Bolo de milho', preco:5 }, { nome:'Bolo de fubá', preco:5 }, { nome:'Bolo caseiro', preco:6 }, { nome:'Café', preco:3 }, { nome:'Kit bolo + café', preco:7 }],
  'Lanche no Pote':          [{ nome:'Lanche no pote P', preco:10 }, { nome:'Lanche no pote G', preco:14 }, { nome:'Lanche especial', preco:16 }, { nome:'Mini pizza', preco:8 }],
  'Cachorro-quente':         [{ nome:'Cachorro simples', preco:8 }, { nome:'Cachorro completo', preco:12 }, { nome:'Mini cachorro', preco:5 }, { nome:'Hot dog especial', preco:14 }],
  'Milho, Cuscuz e Caldo':   [{ nome:'Milho na espiga', preco:5 }, { nome:'Cuscuz', preco:5 }, { nome:'Caldo de cana', preco:6 }, { nome:'Pipoca doce', preco:5 }, { nome:'Combo caldo + pamonha', preco:10 }],
  'Açaí':                    [{ nome:'Açaí P (300ml)', preco:12 }, { nome:'Açaí M (500ml)', preco:16 }, { nome:'Açaí G (700ml)', preco:20 }, { nome:'Açaí c/ granola', preco:18 }],
  'Bebidas':                 [{ nome:'Água', preco:3 }, { nome:'Refrigerante lata', preco:6 }, { nome:'Suco natural', preco:7 }, { nome:'Limonada', preco:8 }, { nome:'H2O', preco:5 }],
  'Salgados':                [{ nome:'Salgado (un.)', preco:4 }, { nome:'Coxinha', preco:5 }, { nome:'Enroladão', preco:6 }, { nome:'Bolinho de bacalhau', preco:9 }],
  'Pipoca e Docinhos':       [{ nome:'Pipoca', preco:5 }, { nome:'Brigadeiro', preco:3 }, { nome:'Beijinho', preco:3 }, { nome:'Quindim', preco:4 }, { nome:'Brigadeiro + Pipoca', preco:7 }],
  'Churrasco':               [{ nome:'Espetinho (un.)', preco:8 }, { nome:'Combo 2 espetos', preco:14 }, { nome:'Prato churrasquinho', preco:20 }, { nome:'Mini churrasquinho', preco:12 }],
  'Cordelsinho (Pescaria/Camarim/Pula-pula)': [{ nome:'Pescaria (1x)', preco:5 }, { nome:'Camarim (1x)', preco:5 }, { nome:'Pula-pula (1x)', preco:5 }, { nome:'Combo 3 atividades', preco:12 }, { nome:'Pula-pula livre', preco:15 }],
};

async function seedProdutosSeVazio() {
  const { data: existentes } = await supabase.from('produtos').select('id').limit(1);
  if (existentes && existentes.length > 0) return;
  const { data: barracas } = await supabase.from('barracas').select('id,nome').eq('ativa', true);
  if (!barracas || !barracas.length) return;
  const inserts = [];
  for (const b of barracas.data || barracas) {
    const prods = CARDAPIO_PRODUTOS[b.nome];
    if (prods) {
      for (const p of prods) {
        inserts.push({ barraca_id: b.id, nome: p.nome, preco: p.preco, ativo: true });
      }
    }
  }
  if (inserts.length) await supabase.from('produtos').insert(inserts);
  console.log(`🌽 Cardápio seedado: ${inserts.length} produtos`);
}

// ── CLIENTES ────────────────────────────────────────────────────────────────

function normalizar(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim();
}

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr0 = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0);
      const curr = Math.min(tmp, prev[j] + 1, (j > 1 ? curr0 : i) + 1);
      if (j === 1) curr0 = curr; else prev[j - 1] = curr0, curr0 = curr;
    }
    prev[b.length] = curr0;
  }
  return prev[b.length];
}

function scoreFuzzy(nome, query) {
  const n = normalizar(nome);
  const q = normalizar(query);
  if (n === q) return 100;
  if (n.includes(q) || q.includes(n)) return 90;
  const pn = n.split(/\s+/);
  const pq = q.split(/\s+/).filter(p => p.length >= 2);
  if (!pq.length) return 0;
  let total = 0;
  for (const pw of pq) {
    let best = 0;
    for (const pnw of pn) {
      if (pnw.includes(pw) || pw.includes(pnw)) { best = 80; break; }
      const maxLen = Math.max(pw.length, pnw.length);
      const sim = Math.round((maxLen - levenshtein(pw, pnw)) / maxLen * 100);
      if (sim >= 60) best = Math.max(best, sim);
    }
    total += best;
  }
  return Math.round(total / pq.length);
}

// Avatares para a "garrafa de tampinhas" da tela de login (público, sem PII:
// só o avatar, sem nome/saldo/senha). Mais recentes primeiro.
app.get('/api/avatares', async (req, res) => {
  if (!(await avatarColunaExiste())) return res.json([]);
  const lim = Math.min(parseInt(req.query.limit) || 200, 400);
  const { data, error } = await supabase
    .from('clientes').select('avatar, criado_em')
    .not('avatar', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(lim);
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(c => c.avatar));
});

app.get('/api/clientes', async (req, res) => {
  const { nome, codigo } = req.query;
  // Só staff/gerente vê a lista completa, dados completos ou busca por código.
  // A tela de login do cliente precisa buscar por NOME antes de ter token — essa
  // busca é pública, MAS devolve só campos mínimos (id, nome, avatar), nunca
  // saldo/código/senha. Antes, qualquer um listava todo mundo com saldo.
  const ehStaff = !!(await checkStaff(req)) || (await codigoGerenteValido(req));

  if (codigo) {
    if (!ehStaff) return res.status(401).json({ error: 'Não autorizado' });
    const { data, error } = await supabase.from('clientes').select('*').eq('codigo', codigo);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (!nome) {
    if (!ehStaff) return res.status(401).json({ error: 'Não autorizado' });
    const lim = parseInt(req.query.limit) || 500;
    const { data, error } = await supabase.from('clientes').select('*').order('nome').limit(lim);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // Busca por nome. Não-staff (tela de login do cliente) recebe só campos
  // mínimos — NUNCA o pin_hash. Devolvemos 'tem_pin' (booleano) e 'criado_em'
  // porque o fluxo de login precisa saber se a conta já tem senha e mostrar a
  // data na confirmação de identidade.
  const colunas = ehStaff ? '*' : 'id,nome,avatar,criado_em,pin_hash';
  const lim = parseInt(req.query.limit) || 500;
  const { data, error } = await supabase.from('clientes').select(colunas).order('nome').limit(lim);
  if (error) return res.status(500).json({ error: error.message });
  let scored = data
    .map(c => ({ ...c, _score: scoreFuzzy(c.nome, nome) }))
    .filter(c => c._score >= 50)
    .sort((a, b) => b._score - a._score);
  if (!ehStaff) {
    scored = scored.map(c => ({ id: c.id, nome: c.nome, avatar: c.avatar, criado_em: c.criado_em, tem_pin: !!c.pin_hash, _score: c._score }));
  }
  res.json(scored);
});

// requireDono: só o PRÓPRIO cliente (token) ou staff edita este cadastro.
// Antes, QUALQUER UM trocava o nome/PIN de QUALQUER pessoa — era o vetor de
// "brincar com a cara" (renomear contas alheias) e de sequestro de conta (trocar PIN).
app.put('/api/clientes/:id', requireDono, async (req, res) => {
  const { nome, saldo, pin, avatar } = req.body;
  const updates = {};
  if (nome !== undefined) updates.nome = nome.trim();
  // Alterar SALDO é exclusivo de staff (admin/caixa) — este foi o vetor da fraude.
  // O cliente continua podendo atualizar o próprio nome/PIN/avatar.
  if (saldo !== undefined && !isNaN(saldo)) {
    if (!req.staffAgindo && !(await checkStaff(req))) {
      registrarFalhaStaff(req); return res.status(401).json({ error: 'Não autorizado a alterar saldo' });
    }
    updates.saldo = parseFloat(saldo);
  }
  if (pin !== undefined && pin !== '' && /^\d{4}$/.test(String(pin))) {
    updates.pin_hash = hashPin(String(pin));
  }
  if (avatar !== undefined && await avatarColunaExiste()) updates.avatar = avatar;
  const { data, error } = await supabase
    .from('clientes').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/clientes/:id', requireAdmin, async (req, res) => {
  const { data: cliente } = await supabase.from('clientes').select('id,nome,saldo').eq('id', req.params.id).single();
  await supabase.from('transacoes').delete().eq('cliente_id', req.params.id);
  await supabase.from('pedidos').delete().eq('cliente_id', req.params.id);
  const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await logAtividade('excluir', 'cliente', req.params.id, { nome: cliente?.nome, saldo: cliente?.saldo }, 'admin', 'Admin');
  res.json({ ok: true });
});

app.delete('/api/clientes', requireAdmin, async (req, res) => {
  const { data: clientes } = await supabase.from('clientes').select('id,nome,saldo');
  await supabase.from('transacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('pedidos').delete().neq('id', 0);
  const { error } = await supabase.from('clientes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) return res.status(500).json({ error: error.message });
  for (const c of (clientes || [])) {
    await logAtividade('excluir', 'cliente', c.id, { nome: c.nome, saldo: c.saldo }, 'admin', 'Admin');
  }
  res.json({ ok: true, total: clientes?.length || 0 });
});

// Limpa contas criadas por bots. Heurística (somente saldo 0):
//  • sufixo aleatório no nome (ex: "Ana Silva ip", "Tiago Souza OMcQir"), OU
//  • cadastro na enxurrada noturna em rajada (vários por minuto de madrugada).
// NUNCA apaga conta com saldo > 0. Aborta se for sobrar gente de menos (sanidade).
app.post('/api/admin/limpar-bots', requireAdmin, async (req, res) => {
  function sufRandomAlfa(nome) {
    const t = String(nome || '').trim().split(/\s+/); if (t.length < 2) return false;
    const l = t[t.length - 1]; if (!/^[A-Za-z]{2,8}$/.test(l)) return false;
    const mn = /[a-z]/.test(l), mx = /[A-Z]/.test(l);
    if (mn && mx && !/^[A-Z][a-z]+$/.test(l)) return true;  // mistura de caixa (ex: "oV","OMcQir")
    if (l.length === 2) return true;                         // 2 letras soltas (ex: "OM","ip")
    return false;
  }
  function sufDigito(nome) { const t = String(nome || '').trim().split(/\s+/); return t.length >= 2 && /^\d{1,2}$/.test(t[t.length - 1]); }

  const { data: todos, error: e0 } = await supabase
    .from('clientes').select('id,nome,saldo,criado_em').order('criado_em', { ascending: true });
  if (e0) return res.status(500).json({ error: e0.message });

  const ts = todos.map(c => new Date(c.criado_em).getTime());
  const gap = i => { let g = Infinity; if (i > 0) g = Math.min(g, (ts[i] - ts[i - 1]) / 1000); if (i < ts.length - 1) g = Math.min(g, (ts[i + 1] - ts[i]) / 1000); return g; };
  const noite = d => { const t = new Date(d).getTime(); return t >= Date.parse('2026-06-22T01:00:00Z') && t <= Date.parse('2026-06-22T03:00:00Z'); };

  const bots = [];
  todos.forEach((c, i) => {
    if ((c.saldo || 0) > 0) return;                                              // saldo: nunca apaga
    if (sufRandomAlfa(c.nome)) { bots.push(c); return; }
    if (sufDigito(c.nome) && gap(i) <= 20 && noite(c.criado_em)) { bots.push(c); return; }
    if (noite(c.criado_em) && gap(i) <= 20) { bots.push(c); return; }
  });

  const mantidos = todos.length - bots.length;
  if (mantidos < 10) return res.status(409).json({ error: `Abortado por segurança: sobraria só ${mantidos} conta(s). Nada foi apagado.` });
  if (bots.length === 0) return res.json({ ok: true, apagados: 0, mantidos, mensagem: 'Nenhum bot encontrado.' });

  const ids = bots.map(b => b.id);
  const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
  for (const c of chunk(ids, 80)) {
    await supabase.from('transacoes').delete().in('cliente_id', c);
    await supabase.from('pedidos').delete().in('cliente_id', c);
  }
  let apagados = 0;
  for (const c of chunk(ids, 80)) {
    const { data, error } = await supabase.from('clientes').delete().in('id', c).select('id');
    if (error) return res.status(500).json({ error: error.message, apagadosParcial: apagados });
    apagados += (data || []).length;
  }
  await logAtividade('excluir', 'cliente', 'lote-bots', { quantidade: apagados, motivo: 'limpeza anti-bot' }, 'admin', req.staffPerfil || 'Admin');
  res.json({ ok: true, apagados, mantidos });
});

app.delete('/api/transacoes', requireAdmin, async (req, res) => {
  // A view unificada exibe transacoes + pedidos confirmados; apaga ambos
  const { data: tx, error: selErr } = await supabase.from('transacoes').select('id,tipo,valor');
  if (selErr) console.error('[DELETE transacoes] select error:', selErr.message);
  const { data: peds, error: selPedErr } = await supabase.from('pedidos').select('id,valor_total');
  if (selPedErr) console.error('[DELETE pedidos] select error:', selPedErr.message);

  const { error: errTx }  = await supabase.from('transacoes').delete().not('id', 'is', null);
  const { error: errPed } = await supabase.from('pedidos').delete().not('id', 'is', null);
  if (errTx)  { console.error('[DELETE transacoes]', errTx.message);  return res.status(500).json({ error: errTx.message }); }
  if (errPed) { console.error('[DELETE pedidos]',    errPed.message); return res.status(500).json({ error: errPed.message }); }

  for (const t of (tx || [])) {
    await logAtividade('excluir', 'transacao', t.id, { tipo: t.tipo, valor: t.valor }, 'admin', 'Admin');
  }
  const total = (tx?.length || 0) + (peds?.length || 0);
  res.json({ ok: true, total });
});

// ── RESET GERAL (apaga dados de teste, mantém barracas e produtos) ────────────
app.post('/api/admin/reset-evento', requireAdmin, async (req, res) => {
  const { confirmacao } = req.body;
  if (confirmacao !== 'RESETAR') return res.status(400).json({ error: 'Envie { confirmacao: "RESETAR" } para confirmar' });

  try {
    // Sequencial: transacoes e pedidos antes de clientes (FK), pedidos.id é inteiro
    const rTx  = await supabase.from('transacoes').delete().not('id', 'is', null);
    const rPed = await supabase.from('pedidos').delete().not('id', 'is', null);
    const rC   = await supabase.from('clientes').delete().not('id', 'is', null);
    await supabase.from('activity_log').delete().not('id', 'is', null);

    if (rTx.error)  throw new Error('transacoes: ' + rTx.error.message);
    if (rPed.error) throw new Error('pedidos: ' + rPed.error.message);
    if (rC.error)   throw new Error('clientes: ' + rC.error.message);

    await logAtividade('resetar', 'sistema', null, { descricao: 'Reset geral do evento — dados de teste apagados' }, 'admin', 'Admin');
    console.log('🔴 RESET DO EVENTO executado');
    res.json({ ok: true, mensagem: 'Aplicação resetada. Barracas e produtos mantidos.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// simple hash for PIN (not for high security — event context)
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// Recupera o PIN de 4 dígitos a partir do hash (apenas 10 mil combinações).
// Usado pelo admin para exibir/repassar a senha do cliente. Só é viável porque
// o PIN é curto (contexto de evento, sem segurança crítica).
function recuperarPin(pinHash) {
  if (!pinHash) return null;
  for (let i = 0; i < 10000; i++) {
    const pin = String(i).padStart(4, '0');
    if (hashPin(pin) === pinHash) return pin;
  }
  return null;
}

// Flag: detecta se a coluna 'operador' já foi criada em transacoes (migração v5)
let _operadorColunaExiste = null;
async function operadorColunaExiste() {
  if (_operadorColunaExiste !== null) return _operadorColunaExiste;
  const { error } = await supabase.from('transacoes').select('operador').limit(1);
  _operadorColunaExiste = !error || !error.message.includes('operador');
  if (!_operadorColunaExiste) {
    console.warn('⚠️  Coluna "operador" não existe em transacoes. Rode supabase_migration_v5.sql.');
  }
  return _operadorColunaExiste;
}

let _avatarColunaExiste = null;
async function avatarColunaExiste() {
  if (_avatarColunaExiste !== null) return _avatarColunaExiste;
  const { error } = await supabase.from('clientes').select('avatar').limit(1);
  _avatarColunaExiste = !error || !error.message.includes('avatar');
  if (!_avatarColunaExiste) {
    console.warn('⚠️  Coluna "avatar" não existe em clientes. Rode supabase_migration_v6.sql.');
  }
  return _avatarColunaExiste;
}

// ── CONFIG / SENHAS (admin e caixa) ──────────────────────────────────────────
// Senhas ficam na tabela "config" do Supabase. Se a tabela ainda não existir
// (migração não rodada), cai no padrão hardcoded — o app continua funcionando.
const SENHAS_PADRAO = { admin: '9999', caixa: '5678' };

let _configTabelaExiste = null;
async function configTabelaExiste() {
  if (_configTabelaExiste !== null) return _configTabelaExiste;
  const { error } = await supabase.from('config').select('chave').limit(1);
  _configTabelaExiste = !error;
  if (!_configTabelaExiste) {
    console.warn('⚠️  Tabela "config" não existe. Rode supabase_migration_v2.sql para gerenciar senhas.');
  } else {
    console.log('✅ Tabela "config" detectada — senhas gerenciáveis pelo admin.');
  }
  return _configTabelaExiste;
}

async function getSenha(perfil) {
  if (!SENHAS_PADRAO[perfil]) return null;
  if (await configTabelaExiste()) {
    const { data } = await supabase.from('config').select('valor').eq('chave', 'senha_' + perfil).maybeSingle();
    if (data && data.valor) return data.valor;
  }
  return SENHAS_PADRAO[perfil];
}

async function seedConfigSenhas() {
  if (!await configTabelaExiste()) return;
  for (const perfil of ['admin', 'caixa']) {
    const { data } = await supabase.from('config').select('chave').eq('chave', 'senha_' + perfil).maybeSingle();
    if (!data) await supabase.from('config').insert({ chave: 'senha_' + perfil, valor: SENHAS_PADRAO[perfil] });
  }
  // Código de cadastro: semeia um valor ALEATÓRIO na 1ª vez (nunca o padrão
  // previsível em produção). O admin vê/imprime o QR e pode trocar quando quiser.
  const { data: cc } = await supabase.from('config').select('chave').eq('chave', 'codigo_cadastro').maybeSingle();
  if (!cc) await supabase.from('config').insert({ chave: 'codigo_cadastro', valor: 'C' + Math.random().toString(36).substring(2, 7).toUpperCase() });
}

// ── CÓDIGO DE CADASTRO (gate de presença física) ─────────────────────────────
// Para criar conta de cliente é preciso este código, que só circula no QR Code
// exibido NA FESTA. Bot remoto não tem como obtê-lo. Fica na tabela config e o
// admin pode trocá-lo (gerar novo QR) a qualquer momento, ex.: se vazar.
const CODIGO_CADASTRO_PADRAO = 'CORDEL2026';
async function getCodigoCadastro() {
  if (await configTabelaExiste()) {
    const { data } = await supabase.from('config').select('valor').eq('chave', 'codigo_cadastro').maybeSingle();
    if (data && data.valor) return data.valor;
  }
  return CODIGO_CADASTRO_PADRAO;
}
async function setCodigoCadastro(valor) {
  if (!await configTabelaExiste()) return false;
  const { error } = await supabase.from('config').upsert({ chave: 'codigo_cadastro', valor: String(valor), atualizado_em: new Date().toISOString() });
  return !error;
}
// Monta a URL e o QR que levam ao app já habilitado a cadastrar (?cad=CODIGO).
async function montarCadastroQR(req) {
  const codigo = await getCodigoCadastro();
  const base = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
  const url = `${base}/?cad=${encodeURIComponent(codigo)}`;
  const qr = await QRCode.toDataURL(url, { width: 600, margin: 2, color: { dark: '#1E3A6E', light: '#FFFFFF' } });
  return { codigo, url, qr };
}

// Login de caixa/admin validado no servidor (antes era hardcoded no frontend)
// Config pública pro frontend (a Site Key do Turnstile é pública por design).
app.get('/api/config', (req, res) => {
  res.json({ turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '' });
});

app.post('/api/auth/perfil', rateLimit('auth', 60000, 20), async (req, res) => {
  const { perfil, codigo } = req.body;
  if (!['admin', 'caixa'].includes(perfil)) return res.status(400).json({ error: 'Perfil inválido' });
  if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });
  const senha = await getSenha(perfil);
  if (String(codigo).trim() !== senha) return res.status(401).json({ error: 'Código incorreto!' });
  res.json({ ok: true, perfil, token: assinarToken({ t: 'staff', role: perfil }) });
});

app.get('/api/admin/senhas', requireAdmin, async (req, res) => {
  res.json({
    admin: await getSenha('admin'),
    caixa: await getSenha('caixa'),
    persistido: await configTabelaExiste(),
  });
});

// QR de cadastro (gate de presença): admin exibe/imprime para colar na festa.
app.get('/api/admin/cadastro', requireAdmin, async (req, res) => {
  const info = await montarCadastroQR(req);
  res.json({ ...info, persistido: await configTabelaExiste() });
});

// Gera um novo código (e novo QR) — invalida o anterior. Use se o código vazar.
app.post('/api/admin/cadastro/regenerar', requireAdmin, async (req, res) => {
  const novo = 'C' + Math.random().toString(36).substring(2, 7).toUpperCase();
  if (!await setCodigoCadastro(novo)) {
    return res.status(503).json({ error: 'Tabela "config" não existe. Rode supabase_migration_v2.sql.' });
  }
  await logAtividade('editar', 'config', null, { item: 'codigo_cadastro' }, 'admin', 'Admin', false);
  const info = await montarCadastroQR(req);
  res.json({ ok: true, ...info });
});

app.put('/api/admin/senhas', requireAdmin, async (req, res) => {
  const { perfil, senha } = req.body;
  if (!['admin', 'caixa'].includes(perfil)) return res.status(400).json({ error: 'Perfil inválido' });
  if (!/^\d{4,8}$/.test(String(senha || ''))) return res.status(400).json({ error: 'Senha deve ter de 4 a 8 dígitos numéricos' });
  if (!await configTabelaExiste()) {
    return res.status(503).json({ error: 'Tabela "config" não existe. Rode o SQL de migração (supabase_migration_v2.sql) no Supabase.' });
  }
  const outroPerfil = perfil === 'admin' ? 'caixa' : 'admin';
  if (String(senha) === await getSenha(outroPerfil)) {
    return res.status(409).json({ error: `Senha já usada pelo perfil ${outroPerfil}` });
  }
  // não pode colidir com código de gerente de barraca
  if (await codigoColunaExiste()) {
    const { data: barracaComCodigo } = await supabase.from('barracas').select('id,nome').eq('codigo', String(senha)).maybeSingle();
    if (barracaComCodigo) return res.status(409).json({ error: `Código já usado pela barraca "${barracaComCodigo.nome}"` });
  }
  const { error } = await supabase.from('config').upsert({ chave: 'senha_' + perfil, valor: String(senha), atualizado_em: new Date().toISOString() });
  if (error) return res.status(500).json({ error: error.message });
  await logAtividade('editar', 'senha', null, { perfil }, 'admin', 'Admin', false);
  res.json({ ok: true });
});

app.get('/api/clientes/:id', requireDono, async (req, res) => {
  const { data, error } = await supabase.from('clientes').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(data);
});

// Senha do cliente em texto (apenas admin, para repassar ao cliente).
app.get('/api/admin/clientes/:id/pin', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('clientes').select('pin_hash').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json({ pin: recuperarPin(data.pin_hash) });
});

// Extrato unificado do cliente: recargas + compras (QR, espécie e cardápio),
// ordenado por data. Evita duplicidade da espécie (transacao + pedido).
app.get('/api/clientes/:id/extrato', requireDono, async (req, res) => {
  const id = req.params.id;
  const [txRes, pedRes] = await Promise.all([
    supabase.from('transacoes').select('*, barracas(nome,emoji)').eq('cliente_id', id).order('timestamp', { ascending: false }).limit(200),
    supabase.from('pedidos').select('*, barracas(nome,emoji)').eq('cliente_id', id).order('criado_em', { ascending: false }).limit(200),
  ]);
  const txItens = (txRes.data || []).map(t => {
    let especie = t.forma === 'especie';
    if (!especie) { try { especie = JSON.parse(t.itens || '[]').some(i => i && i._forma === 'especie'); } catch {} }
    return {
      tipo: t.tipo, // 'venda' | 'recarga'
      origem: t.tipo === 'recarga' ? 'recarga' : (especie ? 'especie' : 'qr'),
      valor: parseFloat(t.valor || 0),
      forma: t.forma || null,
      barraca: t.barracas ? `${t.barracas.emoji} ${t.barracas.nome}` : null,
      operador: t.operador || null,
      timestamp: t.timestamp,
    };
  });
  // Pedidos: só os do cardápio (espécie já vem da transacao acima)
  const pedItens = (pedRes.data || [])
    .filter(p => !pedidoEhEspecie(p))
    .map(p => ({
      tipo: 'venda',
      origem: 'pedido',
      status: p.status,
      valor: parseFloat(p.valor_total || p.valor || 0),
      barraca: p.barracas ? `${p.barracas.emoji} ${p.barracas.nome}` : null,
      operador: null,
      timestamp: p.criado_em,
    }));
  const extrato = [...txItens, ...pedItens].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(extrato);
});

app.get('/api/clientes/:id/qr', requireDono, async (req, res) => {
  const { data: cliente, error } = await supabase.from('clientes').select('id,nome,codigo').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Cliente não encontrado' });
  const payload = JSON.stringify({ tipo: 'cliente', id: cliente.id, nome: cliente.nome, codigo: cliente.codigo });
  const qr = await QRCode.toDataURL(payload, { width: 280, margin: 2, color: { dark: '#1E3A6E', light: '#FFFFFF' } });
  res.json({ qr });
});

app.post('/api/clientes', rateLimit('signup', 60000, 15), async (req, res) => {
  const { nome, pin, avatar } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatório' });

  // GATE DE PRESENÇA: autocadastro público exige o CÓDIGO DE CADASTRO, que só
  // circula no QR Code exibido na festa. Staff (caixa/admin) e gerente autenticado
  // passam direto (cadastram no balcão), identificados pelo código no header.
  // Isto substitui o Turnstile: presença física é um gate mais forte que captcha.
  const ehStaff = (await checkStaff(req)) || (await codigoGerenteValido(req));
  if (!ehStaff) {
    const cod = String(req.body.codigoCadastro || '').trim().toUpperCase();
    const esperado = String(await getCodigoCadastro()).toUpperCase();
    if (!cod || cod !== esperado) {
      return res.status(403).json({ error: 'cadastro_bloqueado', message: 'Para criar conta, escaneie o QR Code de cadastro disponível na festa.' });
    }
  }

  // Anti-bot: o spam de cadastro usa "Nome Sobrenome <número longo>" para
  // furar a checagem de nome duplicado. Nomes humanos não terminam em 3+
  // dígitos (a dica do app sugere no máx. "João Silva 2"). Bloqueia o padrão.
  if (/\d{3,}$/.test(nome.trim())) {
    return res.status(400).json({ error: 'Nome inválido. Evite números longos no final do nome.' });
  }

  const { data: existente } = await supabase
    .from('clientes').select('id').ilike('nome', nome.trim()).limit(1);
  if (existente && existente.length > 0) {
    return res.status(409).json({ error: 'Nome já cadastrado. Use um sobrenome, apelido ou número para diferenciar (ex: João Silva 2).' });
  }

  const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
  const insertData = { nome: nome.trim(), codigo, saldo: 0 };
  if (pin) insertData.pin_hash = hashPin(pin);
  if (avatar && await avatarColunaExiste()) insertData.avatar = avatar;

  const { data, error } = await supabase.from('clientes').insert(insertData).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logAtividade('criar', 'cliente', data.id, { nome: data.nome, saldo: 0 }, req.body.perfil || 'caixa', req.body.perfilNome || '');
  // Token só faz sentido no autocadastro do próprio cliente (perfil 'cliente').
  // Quando staff/gerente cria a conta de outra pessoa, NÃO devolvemos token.
  const ehAutocadastro = req.body.perfil === 'cliente' && data.pin_hash;
  res.status(201).json(ehAutocadastro ? { ...data, token: assinarToken({ t: 'cliente', cid: data.id }) } : data);
});

// admin reseta PIN de cliente
app.post('/api/admin/clientes/:id/reset-pin', requireAdmin, async (req, res) => {
  const novoPin = req.body.pin;
  if (!novoPin || !/^\d{4}$/.test(String(novoPin))) {
    return res.status(400).json({ error: 'PIN deve ter exatamente 4 dígitos numéricos' });
  }
  const { data, error } = await supabase
    .from('clientes').update({ pin_hash: hashPin(String(novoPin)) }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, pin: novoPin, codigo: data.codigo });
});

// ── LOGIN CLIENTE COM PIN ───────────────────────────────────────────────────

// Anti-força-bruta no PIN do cliente (4 dígitos = só 10 mil combinações).
// Bloqueia por IP E por nome de conta, para impedir tanto "varrer PINs de uma
// conta" quanto "tentar um PIN em várias contas". 8 falhas → 10 min de bloqueio.
const _loginFails = new Map();
function loginBloqueado(chave) {
  const f = _loginFails.get(chave);
  return !!(f && Date.now() - f.start < 600000 && f.count >= 8);
}
function registrarFalhaLogin(chave) {
  const now = Date.now();
  let f = _loginFails.get(chave);
  if (!f || now - f.start > 600000) { f = { start: now, count: 0 }; _loginFails.set(chave, f); }
  f.count++;
}

app.post('/api/clientes/login', rateLimit('login', 60000, 30), async (req, res) => {
  const { nome, pin } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  if (!pin) return res.status(400).json({ error: 'Senha obrigatória' });

  const chaveIp = 'ip:' + ipDe(req);
  const chaveNome = 'nome:' + nome.trim().toLowerCase();
  if (loginBloqueado(chaveIp) || loginBloqueado(chaveNome)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
  }

  const { data, error } = await supabase
    .from('clientes').select('*').ilike('nome', nome.trim()).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) {
    registrarFalhaLogin(chaveIp); registrarFalhaLogin(chaveNome);
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  const cliente = data[0];
  if (!cliente.pin_hash) return res.status(401).json({ error: 'sem_pin', message: 'Cliente sem senha cadastrada', codigo: cliente.codigo });

  if (cliente.pin_hash !== hashPin(pin)) {
    registrarFalhaLogin(chaveIp); registrarFalhaLogin(chaveNome);
    return res.status(401).json({ error: 'Pin incorreto' });
  }

  // Login OK → zera o contador de falhas dessa conta/IP.
  _loginFails.delete(chaveIp); _loginFails.delete(chaveNome);

  res.json({ id: cliente.id, nome: cliente.nome, codigo: cliente.codigo, saldo: cliente.saldo, avatar: cliente.avatar || null, token: assinarToken({ t: 'cliente', cid: cliente.id }) });
});

// Primeira definição de senha de uma conta SEM PIN (criada por staff no balcão).
// Público de propósito (a pessoa ainda não tem token), mas só funciona se a conta
// realmente não tiver senha ainda — depois disso só o dono (token) edita. Devolve
// um token para já deixar a pessoa logada.
app.post('/api/clientes/:id/definir-pin', rateLimit('definirpin', 60000, 30), async (req, res) => {
  const { pin, avatar } = req.body;
  if (!/^\d{4}$/.test(String(pin || ''))) return res.status(400).json({ error: 'PIN deve ter 4 dígitos numéricos' });
  const { data: cli } = await supabase.from('clientes').select('id,pin_hash').eq('id', req.params.id).maybeSingle();
  if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });
  if (cli.pin_hash) return res.status(409).json({ error: 'Esta conta já tem senha. Faça login.' });
  const updates = { pin_hash: hashPin(String(pin)) };
  if (avatar !== undefined && await avatarColunaExiste()) updates.avatar = avatar;
  const { data, error } = await supabase.from('clientes').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ id: data.id, nome: data.nome, codigo: data.codigo, saldo: data.saldo, avatar: data.avatar || null, token: assinarToken({ t: 'cliente', cid: data.id }) });
});

// ── RECARGA ──────────────────────────────────────────────────────────────────

app.post('/api/clientes/:id/recarregar', requireStaff, async (req, res) => {
  const { valor, forma, operador } = req.body;
  const v = parseFloat(valor);
  if (!v || v <= 0) return res.status(400).json({ error: 'Valor inválido' });

  const { data: cliente, error: ce } = await supabase
    .from('clientes').select('*').eq('id', req.params.id).single();
  if (ce) return res.status(404).json({ error: 'Cliente não encontrado' });

  const novoSaldo = parseFloat(cliente.saldo) + v;
  const { error: ue } = await supabase
    .from('clientes').update({ saldo: novoSaldo }).eq('id', req.params.id);
  if (ue) return res.status(500).json({ error: ue.message });

  const txRecarga = {
    tipo: 'recarga',
    cliente_id: req.params.id,
    valor: v,
    itens: JSON.stringify({ forma: forma || 'dinheiro' })
  };
  if (await formaColunaExiste()) txRecarga.forma = forma || 'dinheiro';
  if (operador && await operadorColunaExiste()) txRecarga.operador = operador;
  await supabase.from('transacoes').insert(txRecarga);

  res.json({ saldo: novoSaldo });
});

// ── CLIENTES CRUD ─────────────────────────────────────────────────────────────
// (As rotas PUT/DELETE /api/clientes/:id ficam definidas mais acima, já com
//  autorização. As duplicatas SEM auth que existiam aqui foram removidas — eram
//  o vetor de "setar saldo" e "apagar cliente" sem código.)

// ── BARRACAS CRUD ─────────────────────────────────────────────────────────────

// Flag: detecta se a coluna 'codigo' já foi criada no Supabase
// Faz uma query real e interpreta o erro — sem depender de information_schema
let _codigoColunaExiste = null;
async function codigoColunaExiste() {
  if (_codigoColunaExiste !== null) return _codigoColunaExiste;
  const { error } = await supabase
    .from('barracas')
    .select('codigo')
    .limit(1);
  // Se o erro mencionar a coluna, ela não existe. Qualquer outro erro (RLS etc) = existe.
  _codigoColunaExiste = !error || !error.message.includes('codigo');
  if (!_codigoColunaExiste) {
    console.warn('⚠️  Coluna "codigo" não existe. Rode o SQL de migração no Supabase.');
  } else {
    console.log('✅ Coluna "codigo" detectada em barracas.');
  }
  return _codigoColunaExiste;
}

// Gera código único de 4 dígitos para gerente de barraca
async function gerarCodigoUnico() {
  if (!await codigoColunaExiste()) throw new Error('Coluna "codigo" não existe. Rode o SQL de migração no Supabase Dashboard.');
  let tentativas = 0;
  const reservados = [await getSenha('caixa'), await getSenha('admin')];
  while (tentativas < 20) {
    const codigo = String(Math.floor(1000 + Math.random() * 9000));
    if (reservados.includes(codigo)) { tentativas++; continue; }
    const { data } = await supabase.from('barracas').select('id').eq('codigo', codigo).maybeSingle();
    if (!data) return codigo;
    tentativas++;
  }
  throw new Error('Não foi possível gerar código único. Tente novamente.');
}

// Seed de códigos para barracas que ainda não têm
async function seedCodigosBarracas() {
  if (!await codigoColunaExiste()) return; // silencioso — aguardando migração
  const { data: semCodigo } = await supabase.from('barracas').select('id').is('codigo', null);
  if (!semCodigo || semCodigo.length === 0) return;
  for (const b of semCodigo) {
    try {
      const codigo = await gerarCodigoUnico();
      await supabase.from('barracas').update({ codigo }).eq('id', b.id);
    } catch (e) {
      console.error('Erro ao gerar código para barraca', b.id, e.message);
    }
  }
  console.log(`🔑 Códigos gerados para ${semCodigo.length} barraca(s)`);
}

// Autenticação do gerente por código de barraca
app.post('/api/auth/gerente', rateLimit('auth', 60000, 20), async (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });
  if (!await codigoColunaExiste()) {
    return res.status(503).json({ error: 'Sistema de códigos não configurado. Contate o administrador.' });
  }
  const { data: barraca, error } = await supabase
    .from('barracas').select('id,nome,emoji,responsavel,codigo')
    .eq('codigo', codigo.trim()).eq('ativa', true).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!barraca) return res.status(401).json({ error: 'Código inválido ou barraca inativa' });
  res.json({ ok: true, barraca, token: assinarToken({ t: 'gerente', barraca_id: barraca.id }) });
});

// Regenerar código de uma barraca (admin)
app.post('/api/barracas/:id/regenerar-codigo', requireAdmin, async (req, res) => {
  if (!await codigoColunaExiste()) {
    return res.status(503).json({ error: 'Execute o SQL de migração primeiro:\nALTER TABLE barracas ADD COLUMN IF NOT EXISTS codigo TEXT UNIQUE;' });
  }
  try {
    const codigo = await gerarCodigoUnico();
    const { data, error } = await supabase
      .from('barracas').update({ codigo }).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, codigo, barraca: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/barracas/:id', requireStaff, async (req, res) => {
  const { nome, emoji, responsavel, codigo } = req.body;
  const updates = {};
  if (nome !== undefined) updates.nome = nome.trim();
  if (emoji !== undefined) updates.emoji = emoji.trim();
  if (responsavel !== undefined) updates.responsavel = responsavel.trim() || null;
  // Só inclui codigo no update se a coluna existir
  if (codigo !== undefined && await codigoColunaExiste()) {
    const c = codigo.trim();
    if (c) {
      if (!/^\d{4,6}$/.test(c)) return res.status(400).json({ error: 'Código deve ter 4 a 6 dígitos numéricos' });
      const reservados = [await getSenha('caixa'), await getSenha('admin')];
      if (reservados.includes(c)) return res.status(400).json({ error: 'Código reservado pelo sistema' });
      const { data: existente } = await supabase.from('barracas').select('id').eq('codigo', c).maybeSingle();
      if (existente && existente.id !== req.params.id) return res.status(409).json({ error: 'Código já em uso por outra barraca' });
      updates.codigo = c;
    }
  }
  const { data, error } = await supabase
    .from('barracas').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/barracas', requireAdmin, async (req, res) => {
  const { nome, emoji, responsavel } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
  const insert = { nome: nome.trim(), emoji: emoji || '🏪', responsavel: responsavel || null };
  try {
    if (await codigoColunaExiste()) {
      insert.codigo = await gerarCodigoUnico();
    }
  } catch (e) { /* coluna não existe ainda, cria sem código */ }
  const { data, error } = await supabase.from('barracas').insert(insert).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/barracas/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('barracas').update({ ativa: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── TRANSAÇÕES FILTRADAS + EXPORTAÇÃO ─────────────────────────────────────────

// Excluir UMA transação/pedido específico (admin) — útil para apagar testes.
// Estorna o saldo do cliente conforme o tipo, mantendo a integridade do saldo.
app.delete('/api/admin/transacoes/:id', requireAdmin, async (req, res) => {
  const origem = String(req.query.origem || '');
  try {
    if (origem === 'pedido') {
      const { data: ped, error } = await supabase.from('pedidos').select('*').eq('id', req.params.id).single();
      if (error || !ped) return res.status(404).json({ error: 'Pedido não encontrado' });
      // Pedido pago em Alegrias debitou o saldo → estorna. Em espécie (dinheiro) não debitou.
      if (ped.cliente_id && !pedidoEhEspecie(ped)) {
        const { data: c } = await supabase.from('clientes').select('saldo').eq('id', ped.cliente_id).single();
        if (c) await supabase.from('clientes').update({ saldo: parseFloat(c.saldo) + parseFloat(ped.valor_total || ped.valor || 0) }).eq('id', ped.cliente_id);
      }
      await supabase.from('pedidos').delete().eq('id', req.params.id);
      await logAtividade('excluir', 'transacao', String(req.params.id), { tipo: 'pedido', valor: ped.valor_total || ped.valor }, req.staffPerfil, 'Admin', false);
      return res.json({ ok: true });
    }
    const { data: tx, error } = await supabase.from('transacoes').select('*').eq('id', req.params.id).single();
    if (error || !tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.cliente_id) {
      const { data: c } = await supabase.from('clientes').select('saldo').eq('id', tx.cliente_id).single();
      if (c) {
        const v = parseFloat(tx.valor || 0);
        let novo = parseFloat(c.saldo);
        if (tx.tipo === 'recarga') novo -= v;                              // desfaz o crédito da recarga
        else if (tx.tipo === 'venda' && tx.forma !== 'especie') novo += v; // devolve o débito (Alegrias)
        novo = Math.max(0, novo);
        await supabase.from('clientes').update({ saldo: novo }).eq('id', tx.cliente_id);
      }
    }
    await supabase.from('transacoes').delete().eq('id', req.params.id);
    await logAtividade('excluir', 'transacao', req.params.id, { tipo: tx.tipo, valor: tx.valor }, req.staffPerfil, 'Admin', false);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/transacoes', requireStaff, async (req, res) => {
  const { cliente_id, barraca_id, tipo, data, cliente_nome } = req.query;

  const filtroPedido = tipo === 'pedido';
  const filtroRecarga = tipo === 'recarga';
  const filtroQR = tipo === 'qr';
  const filtroEspecie = tipo === 'especie';

  // Construtores de query (recebem faixa para paginar past-1000 e retornar tudo).
  const makeTx = (ini, fim) => {
    let q = supabase
      .from('transacoes')
      .select(`*, clientes(nome,codigo,avatar), barracas(nome,emoji)`)
      .order('timestamp', { ascending: false }).range(ini, fim);
    if (barraca_id) q = q.eq('barraca_id', barraca_id);
    if (data) q = q.gte('timestamp', data + 'T00:00:00').lte('timestamp', data + 'T23:59:59');
    if (filtroRecarga) q = q.eq('tipo', 'recarga');
    else if (filtroQR || filtroEspecie) q = q.eq('tipo', 'venda');
    else if (!filtroPedido && tipo) q = q.eq('tipo', tipo);
    if (cliente_id) q = q.eq('cliente_id', cliente_id);
    return q;
  };
  const makePed = (ini, fim) => {
    let q = supabase
      .from('pedidos')
      .select(`*, clientes(nome,codigo,avatar), barracas(nome,emoji)`)
      .eq('status', 'confirmado')
      .order('criado_em', { ascending: false }).range(ini, fim);
    if (barraca_id) q = q.eq('barraca_id', barraca_id);
    if (data) q = q.gte('criado_em', data + 'T00:00:00').lte('criado_em', data + 'T23:59:59');
    if (cliente_id) q = q.eq('cliente_id', cliente_id);
    return q;
  };

  let txRes, pedRes;
  try {
    [txRes, pedRes] = await Promise.all([
      filtroPedido ? Promise.resolve([]) : fetchAllRows(makeTx),
      (filtroRecarga || filtroQR || filtroEspecie) ? Promise.resolve([]) : fetchAllRows(makePed),
    ]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
  txRes = { data: txRes }; pedRes = { data: pedRes };

  const txData = (txRes.data || []).map(t => {
    let forma = t.forma || null;
    try {
      const parsed = JSON.parse(t.itens || '{}');
      if (!forma) forma = Array.isArray(parsed) ? (parsed[0]?._forma || null) : (parsed.forma || null);
    } catch {}
    const origemVenda = forma === 'especie' ? 'especie' : 'qr';
    return { ...t, _origem: t.tipo === 'recarga' ? 'recarga' : origemVenda, forma, timestamp: t.timestamp };
  });

  // Exclui pedidos em espécie: eles já têm uma transacao (forma=especie) que os
  // representa nesta lista. Contá-los aqui também duplicaria a venda.
  const pedData = (pedRes.data || [])
    .filter(p => !pedidoEhEspecie(p))
    .map(p => ({
      id: p.id, tipo: 'venda', _origem: 'pedido',
      cliente_id: p.cliente_id, barraca_id: p.barraca_id,
      valor: p.valor_total || p.valor || 0,
      itens: p.itens, forma: null,
      clientes: p.clientes, barracas: p.barracas,
      timestamp: p.criado_em,
    }));

  let unified = [...txData, ...pedData]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (filtroQR)      unified = unified.filter(t => t._origem === 'qr');
  if (filtroEspecie) unified = unified.filter(t => t._origem === 'especie');

  if (cliente_nome) {
    const q = cliente_nome.toLowerCase();
    unified = unified.filter(t => t.clientes && t.clientes.nome.toLowerCase().includes(q));
  }

  const vendas   = unified.filter(t => t.tipo === 'venda');
  const recargas = unified.filter(t => t.tipo === 'recarga');
  const resumo = {
    totalVendas:   vendas.reduce((s, t) => s + parseFloat(t.valor), 0),
    totalRecargas: recargas.reduce((s, t) => s + parseFloat(t.valor), 0),
    numVendas: vendas.length, numRecargas: recargas.length,
  };

  res.json({ transacoes: unified, resumo });
});

app.get('/api/admin/export-csv', requireStaff, async (req, res) => {
  const { data: tx } = await supabase
    .from('transacoes')
    .select(`*, clientes(nome,avatar), barracas(nome,emoji)`)
    .order('timestamp', { ascending: false }).limit(2000);
  if (!tx) return res.status(500).json({ error: 'Erro ao buscar dados' });

  const header = 'Data,Hora,Tipo,Cliente,Barraca,Valor\n';
  const rows = tx.map(t => {
    const d = new Date(t.timestamp);
    const dataStr = d.toLocaleDateString('pt-BR');
    const horaStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dataStr},${horaStr},${t.tipo},"${t.clientes ? t.clientes.nome : ''}","${t.barracas ? t.barracas.nome : ''}",${t.valor}`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cordel-2026-transacoes.csv"');
  res.send('﻿' + header + rows);
});

// ── FECHAR CAIXA ─────────────────────────────────────────────────────────────

app.post('/api/admin/fechar-caixa', requireStaff, async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Data obrigatória' });

  // Limites do dia no fuso de Brasília (−03:00). Sem o offset, o Postgres
  // interpretaria em UTC e vendas do fim da noite cairiam no dia seguinte.
  const ini = data + 'T00:00:00-03:00';
  const fim = data + 'T23:59:59-03:00';

  const [tx, peds, clientes, barracas] = await Promise.all([
    supabase.from('transacoes').select(`*, clientes(nome,avatar), barracas(nome,emoji)`)
      .gte('timestamp', ini).lte('timestamp', fim).order('timestamp', { ascending: false }),
    // Vendas do cardápio = pedidos confirmados no dia (exclui espécie: já vem como transacao)
    supabase.from('pedidos').select(`*, clientes(nome,avatar), barracas(nome,emoji)`)
      .eq('status', 'confirmado')
      .gte('criado_em', ini).lte('criado_em', fim).order('criado_em', { ascending: false }),
    supabase.from('clientes').select('*'),
    supabase.from('barracas').select('*').eq('ativa', true)
  ]);

  const txx = tx.data || [];
  const vendasTx = txx.filter(t => t.tipo === 'venda');
  const recargas = txx.filter(t => t.tipo === 'recarga');

  // Pedidos de cardápio (sem espécie) normalizados como vendas
  const pedVendas = (peds.data || [])
    .filter(p => !pedidoEhEspecie(p))
    .map(p => ({
      tipo: 'venda', _origem: 'pedido',
      cliente_id: p.cliente_id, barraca_id: p.barraca_id,
      valor: p.valor_total || p.valor || 0,
      itens: p.itens,
      clientes: p.clientes, barracas: p.barracas,
      timestamp: p.criado_em,
    }));

  const vendas = [...vendasTx, ...pedVendas];

  // Soma a quantidade de produtos vendidos numa venda (a partir dos itens)
  const contarProdutos = (t) => {
    try {
      const itens = JSON.parse(t.itens || '[]');
      if (!Array.isArray(itens)) return 0;
      return itens.reduce((s, i) => s + (parseInt(i.qty || i.quantidade) || 0), 0);
    } catch { return 0; }
  };

  const porBarraca = {};
  (barracas.data || []).forEach(b => { porBarraca[b.id] = { nome: b.nome, emoji: b.emoji, total: 0, vendas: 0, produtos: 0 }; });
  vendas.forEach(t => {
    if (!porBarraca[t.barraca_id] && t.barracas) porBarraca[t.barraca_id] = { nome: t.barracas.nome, emoji: t.barracas.emoji, total: 0, vendas: 0, produtos: 0 };
    if (porBarraca[t.barraca_id]) {
      porBarraca[t.barraca_id].total += parseFloat(t.valor);
      porBarraca[t.barraca_id].vendas += 1;
      porBarraca[t.barraca_id].produtos += contarProdutos(t);
    }
  });

  // Lista de transações para exibição/PDF: tudo junto, ordenado por hora
  const transacoesFeed = [...txx, ...pedVendas]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json({
    data,
    totalVendas: vendas.reduce((s, t) => s + parseFloat(t.valor), 0),
    totalRecargas: recargas.reduce((s, t) => s + parseFloat(t.valor), 0),
    numVendas: vendas.length,
    numRecargas: recargas.length,
    porBarraca: Object.values(porBarraca).sort((a, b) => b.total - a.total),
    totalClientes: (clientes.data || []).length,
    transacoes: transacoesFeed,
    geradoEm: new Date().toISOString()
  });
});

// ── BARRACAS ─────────────────────────────────────────────────────────────────

app.get('/api/barracas', async (req, res) => {
  const { data, error } = await supabase
    .from('barracas').select('*').eq('ativa', true).order('nome');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/barracas/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('barracas').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Barraca não encontrada' });
  res.json(data);
});

// ── QR PENDENTES ──────────────────────────────────────────────────────────────

app.post('/api/qr', requireGerente, async (req, res) => {
  const { barraca_id, valor, itens } = req.body;
  if (!barraca_id || !valor) return res.status(400).json({ error: 'Dados incompletos' });

  const id = uuidv4();
  const { error } = await supabase.from('qr_pendentes').insert({
    id, barraca_id, valor: parseFloat(valor),
    itens: JSON.stringify(itens || []),
    confirmado: false
  });
  if (error) return res.status(500).json({ error: error.message });

  const { data: barraca } = await supabase
    .from('barracas').select('nome,emoji').eq('id', barraca_id).single();

  const payload = {
    id,
    tipo: 'venda',
    barraca_id,
    barraca_nome: barraca ? `${barraca.emoji} ${barraca.nome}` : 'Barraca',
    valor: parseFloat(valor),
    itens: itens || []
  };

  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
    width: 300, margin: 2,
    color: { dark: '#8B0000', light: '#FFF8DC' }
  });

  res.status(201).json({ id, qr: qrDataUrl, payload });
});

app.get('/api/qr/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('qr_pendentes').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'QR não encontrado' });
  res.json(data);
});

// ── CONFIRMAR COMPRA (cliente escaneia QR) ────────────────────────────────────

app.post('/api/comprar', requireDono, async (req, res) => {
  const { qr_id, cliente_id } = req.body;
  if (!qr_id || !cliente_id) return res.status(400).json({ error: 'Dados incompletos' });

  const { data: qr, error: qe } = await supabase
    .from('qr_pendentes').select('*').eq('id', qr_id).single();
  if (qe || !qr) return res.status(404).json({ error: 'QR não encontrado' });
  if (qr.confirmado) return res.status(400).json({ error: 'QR já utilizado' });

  const { data: cliente, error: ce } = await supabase
    .from('clientes').select('*').eq('id', cliente_id).single();
  if (ce || !cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

  const saldoAtual = parseFloat(cliente.saldo);
  const valor = parseFloat(qr.valor);
  if (saldoAtual < valor) {
    return res.status(400).json({ error: 'Saldo insuficiente', saldo: saldoAtual, valor });
  }

  const novoSaldo = saldoAtual - valor;
  const { error: ue } = await supabase
    .from('clientes').update({ saldo: novoSaldo }).eq('id', cliente_id);
  if (ue) return res.status(500).json({ error: ue.message });

  await supabase.from('qr_pendentes').update({ confirmado: true }).eq('id', qr_id);

  const txVenda = {
    tipo: 'venda',
    cliente_id,
    barraca_id: qr.barraca_id,
    valor,
    itens: qr.itens
  };
  if (await formaColunaExiste()) txVenda.forma = 'qr';
  await supabase.from('transacoes').insert(txVenda);

  const { data: pedido } = await supabase
    .from('pedidos')
    .insert({
      cliente_id,
      barraca_id: qr.barraca_id,
      itens: qr.itens,
      valor_total: valor,
      status: 'pendente'
    })
    .select().single();

  // Decrementa estoque dos produtos (QR flow)
  let itensQR = [];
  try { itensQR = JSON.parse(qr.itens || '[]'); } catch {}
  await decrementarEstoque(itensQR, qr.barraca_id);

  res.json({ ok: true, saldo: novoSaldo, valor, pedido_id: pedido?.id });
});

// ── VENDA EM ESPÉCIE (gerente recebe Alegrias físicas na barraca) ─────────────

// Flag: detecta se a coluna 'forma' já foi criada em transacoes
let _formaColunaExiste = null;
async function formaColunaExiste() {
  if (_formaColunaExiste !== null) return _formaColunaExiste;
  const { error } = await supabase.from('transacoes').select('forma').limit(1);
  _formaColunaExiste = !error || !error.message.includes('forma');
  if (!_formaColunaExiste) {
    console.warn('⚠️  Coluna "forma" não existe em transacoes. Rode supabase_migration_v2.sql.');
  } else {
    console.log('✅ Coluna "forma" detectada em transacoes.');
  }
  return _formaColunaExiste;
}

app.post('/api/vendas/especie', requireGerente, async (req, res) => {
  const { barraca_id, itens, pagamento, cliente_id, operador } = req.body;
  if (!barraca_id || !Array.isArray(itens) || !itens.length) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  const valor = itens.reduce((s, i) => s + (parseFloat(i.preco) * (parseInt(i.qty) || 1)), 0);
  if (!valor || valor <= 0) return res.status(400).json({ error: 'Valor inválido' });
  const troco = pagamento ? Math.max(0, parseFloat(pagamento) - valor) : 0;

  // Cliente é opcional. Se enviado, valida que existe (apenas identificação —
  // pagamento é em dinheiro, NÃO debita saldo).
  let clienteIdValido = null;
  if (cliente_id) {
    const { data: cli } = await supabase.from('clientes').select('id').eq('id', cliente_id).maybeSingle();
    if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });
    clienteIdValido = cliente_id;
  }

  const itensComForma = itens.map((i, idx) => idx === 0 ? { ...i, _forma: 'especie' } : i);
  const insert = { tipo: 'venda', barraca_id, valor, itens: JSON.stringify(itensComForma) };
  if (clienteIdValido) insert.cliente_id = clienteIdValido;
  if (await formaColunaExiste()) insert.forma = 'especie';
  if (operador && await operadorColunaExiste()) insert.operador = operador;

  const { data: tx, error } = await supabase.from('transacoes').insert(insert).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Cria pedido pendente para aparecer na aba de Pedidos do gerente (e no app do
  // cliente, quando identificado). O marcador _forma:'especie' garante que este
  // pedido NÃO debite/estorne saldo e NÃO seja contado em dobro nos relatórios.
  await supabase.from('pedidos').insert({
    barraca_id,
    cliente_id: clienteIdValido,
    itens: JSON.stringify(itens.map(i => ({ ...i, _forma: 'especie', _troco: troco }))),
    valor_total: valor,
    status: 'pendente'
  });

  await decrementarEstoque(itens, barraca_id);
  res.status(201).json({ ok: true, valor, troco, transacao_id: tx.id });
});

// ── TRANSAÇÕES ────────────────────────────────────────────────────────────────

app.get('/api/transacoes', requireGerente, async (req, res) => {
  const { cliente_id, barraca_id, tipo, limit } = req.query;
  let query = supabase
    .from('transacoes')
    .select(`*, clientes(nome,codigo,avatar), barracas(nome,emoji)`)
    .order('timestamp', { ascending: false })
    .limit(parseInt(limit) || 100);
  if (cliente_id) query = query.eq('cliente_id', cliente_id);
  if (barraca_id) query = query.eq('barraca_id', barraca_id);
  if (tipo) query = query.eq('tipo', tipo);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── RELATÓRIO ADMIN ───────────────────────────────────────────────────────────

app.get('/api/admin/relatorio', requireStaff, async (req, res) => {
  // Busca tudo em paralelo: clientes, transacoes (QR), pedidos confirmados, barracas
  const [clientesAll, transacoes, pedidos, barracas] = await Promise.all([
    fetchAllRows((ini, fim) => supabase.from('clientes').select('*').order('nome').range(ini, fim)),
    supabase.from('transacoes').select('*, clientes(nome,avatar), barracas(nome,emoji)').order('timestamp', { ascending: false }).limit(500),
    supabase.from('pedidos').select('*, clientes(nome,avatar), barracas(nome,emoji)').eq('status', 'confirmado').order('criado_em', { ascending: false }).limit(500),
    supabase.from('barracas').select('*').eq('ativa', true),
  ]);
  const clientes = { data: clientesAll };

  const tx     = transacoes.data || [];
  // Exclui pedidos em espécie: já contabilizados via transacao (forma=especie)
  const peds   = (pedidos.data || []).filter(p => !pedidoEhEspecie(p));
  const recargas = tx.filter(t => t.tipo === 'recarga');
  // Vendas QR = transacoes tipo venda (inclui as de espécie, que têm forma=especie)
  const vendasQR = tx.filter(t => t.tipo === 'venda');

  // Inicia mapa de barracas
  const porBarraca = {};
  (barracas.data || []).forEach(b => {
    porBarraca[b.id] = { nome: `${b.emoji} ${b.nome}`, total: 0, vendas: 0 };
  });

  // Contabiliza vendas QR (via transacoes)
  vendasQR.forEach(t => {
    if (!porBarraca[t.barraca_id]) porBarraca[t.barraca_id] = { nome: t.barracas ? `${t.barracas.emoji} ${t.barracas.nome}` : 'Desconhecida', total: 0, vendas: 0 };
    porBarraca[t.barraca_id].total  += parseFloat(t.valor || 0);
    porBarraca[t.barraca_id].vendas += 1;
  });

  // Contabiliza pedidos diretos confirmados (via cardápio)
  peds.forEach(p => {
    const v = parseFloat(p.valor_total || p.valor || 0);
    if (!porBarraca[p.barraca_id]) porBarraca[p.barraca_id] = { nome: p.barracas ? `${p.barracas.emoji} ${p.barracas.nome}` : 'Desconhecida', total: 0, vendas: 0 };
    porBarraca[p.barraca_id].total  += v;
    porBarraca[p.barraca_id].vendas += 1;
  });

  const totalMovimentado = vendasQR.reduce((s, t) => s + parseFloat(t.valor || 0), 0)
                         + peds.reduce((s, p) => s + parseFloat(p.valor_total || p.valor || 0), 0);
  const totalRecargas    = recargas.reduce((s, t) => s + parseFloat(t.valor || 0), 0);

  // Feed de transações unificado (QR + pedidos), ordenado por data
  const feedUnificado = [
    ...vendasQR.map(t => ({ ...t, _origem: 'qr',    timestamp: t.timestamp })),
    ...peds.map(p => ({
      id: p.id, tipo: 'venda', cliente_id: p.cliente_id, barraca_id: p.barraca_id,
      valor: p.valor_total || p.valor || 0, itens: p.itens,
      clientes: p.clientes, barracas: p.barracas,
      timestamp: p.criado_em, _origem: 'pedido'
    })),
    ...recargas.map(t => ({ ...t, _origem: 'recarga', timestamp: t.timestamp })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 300);

  res.json({
    totalMovimentado,
    totalRecargas,
    numClientes:  (clientes.data || []).length,
    numVendas:    vendasQR.length + peds.length,
    numVendasQR:  vendasQR.length,
    numPedidos:   peds.length,
    numRecargas:  recargas.length,
    porBarraca:   Object.values(porBarraca).sort((a, b) => b.total - a.total),
    clientes:     clientes.data || [],
    transacoes:   feedUnificado,
  });
});

// ── RELATÓRIO BARRACA ─────────────────────────────────────────────────────────

app.get('/api/barracas/:id/relatorio', async (req, res) => {
  const bid = req.params.id;
  const [txRes, pedRes] = await Promise.all([
    supabase.from('transacoes').select('*, clientes(nome,avatar)')
      .eq('barraca_id', bid).eq('tipo', 'venda').order('timestamp', { ascending: false }),
    supabase.from('pedidos').select('*, clientes(nome,avatar)')
      .eq('barraca_id', bid).eq('status', 'confirmado').order('criado_em', { ascending: false }),
  ]);
  if (txRes.error) return res.status(500).json({ error: txRes.error.message });

  // Normaliza pedidos para o mesmo formato das transacoes.
  // Exclui pedidos em espécie: já contabilizados via transacao (forma=especie).
  const pedNorm = (pedRes.data || [])
    .filter(p => !pedidoEhEspecie(p))
    .map(p => ({
      ...p,
      valor: p.valor_total || p.valor || 0,
      timestamp: p.criado_em,
      _origem: 'pedido',
    }));

  const todasVendas = [
    ...(txRes.data || []).map(t => ({ ...t, _origem: 'qr' })),
    ...pedNorm,
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total  = todasVendas.reduce((s, t) => s + parseFloat(t.valor || 0), 0);
  const ticket = todasVendas.length > 0 ? total / todasVendas.length : 0;

  const produtoCount = {};
  todasVendas.forEach(t => {
    let itens = [];
    try { itens = JSON.parse(t.itens || '[]'); } catch {}
    itens.forEach(item => {
      const k = item.nome || item.name || 'Item';
      produtoCount[k] = (produtoCount[k] || 0) + (item.qty || item.quantidade || 1);
    });
  });
  const topProduto = Object.entries(produtoCount).sort((a, b) => b[1] - a[1])[0];

  res.json({
    total, numVendas: todasVendas.length, ticketMedio: ticket,
    topProduto: topProduto ? topProduto[0] : null,
    vendas: todasVendas,
  });
});

// ── PIX ───────────────────────────────────────────────────────────────────────

function calcCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc;
}

function gerarPixEMV(valor) {
  let pix = '000201';
  pix += '26360014BR.GOV.BCB.PIX011406070066000134';
  pix += '52040000';
  pix += '5303986';
  if (valor > 0) {
    const v = valor.toFixed(2);
    pix += '54' + String(v.length).padStart(2, '0') + v;
  }
  pix += '5802BR';
  pix += '5901N';
  pix += '6001C';
  pix += '62240520IGREJABATISTAZONASUL';
  pix += '6304';
  pix += calcCRC16(pix).toString(16).toUpperCase().padStart(4, '0');
  return pix;
}

app.post('/api/pix/qr', async (req, res) => {
  const valor = parseFloat(req.body.valor) || 0;
  const pixCode = gerarPixEMV(valor);
  const qrDataUrl = await QRCode.toDataURL(pixCode, {
    width: 280, margin: 1, errorCorrectionLevel: 'M',
    color: { dark: '#1E3A6E', light: '#FFFFFF' }
  });
  res.json({ pix: pixCode, qr: qrDataUrl });
});

// ── SYNC CARDÁPIO (admin) ─────────────────────────────────────────────────────
// Insere produtos faltantes em cada barraca sem apagar os já existentes.
app.post('/api/admin/sync-cardapio', requireAdmin, async (req, res) => {
  const { data: barracas, error: be } = await supabase
    .from('barracas').select('id,nome').eq('ativa', true);
  if (be) return res.status(500).json({ error: be.message });

  let totalInseridos = 0;
  const relatorio = [];

  for (const b of barracas) {
    const cardapio = CARDAPIO_PRODUTOS[b.nome];
    if (!cardapio) { relatorio.push({ barraca: b.nome, status: 'sem cardápio' }); continue; }

    // Busca TODOS os produtos (ativos e inativos) para comparação correta
    const { data: existentes } = await supabase
      .from('produtos').select('id,nome,ativo').eq('barraca_id', b.id);

    const existentesMap = new Map((existentes || []).map(p => [p.nome.toLowerCase().trim(), p]));

    let inseridos = 0, reativados = 0;
    for (const p of cardapio) {
      const chave = p.nome.toLowerCase().trim();
      const existente = existentesMap.get(chave);
      if (!existente) {
        // Produto não existe: inserir
        const { error } = await supabase.from('produtos')
          .insert({ barraca_id: b.id, nome: p.nome, preco: p.preco, ativo: true, estoque: -1 });
        if (!error) inseridos++;
      } else if (!existente.ativo) {
        // Produto existe mas inativo: reativar
        const { error } = await supabase.from('produtos')
          .update({ ativo: true, preco: p.preco }).eq('id', existente.id);
        if (!error) reativados++;
      }
    }

    totalInseridos += inseridos + reativados;
    relatorio.push({ barraca: b.nome, inseridos, reativados, status: 'ok' });
  }

  console.log(`🔄 Sync cardápio: ${totalInseridos} produtos inseridos`);
  res.json({ totalInseridos, relatorio });
});

// ── PRODUTOS ──────────────────────────────────────────────────────────────────

app.get('/api/barracas/:id/produtos', async (req, res) => {
  let { data, error } = await supabase
    .from('produtos').select('*')
    .eq('barraca_id', req.params.id).eq('ativo', true).order('nome');

  if (error) return res.status(500).json({ error: error.message });

  // fallback: se DB vazia, usa cardápio em memória
  if ((!data || data.length === 0)) {
    const { data: b } = await supabase.from('barracas').select('nome').eq('id', req.params.id).single();
    if (b && CARDAPIO_PRODUTOS[b.nome]) {
      return res.json(CARDAPIO_PRODUTOS[b.nome].map((p, i) => ({ id: 'mem_' + i, nome: p.nome, preco: p.preco })));
    }
  }

  res.json(data || []);
});

app.post('/api/barracas/:id/produtos', requireGerente, async (req, res) => {
  const { nome, preco, estoque } = req.body;
  if (!nome || !preco) return res.status(400).json({ error: 'Nome e preço obrigatórios' });
  const { data, error } = await supabase
    .from('produtos')
    .insert({ barraca_id: req.params.id, nome: nome.trim(), preco: parseFloat(preco), ativo: true, estoque: estoque ?? -1 })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/produtos/:id', requireGerente, async (req, res) => {
  const { nome, preco, estoque, barraca_id } = req.body;

  // IDs "mem_X" são produtos do cardápio em memória (ainda não persistidos no banco).
  // Nesse caso, convertemos o PUT em INSERT.
  if (req.params.id.startsWith('mem_')) {
    if (!barraca_id) return res.status(400).json({ error: 'barraca_id obrigatório para novo produto' });
    const { data, error } = await supabase
      .from('produtos')
      .insert({ barraca_id, nome: nome?.trim(), preco: parseFloat(preco), estoque: estoque !== undefined ? parseInt(estoque) : -1, ativo: true })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  const updates = {};
  if (nome !== undefined) updates.nome = nome.trim();
  if (preco !== undefined) updates.preco = parseFloat(preco);
  if (estoque !== undefined) updates.estoque = parseInt(estoque);
  const { data, error } = await supabase
    .from('produtos').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/produtos/:id', requireGerente, async (req, res) => {
  const { error } = await supabase
    .from('produtos').update({ ativo: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Atualizar estoque de um produto
app.put('/api/produtos/:id/estoque', requireGerente, async (req, res) => {
  const { estoque } = req.body;
  if (estoque === undefined || estoque === null) {
    return res.status(400).json({ error: 'Estoque obrigatório' });
  }
  const { data, error } = await supabase
    .from('produtos').update({ estoque }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── CARDÁPIO (público) ─────────────────────────────────────────────────────────
app.get('/api/cardapio', async (req, res) => {
  console.log('[CARDAPIO] chamada recebida');
  const { data: barracas, error: be } = await supabase
    .from('barracas').select('*').eq('ativa', true).order('nome');
  console.log('[CARDAPIO] barracas:', (barracas || []).length, 'erro:', be);
  if (be) return res.status(500).json({ error: be.message });

  let { data: produtos } = await supabase
    .from('produtos').select('*').eq('ativo', true).order('nome');
  console.log('[CARDAPIO] produtos no banco:', (produtos || []).length);

  // fallback se DB vazia
  if (!produtos || produtos.length === 0) {
    const fallback = (barracas || []).map(b => ({
      id: b.id, nome: b.nome, emoji: b.emoji,
      produtos: (CARDAPIO_PRODUTOS[b.nome] || []).map((p, i) => ({ id: 'mem_' + i, nome: p.nome, preco: p.preco }))
    }));
    console.log('[CARDAPIO] fallback ativo, resultado:', fallback.length, 'barracas');
    return res.json(fallback);
  }

  // Busca pedidos pendentes para calcular espera por barraca
  const agora = new Date();
  const { data: pendentes } = await supabase
    .from('pedidos').select('barraca_id, criado_em').eq('status', 'pendente');

  const esperaPorBarraca = {};
  (pendentes || []).forEach(p => {
    const min = Math.max(0, Math.floor((agora - new Date(p.criado_em)) / 60000));
    if (!esperaPorBarraca[p.barraca_id]) esperaPorBarraca[p.barraca_id] = [];
    esperaPorBarraca[p.barraca_id].push(min);
  });

  const resultado = (barracas || []).map(b => {
    const esperas = esperaPorBarraca[b.id] || [];
    const media = esperas.length ? Math.round(esperas.reduce((s, v) => s + v, 0) / esperas.length) : 0;
    return {
      id: b.id, nome: b.nome, emoji: b.emoji,
      produtos: (produtos || []).filter(p => p.barraca_id === b.id),
      espera_media_min: media,
      num_pendentes: esperas.length
    };
  });
  console.log('[CARDAPIO] resultado final:', resultado.length, 'barracas');

  res.json(resultado);
});

// ── PEDIDOS DIRETOS ─────────────────────────────────────────────────────────────

// Detecta se um pedido é venda em espécie (pago em dinheiro pelo gerente).
// Espécie embute _forma:'especie' nos itens. Esses pedidos NÃO debitam/estornam
// saldo e NÃO entram nas somas dos relatórios (a transacao já os representa).
function pedidoEhEspecie(pedido) {
  if (!pedido) return false;
  try {
    const itens = JSON.parse(pedido.itens || '[]');
    return Array.isArray(itens) && itens.some(i => i && i._forma === 'especie');
  } catch { return false; }
}

// Criar pedido (cliente escolhe, desconta saldo, notifica barraca)
// requireDono: o pedido só pode ser feito EM NOME do cliente logado (token) —
// impede gastar o saldo de outra pessoa. O valor é recalculado pelo preço do
// banco (valorOficial), nunca pelo preço enviado pelo navegador.
app.post('/api/pedidos', requireDono, async (req, res) => {
  const { cliente_id, barraca_id, itens } = req.body;
  if (!cliente_id || !barraca_id || !itens || !itens.length) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const [cliente, barraca] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', cliente_id).single(),
    supabase.from('barracas').select('*').eq('id', barraca_id).single()
  ]);

  if (cliente.error || !cliente.data) return res.status(404).json({ error: 'Cliente não encontrado' });
  if (barraca.error || !barraca.data) return res.status(404).json({ error: 'Barraca não encontrada' });

  const { valor } = await valorOficial(itens, barraca_id);
  if (valor <= 0) return res.status(400).json({ error: 'Valor inválido' });

  const saldoAtual = parseFloat(cliente.data.saldo);
  if (saldoAtual < valor) {
    return res.status(400).json({
      error: 'Saldo insuficiente',
      saldo: saldoAtual, valor
    });
  }

  const novoSaldo = saldoAtual - valor;
  await supabase.from('clientes').update({ saldo: novoSaldo }).eq('id', cliente_id);

  await decrementarEstoque(itens, barraca_id);

  const { data: pedido, error: pe } = await supabase
    .from('pedidos')
    .insert({ cliente_id, barraca_id, itens: JSON.stringify(itens), valor_total: valor, status: 'pendente' })
    .select().single();

  if (pe) return res.status(500).json({ error: pe.message });

  res.status(201).json({
    ok: true,
    pedido_id: pedido.id,
    valor,
    saldo: novoSaldo,
    mensagem: `Pedido enviado para ${barraca.data.emoji} ${barraca.data.nome}!`
  });
});

// Pedidos em aberto de uma barraca (para o gerente): aguardando preparo
// (pendente) e prontos aguardando retirada (pronto)
app.get('/api/pedidos/pendentes/:barracaId', requireGerente, async (req, res) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(nome,codigo,avatar)')
    .eq('barraca_id', req.params.barracaId)
    .in('status', ['pendente', 'pronto'])
    .order('criado_em', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Marcar pedido como PRONTO para retirada (gerente).
// Avisa o cliente de que pode ir à barraca buscar.
app.post('/api/pedidos/:id/pronto', requireGerente, async (req, res) => {
  const { data: pedido, error: pe } = await supabase
    .from('pedidos').select('*').eq('id', req.params.id).single();
  if (pe || !pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (pedido.status !== 'pendente') return res.status(400).json({ error: 'Pedido não está pendente' });

  const { error: ue } = await supabase
    .from('pedidos').update({ status: 'pronto' }).eq('id', req.params.id);
  if (ue) return res.status(500).json({ error: ue.message });

  res.json({ ok: true });
});

// Confirmar ENTREGA do pedido (gerente marca como entregue).
// Aceita pedidos pendentes ou prontos (gerente pode entregar direto sem
// passar pela etapa "pronto"). NÃO cria transacao — pedidos confirmados
// são contados diretamente no relatorio para evitar dupla contagem com QR.
app.post('/api/pedidos/:id/confirmar', requireGerente, async (req, res) => {
  const { data: pedido, error: pe } = await supabase
    .from('pedidos').select('*').eq('id', req.params.id).single();
  if (pe || !pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (!['pendente', 'pronto'].includes(pedido.status)) {
    return res.status(400).json({ error: 'Pedido já foi entregue ou cancelado' });
  }

  const { error: ue } = await supabase
    .from('pedidos').update({ status: 'confirmado' }).eq('id', req.params.id);
  if (ue) return res.status(500).json({ error: ue.message });

  res.json({ ok: true });
});

// Cliente confirma RECEBIMENTO do próprio pedido (caso o gerente não tenha
// marcado a entrega). Só o dono do pedido pode confirmar.
app.post('/api/pedidos/:id/receber', async (req, res) => {
  const { cliente_id } = req.body;
  const { data: pedido, error: pe } = await supabase
    .from('pedidos').select('*').eq('id', req.params.id).single();
  if (pe || !pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (cliente_id && String(pedido.cliente_id) !== String(cliente_id)) {
    return res.status(403).json({ error: 'Este pedido não é seu' });
  }
  if (!['pendente', 'pronto'].includes(pedido.status)) {
    return res.status(400).json({ error: 'Pedido já foi entregue ou cancelado' });
  }

  const { error: ue } = await supabase
    .from('pedidos').update({ status: 'confirmado' }).eq('id', req.params.id);
  if (ue) return res.status(500).json({ error: ue.message });

  res.json({ ok: true });
});

// Cancelar pedido (gerente) — estorna saldo e restaura estoque
app.post('/api/pedidos/:id/cancelar', requireGerente, async (req, res) => {
  const { motivo } = req.body;
  const { data: pedido, error: pe } = await supabase
    .from('pedidos').select('*').eq('id', req.params.id).single();
  if (pe || !pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (!['pendente', 'pronto'].includes(pedido.status)) return res.status(400).json({ error: 'Apenas pedidos pendentes ou prontos podem ser cancelados' });

  // Estorna saldo ao cliente — SOMENTE para pedidos pagos em Alegrias.
  // Vendas em espécie foram pagas em dinheiro: estornar saldo creditaria
  // Alegrias que o cliente nunca teve. Por isso são puladas aqui.
  if (pedido.cliente_id && !pedidoEhEspecie(pedido)) {
    const { data: cliente } = await supabase.from('clientes').select('saldo').eq('id', pedido.cliente_id).single();
    if (cliente) {
      const novoSaldo = parseFloat(cliente.saldo) + parseFloat(pedido.valor_total || pedido.valor || 0);
      await supabase.from('clientes').update({ saldo: novoSaldo }).eq('id', pedido.cliente_id);
    }
  }

  // Restaura estoque dos produtos (operação inversa do decremento)
  let itensCancelados = [];
  try { itensCancelados = JSON.parse(pedido.itens || '[]'); } catch {}
  for (const item of itensCancelados) {
    const qty = parseInt(item.qty) || 1;
    let prod = null;
    if (item.id && !String(item.id).startsWith('mem_')) {
      const { data } = await supabase.from('produtos').select('id,estoque').eq('id', item.id).single();
      prod = data;
    }
    if (!prod && item.nome && pedido.barraca_id) {
      const { data } = await supabase.from('produtos').select('id,estoque')
        .eq('barraca_id', pedido.barraca_id).eq('nome', item.nome).maybeSingle();
      prod = data;
    }
    if (prod && prod.estoque >= 0) {
      await supabase.from('produtos').update({ estoque: prod.estoque + qty }).eq('id', prod.id);
    }
  }

  // Salva status + motivo. Se coluna motivo_cancelamento não existir, embute no itens
  const updateData = { status: 'cancelado' };
  if (motivo) updateData.motivo_cancelamento = motivo;
  const { error: ce } = await supabase.from('pedidos').update(updateData).eq('id', req.params.id);
  if (ce) {
    // Fallback: guarda motivo embutido no campo itens como _motivo
    const itensComMotivo = itensCancelados.map((i, idx) => idx === 0 ? { ...i, _motivo: motivo || null } : i);
    await supabase.from('pedidos').update({
      status: 'cancelado',
      itens: JSON.stringify(itensComMotivo)
    }).eq('id', req.params.id);
  }
  res.json({ ok: true });
});

// Pedidos do cliente (inclui cancelados para exibir no histórico)
app.get('/api/pedidos/cliente/:clienteId', async (req, res) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, barracas(nome,emoji)')
    .eq('cliente_id', req.params.clienteId)
    .order('criado_em', { ascending: false })
    .limit(30);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Histórico de pedidos de uma barraca (todos os status)
app.get('/api/pedidos/historico/:barracaId', requireGerente, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const { data, error } = await supabase
    .from('pedidos').select('*, clientes(nome,codigo,avatar)')
    .eq('barraca_id', req.params.barracaId)
    .order('criado_em', { ascending: false }).limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Vendas em espécie de hoje para uma barraca
app.get('/api/vendas/especie/:barracaId', requireGerente, async (req, res) => {
  const hojeInicio = new Date(); hojeInicio.setHours(0,0,0,0);
  const { data, error } = await supabase
    .from('transacoes')
    .select('id, timestamp, valor, itens, forma')
    .eq('barraca_id', req.params.barracaId)
    .eq('tipo', 'venda')
    .gte('timestamp', hojeInicio.toISOString())
    .order('timestamp', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  const especie = (data || []).filter(t => {
    if (t.forma === 'especie') return true;
    try { return JSON.parse(t.itens || '[]').some(i => i._forma === 'especie'); } catch { return false; }
  });
  res.json(especie);
});

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

async function logAtividade(acao, entidade, entidadeId, detalhes, perfil, perfilNome, desfazivel = true) {
  await supabase.from('activity_log').insert({
    acao, entidade, entidade_id: entidadeId,
    detalhes, perfil, perfil_nome: perfilNome,
    desfazivel, desfeito: false
  });
}

app.listen(PORT, async () => {
  console.log(`AI - Alegria Inteligente rodando em http://localhost:${PORT}`);
  await seedProdutosSeVazio();
  await seedCodigosBarracas();
  await seedConfigSenhas();
  await formaColunaExiste(); // loga aviso se migração v2 ainda não foi rodada
});

// ── ADMIN: MONITOR DE PEDIDOS ────────────────────────────────────────────────
app.get('/api/admin/pedidos-monitor', requireStaff, async (req, res) => {
  const agora = new Date();
  const hojeInicio = new Date(); hojeInicio.setHours(0,0,0,0);

  const [pendRes, confRes, barsRes] = await Promise.all([
    supabase.from('pedidos')
      .select('id, criado_em, valor_total, itens, barraca_id, barracas(nome,emoji), clientes(nome,avatar)')
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true }),
    supabase.from('pedidos')
      .select('id, barraca_id')
      .eq('status', 'confirmado')
      .gte('criado_em', hojeInicio.toISOString()),
    supabase.from('barracas').select('id,nome,emoji').eq('ativa', true)
  ]);

  const pend = pendRes.data || [];
  const conf = confRes.data || [];
  const bars = barsRes.data || [];

  const porBarraca = {};
  bars.forEach(b => {
    porBarraca[b.id] = { id: b.id, nome: b.nome, emoji: b.emoji, pendentes: [], confirmados_hoje: 0 };
  });

  pend.forEach(p => {
    const wait = Math.floor((agora - new Date(p.criado_em)) / 60000);
    if (!porBarraca[p.barraca_id]) {
      porBarraca[p.barraca_id] = { id: p.barraca_id, nome: p.barracas?.nome || '?', emoji: p.barracas?.emoji || '🏪', pendentes: [], confirmados_hoje: 0 };
    }
    porBarraca[p.barraca_id].pendentes.push({ id: p.id, wait_min: wait, cliente: p.clientes?.nome || '—', cliente_avatar: p.clientes?.avatar || null, valor: p.valor_total, criado_em: p.criado_em });
  });

  conf.forEach(p => { if (porBarraca[p.barraca_id]) porBarraca[p.barraca_id].confirmados_hoje++; });

  const barracasArr = Object.values(porBarraca).map(b => {
    const esperas = b.pendentes.map(p => p.wait_min);
    return { ...b, num_pendentes: b.pendentes.length,
      espera_max_min: esperas.length ? Math.max(...esperas) : 0,
      espera_media_min: esperas.length ? Math.round(esperas.reduce((s,v) => s+v, 0) / esperas.length) : 0 };
  }).sort((a, b) => b.espera_max_min - a.espera_max_min);

  res.json({
    barracas: barracasArr,
    total_pendentes: pend.length,
    espera_max_geral: pend.length ? Math.max(...pend.map(p => Math.floor((agora - new Date(p.criado_em))/60000))) : 0,
    timestamp: agora.toISOString()
  });
});

// ── ADMIN: LOG DE ATIVIDADES ─────────────────────────────────────────────────
app.delete('/api/admin/log', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('activity_log').delete().not('id', 'is', null);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.get('/api/admin/log', requireAdmin, async (req, res) => {
  const { limit } = req.query;
  // Se 'limit' vier explícito, respeita (ex.: dashboard). Sem limit, retorna TUDO
  // (paginação fica no front) — antes cortava em 200 e escondia registros.
  try {
    if (limit) {
      const { data, error } = await supabase
        .from('activity_log').select('*')
        .order('criado_em', { ascending: false }).limit(parseInt(limit));
      if (error) throw error;
      return res.json(data || []);
    }
    const all = await fetchAllRows((ini, fim) => supabase
      .from('activity_log').select('*')
      .order('criado_em', { ascending: false }).range(ini, fim));
    res.json(all);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/log/:id/desfazer', requireAdmin, async (req, res) => {
  const { data: log } = await supabase.from('activity_log').select('*').eq('id', req.params.id).single();
  if (!log || log.desfeito) return res.status(400).json({ error: 'Ação não pode ser desfeita' });

  let ok = false;
  if (log.acao === 'excluir' && log.entidade === 'cliente') {
    const d = log.detalhes;
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: novo, error } = await supabase.from('clientes').insert({ nome: d.nome, codigo, saldo: d.saldo || 0 }).select().single();
    ok = !error && !!novo;
  } else if (log.acao === 'excluir' && log.entidade === 'transacao') {
    const { error } = await supabase.from('transacoes').delete().eq('id', log.entidade_id);
    ok = !error;
  }

  if (ok) await supabase.from('activity_log').update({ desfeito: true }).eq('id', log.id);
  res.json({ ok, logId: log.id });
});

app.get('/api/admin/log/ultimo-excluir', requireAdmin, async (req, res) => {
  const { entidade, nome } = req.query;
  const { data } = await supabase
    .from('activity_log')
    .select('*')
    .eq('acao', 'excluir')
    .eq('entidade', entidade || '')
    .eq('desfeito', false)
    .order('criado_em', { ascending: false })
    .limit(1);
  res.json(data?.[0] || null);
});
