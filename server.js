require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const crypto = require('crypto');
const supabase = require('./database');

const app = express();
app.use(cors());
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));
app.use(express.static('public'));

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

app.get('/api/clientes', async (req, res) => {
  const { nome, codigo } = req.query;
  if (codigo) {
    const { data, error } = await supabase.from('clientes').select('*').eq('codigo', codigo);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  const lim = parseInt(req.query.limit) || 500;
  const { data, error } = await supabase.from('clientes').select('*').order('nome').limit(lim);
  if (error) return res.status(500).json({ error: error.message });
  if (!nome) return res.json(data);
  const scored = data
    .map(c => ({ ...c, _score: scoreFuzzy(c.nome, nome) }))
    .filter(c => c._score >= 50)
    .sort((a, b) => b._score - a._score);
  res.json(scored);
});

app.put('/api/clientes/:id', async (req, res) => {
  const { nome, saldo, pin } = req.body;
  const updates = {};
  if (nome !== undefined) updates.nome = nome.trim();
  if (saldo !== undefined && !isNaN(saldo)) updates.saldo = parseFloat(saldo);
  if (pin !== undefined && pin !== '' && /^\d{4}$/.test(String(pin))) {
    updates.pin_hash = hashPin(String(pin));
  }
  const { data, error } = await supabase
    .from('clientes').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/clientes/:id', async (req, res) => {
  const { data: cliente } = await supabase.from('clientes').select('id,nome,saldo').eq('id', req.params.id).single();
  await supabase.from('transacoes').delete().eq('cliente_id', req.params.id);
  await supabase.from('pedidos').delete().eq('cliente_id', req.params.id);
  const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await logAtividade('excluir', 'cliente', req.params.id, { nome: cliente?.nome, saldo: cliente?.saldo }, 'admin', 'Admin');
  res.json({ ok: true });
});

app.delete('/api/clientes', async (req, res) => {
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

app.delete('/api/transacoes', async (req, res) => {
  const { data: tx } = await supabase.from('transacoes').select('id,tipo,valor,cliente_id,barraca_id');
  const { error } = await supabase.from('transacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) return res.status(500).json({ error: error.message });
  for (const t of (tx || [])) {
    await logAtividade('excluir', 'transacao', t.id, { tipo: t.tipo, valor: t.valor }, 'admin', 'Admin');
  }
  res.json({ ok: true, total: tx?.length || 0 });
});

// ── RESET GERAL (apaga dados de teste, mantém barracas e produtos) ────────────
app.post('/api/admin/reset-evento', async (req, res) => {
  const { confirmacao } = req.body;
  if (confirmacao !== 'RESETAR') return res.status(400).json({ error: 'Envie { confirmacao: "RESETAR" } para confirmar' });

  try {
    // Ordem importa: primeiro pedidos e transacoes (dependem de clientes), depois clientes
    const [rPedidos, rTx, rClientes] = await Promise.all([
      supabase.from('pedidos').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('transacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    ]);

    // Clientes depois (referenciados por pedidos/transacoes)
    const rC = await supabase.from('clientes').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (rPedidos.error) throw new Error('pedidos: ' + rPedidos.error.message);
    if (rTx.error)      throw new Error('transacoes: ' + rTx.error.message);
    if (rC.error)       throw new Error('clientes: ' + rC.error.message);

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
}

// Login de caixa/admin validado no servidor (antes era hardcoded no frontend)
app.post('/api/auth/perfil', async (req, res) => {
  const { perfil, codigo } = req.body;
  if (!['admin', 'caixa'].includes(perfil)) return res.status(400).json({ error: 'Perfil inválido' });
  if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });
  const senha = await getSenha(perfil);
  if (String(codigo).trim() !== senha) return res.status(401).json({ error: 'Código incorreto!' });
  res.json({ ok: true, perfil });
});

app.get('/api/admin/senhas', async (req, res) => {
  res.json({
    admin: await getSenha('admin'),
    caixa: await getSenha('caixa'),
    persistido: await configTabelaExiste(),
  });
});

app.put('/api/admin/senhas', async (req, res) => {
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

app.get('/api/clientes/:id', async (req, res) => {
  const { data, error } = await supabase.from('clientes').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(data);
});

app.get('/api/clientes/:id/qr', async (req, res) => {
  const { data: cliente, error } = await supabase.from('clientes').select('id,nome,codigo').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Cliente não encontrado' });
  const payload = JSON.stringify({ tipo: 'cliente', id: cliente.id, nome: cliente.nome, codigo: cliente.codigo });
  const qr = await QRCode.toDataURL(payload, { width: 280, margin: 2, color: { dark: '#1E3A6E', light: '#FFFFFF' } });
  res.json({ qr });
});

app.post('/api/clientes', async (req, res) => {
  const { nome, pin } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatório' });

  const { data: existente } = await supabase
    .from('clientes').select('id').ilike('nome', nome.trim()).limit(1);
  if (existente && existente.length > 0) {
    return res.status(409).json({ error: 'Nome já cadastrado. Use um sobrenome, apelido ou número para diferenciar (ex: João Silva 2).' });
  }

  const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
  const insertData = { nome: nome.trim(), codigo, saldo: 0 };
  if (pin) insertData.pin_hash = hashPin(pin);

  const { data, error } = await supabase.from('clientes').insert(insertData).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logAtividade('criar', 'cliente', data.id, { nome: data.nome, saldo: 0 }, req.body.perfil || 'caixa', req.body.perfilNome || '');
  res.status(201).json(data);
});

// admin reseta PIN de cliente
app.post('/api/admin/clientes/:id/reset-pin', async (req, res) => {
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

app.post('/api/clientes/login', async (req, res) => {
  const { nome, pin } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  if (!pin) return res.status(400).json({ error: 'Senha obrigatória' });

  const { data, error } = await supabase
    .from('clientes').select('*').ilike('nome', nome.trim()).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });

  const cliente = data[0];
  if (!cliente.pin_hash) return res.status(401).json({ error: 'sem_pin', message: 'Cliente sem senha cadastrada', codigo: cliente.codigo });

  if (cliente.pin_hash !== hashPin(pin)) return res.status(401).json({ error: 'Pin incorreto' });

  res.json({ id: cliente.id, nome: cliente.nome, codigo: cliente.codigo, saldo: cliente.saldo });
});

// ── RECARGA ──────────────────────────────────────────────────────────────────

app.post('/api/clientes/:id/recarregar', async (req, res) => {
  const { valor, forma } = req.body;
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
  await supabase.from('transacoes').insert(txRecarga);

  res.json({ saldo: novoSaldo });
});

// ── CLIENTES CRUD ─────────────────────────────────────────────────────────────

app.put('/api/clientes/:id', async (req, res) => {
  const { nome, saldo, pin } = req.body;
  if (!nome && saldo === undefined && pin === undefined) return res.status(400).json({ error: 'Nada para atualizar' });
  const updates = {};
  if (nome) updates.nome = nome.trim();
  if (saldo !== undefined) updates.saldo = parseFloat(saldo);
  if (pin !== undefined) updates.pin_hash = pin ? hashPin(pin) : null;
  const { data, error } = await supabase
    .from('clientes').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/clientes/:id', async (req, res) => {
  const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

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
app.post('/api/auth/gerente', async (req, res) => {
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
  res.json({ ok: true, barraca });
});

// Regenerar código de uma barraca (admin)
app.post('/api/barracas/:id/regenerar-codigo', async (req, res) => {
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

app.put('/api/barracas/:id', async (req, res) => {
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

app.post('/api/barracas', async (req, res) => {
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

app.delete('/api/barracas/:id', async (req, res) => {
  const { error } = await supabase
    .from('barracas').update({ ativa: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── TRANSAÇÕES FILTRADAS + EXPORTAÇÃO ─────────────────────────────────────────

app.get('/api/admin/transacoes', async (req, res) => {
  const { cliente_id, barraca_id, tipo, data, limit, cliente_nome } = req.query;
  const lim = Math.min(parseInt(limit) || 100, 500);

  let txQuery = supabase
    .from('transacoes')
    .select(`*, clientes(nome,codigo), barracas(nome,emoji)`)
    .order('timestamp', { ascending: false })
    .limit(lim);
  if (barraca_id) txQuery = txQuery.eq('barraca_id', barraca_id);
  if (data) {
    const ini = data + 'T00:00:00'; const fim = data + 'T23:59:59';
    txQuery = txQuery.gte('timestamp', ini).lte('timestamp', fim);
  }
  // Filtro por tipo — se 'pedido' pedimos só pedidos; senão filtra transações
  const filtroPedido = tipo === 'pedido';
  const filtroRecarga = tipo === 'recarga';
  const filtroQR = tipo === 'qr';
  const filtroEspecie = tipo === 'especie';
  if (filtroRecarga) txQuery = txQuery.eq('tipo', 'recarga');
  else if (filtroQR || filtroEspecie) txQuery = txQuery.eq('tipo', 'venda');
  else if (!filtroPedido && tipo) txQuery = txQuery.eq('tipo', tipo);
  if (cliente_id) txQuery = txQuery.eq('cliente_id', cliente_id);

  let pedQuery = supabase
    .from('pedidos')
    .select(`*, clientes(nome,codigo), barracas(nome,emoji)`)
    .eq('status', 'confirmado')
    .order('criado_em', { ascending: false })
    .limit(lim);
  if (barraca_id) pedQuery = pedQuery.eq('barraca_id', barraca_id);
  if (data) {
    const ini = data + 'T00:00:00'; const fim = data + 'T23:59:59';
    pedQuery = pedQuery.gte('criado_em', ini).lte('criado_em', fim);
  }
  if (cliente_id) pedQuery = pedQuery.eq('cliente_id', cliente_id);

  const [txRes, pedRes] = await Promise.all([
    filtroPedido ? { data: [] } : txQuery,
    filtroRecarga || filtroQR || filtroEspecie ? { data: [] } : pedQuery,
  ]);

  const txData = (txRes.data || []).map(t => {
    let forma = t.forma || null;
    try {
      const parsed = JSON.parse(t.itens || '{}');
      if (!forma) forma = Array.isArray(parsed) ? (parsed[0]?._forma || null) : (parsed.forma || null);
    } catch {}
    const origemVenda = forma === 'especie' ? 'especie' : 'qr';
    return { ...t, _origem: t.tipo === 'recarga' ? 'recarga' : origemVenda, forma, timestamp: t.timestamp };
  });

  const pedData = (pedRes.data || []).map(p => ({
    id: p.id, tipo: 'venda', _origem: 'pedido',
    cliente_id: p.cliente_id, barraca_id: p.barraca_id,
    valor: p.valor_total || p.valor || 0,
    itens: p.itens, forma: null,
    clientes: p.clientes, barracas: p.barracas,
    timestamp: p.criado_em,
  }));

  let unified = [...txData, ...pedData]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, lim);

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

app.get('/api/admin/export-csv', async (req, res) => {
  const { data: tx } = await supabase
    .from('transacoes')
    .select(`*, clientes(nome), barracas(nome,emoji)`)
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

app.post('/api/admin/fechar-caixa', async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Data obrigatória' });

  const ini = data + 'T00:00:00';
  const fim = data + 'T23:59:59';

  const [tx, clientes, barracas] = await Promise.all([
    supabase.from('transacoes').select(`*, clientes(nome), barracas(nome,emoji)`)
      .gte('timestamp', ini).lte('timestamp', fim).order('timestamp', { ascending: false }),
    supabase.from('clientes').select('*'),
    supabase.from('barracas').select('*').eq('ativa', true)
  ]);

  const txx = tx.data || [];
  const vendas = txx.filter(t => t.tipo === 'venda');
  const recargas = txx.filter(t => t.tipo === 'recarga');

  const porBarraca = {};
  (barracas.data || []).forEach(b => { porBarraca[b.id] = { nome: b.nome, emoji: b.emoji, total: 0, vendas: 0 }; });
  vendas.forEach(t => {
    if (!porBarraca[t.barraca_id] && t.barracas) porBarraca[t.barraca_id] = { nome: t.barracas.nome, emoji: t.barracas.emoji, total: 0, vendas: 0 };
    if (porBarraca[t.barraca_id]) { porBarraca[t.barraca_id].total += parseFloat(t.valor); porBarraca[t.barraca_id].vendas += 1; }
  });

  res.json({
    data,
    totalVendas: vendas.reduce((s, t) => s + parseFloat(t.valor), 0),
    totalRecargas: recargas.reduce((s, t) => s + parseFloat(t.valor), 0),
    numVendas: vendas.length,
    numRecargas: recargas.length,
    porBarraca: Object.values(porBarraca).sort((a, b) => b.total - a.total),
    totalClientes: (clientes.data || []).length,
    transacoes: txx,
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

app.post('/api/qr', async (req, res) => {
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

app.post('/api/comprar', async (req, res) => {
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

app.post('/api/vendas/especie', async (req, res) => {
  const { barraca_id, itens } = req.body;
  if (!barraca_id || !Array.isArray(itens) || !itens.length) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  const valor = itens.reduce((s, i) => s + (parseFloat(i.preco) * (parseInt(i.qty) || 1)), 0);
  if (!valor || valor <= 0) return res.status(400).json({ error: 'Valor inválido' });

  const insert = { tipo: 'venda', barraca_id, valor, itens: JSON.stringify(itens) };
  if (await formaColunaExiste()) {
    insert.forma = 'especie';
  } else {
    // Fallback sem migração: marca a forma no primeiro item (mesmo padrão do _motivo)
    const marcados = itens.map((i, idx) => idx === 0 ? { ...i, _forma: 'especie' } : i);
    insert.itens = JSON.stringify(marcados);
  }

  const { data: tx, error } = await supabase.from('transacoes').insert(insert).select().single();
  if (error) return res.status(500).json({ error: error.message });

  await decrementarEstoque(itens, barraca_id);
  res.status(201).json({ ok: true, valor, transacao_id: tx.id });
});

// ── TRANSAÇÕES ────────────────────────────────────────────────────────────────

app.get('/api/transacoes', async (req, res) => {
  const { cliente_id, barraca_id, tipo, limit } = req.query;
  let query = supabase
    .from('transacoes')
    .select(`*, clientes(nome,codigo), barracas(nome,emoji)`)
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

app.get('/api/admin/relatorio', async (req, res) => {
  // Busca tudo em paralelo: clientes, transacoes (QR), pedidos confirmados, barracas
  const [clientes, transacoes, pedidos, barracas] = await Promise.all([
    supabase.from('clientes').select('*'),
    supabase.from('transacoes').select('*, clientes(nome), barracas(nome,emoji)').order('timestamp', { ascending: false }).limit(500),
    supabase.from('pedidos').select('*, clientes(nome), barracas(nome,emoji)').eq('status', 'confirmado').order('criado_em', { ascending: false }).limit(500),
    supabase.from('barracas').select('*').eq('ativa', true),
  ]);

  const tx     = transacoes.data || [];
  const peds   = pedidos.data   || [];
  const recargas = tx.filter(t => t.tipo === 'recarga');
  // Vendas QR = transacoes tipo venda
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
  const { data: tx, error } = await supabase
    .from('transacoes')
    .select(`*, clientes(nome)`)
    .eq('barraca_id', req.params.id)
    .eq('tipo', 'venda')
    .order('timestamp', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const total = tx.reduce((s, t) => s + parseFloat(t.valor), 0);
  const ticket = tx.length > 0 ? total / tx.length : 0;

  const produtoCount = {};
  tx.forEach(t => {
    let itens = [];
    try { itens = JSON.parse(t.itens || '[]'); } catch {}
    itens.forEach(item => {
      const k = item.nome || item.name || 'Item';
      produtoCount[k] = (produtoCount[k] || 0) + (item.qty || item.quantidade || 1);
    });
  });
  const topProduto = Object.entries(produtoCount).sort((a, b) => b[1] - a[1])[0];

  res.json({
    total, numVendas: tx.length, ticketMedio: ticket,
    topProduto: topProduto ? topProduto[0] : null,
    vendas: tx
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
app.post('/api/admin/sync-cardapio', async (req, res) => {
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

app.post('/api/barracas/:id/produtos', async (req, res) => {
  const { nome, preco, estoque } = req.body;
  if (!nome || !preco) return res.status(400).json({ error: 'Nome e preço obrigatórios' });
  const { data, error } = await supabase
    .from('produtos')
    .insert({ barraca_id: req.params.id, nome: nome.trim(), preco: parseFloat(preco), ativo: true, estoque: estoque ?? -1 })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/produtos/:id', async (req, res) => {
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

app.delete('/api/produtos/:id', async (req, res) => {
  const { error } = await supabase
    .from('produtos').update({ ativo: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Atualizar estoque de um produto
app.put('/api/produtos/:id/estoque', async (req, res) => {
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

  const resultado = (barracas || []).map(b => ({
    id: b.id, nome: b.nome, emoji: b.emoji,
    produtos: (produtos || []).filter(p => p.barraca_id === b.id)
  }));
  console.log('[CARDAPIO] resultado final:', resultado.length, 'barracas');

  res.json(resultado);
});

// ── PEDIDOS DIRETOS ─────────────────────────────────────────────────────────────

// Criar pedido (cliente escolhe, desconta saldo, notifica barraca)
app.post('/api/pedidos', async (req, res) => {
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

  const valor = itens.reduce((s, i) => s + (parseFloat(i.preco) * (parseInt(i.qty) || 1)), 0);
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

// Pedidos pendentes de uma barraca (para o gerente)
app.get('/api/pedidos/pendentes/:barracaId', async (req, res) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(nome,codigo)')
    .eq('barraca_id', req.params.barracaId)
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Confirmar pedido (gerente marca como entregue)
// NÃO cria transacao — pedidos confirmados são contados diretamente no relatorio
// para evitar dupla contagem com transacoes de QR
app.post('/api/pedidos/:id/confirmar', async (req, res) => {
  const { data: pedido, error: pe } = await supabase
    .from('pedidos').select('*').eq('id', req.params.id).single();
  if (pe || !pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (pedido.status !== 'pendente') return res.status(400).json({ error: 'Pedido já confirmado' });

  const { error: ue } = await supabase
    .from('pedidos').update({ status: 'confirmado' }).eq('id', req.params.id);
  if (ue) return res.status(500).json({ error: ue.message });

  res.json({ ok: true });
});

// Cancelar pedido (gerente) — estorna saldo e restaura estoque
app.post('/api/pedidos/:id/cancelar', async (req, res) => {
  const { motivo } = req.body;
  const { data: pedido, error: pe } = await supabase
    .from('pedidos').select('*').eq('id', req.params.id).single();
  if (pe || !pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (pedido.status !== 'pendente') return res.status(400).json({ error: 'Apenas pedidos pendentes podem ser cancelados' });

  // Estorna saldo ao cliente
  const { data: cliente } = await supabase.from('clientes').select('saldo').eq('id', pedido.cliente_id).single();
  if (cliente) {
    const novoSaldo = parseFloat(cliente.saldo) + parseFloat(pedido.valor_total || pedido.valor || 0);
    await supabase.from('clientes').update({ saldo: novoSaldo }).eq('id', pedido.cliente_id);
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

// Histórico de pedidos de uma barraca (todos, não só pendentes)
app.get('/api/pedidos/historico/:barracaId', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(nome,codigo)')
    .eq('barraca_id', req.params.barracaId)
    .order('criado_em', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
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

// ── ADMIN: LOG DE ATIVIDADES ─────────────────────────────────────────────────
app.get('/api/admin/log', async (req, res) => {
  const { limit } = req.query;
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(Math.min(parseInt(limit) || 50, 200));
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/admin/log/:id/desfazer', async (req, res) => {
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

app.get('/api/admin/log/ultimo-excluir', async (req, res) => {
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
