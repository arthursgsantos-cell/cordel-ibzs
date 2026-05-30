require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const supabase = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
  const { data, error } = await supabase.from('clientes').select('*').order('nome');
  if (error) return res.status(500).json({ error: error.message });
  if (!nome) return res.json(data);
  const scored = data
    .map(c => ({ ...c, _score: scoreFuzzy(c.nome, nome) }))
    .filter(c => c._score >= 50)
    .sort((a, b) => b._score - a._score);
  res.json(scored);
});

app.get('/api/clientes/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(data);
});

app.post('/api/clientes', async (req, res) => {
  const { nome } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatório' });

  // Bloqueia nomes idênticos (case-insensitive)
  const { data: existente } = await supabase
    .from('clientes').select('id').ilike('nome', nome.trim()).limit(1);
  if (existente && existente.length > 0) {
    return res.status(409).json({ error: 'Nome já cadastrado. Use um sobrenome, apelido ou número para diferenciar (ex: João Silva 2).' });
  }

  const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabase
    .from('clientes')
    .insert({ nome: nome.trim(), codigo, saldo: 0 })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
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

  await supabase.from('transacoes').insert({
    tipo: 'recarga',
    cliente_id: req.params.id,
    valor: v,
    itens: JSON.stringify({ forma: forma || 'dinheiro' })
  });

  res.json({ saldo: novoSaldo });
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

  await supabase.from('transacoes').insert({
    tipo: 'venda',
    cliente_id,
    barraca_id: qr.barraca_id,
    valor,
    itens: qr.itens
  });

  res.json({ ok: true, saldo: novoSaldo, valor });
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
  const [clientes, transacoes, barracas] = await Promise.all([
    supabase.from('clientes').select('*'),
    supabase.from('transacoes').select(`*, clientes(nome), barracas(nome,emoji)`).order('timestamp', { ascending: false }).limit(500),
    supabase.from('barracas').select('*').eq('ativa', true)
  ]);

  const tx = transacoes.data || [];
  const vendas = tx.filter(t => t.tipo === 'venda');
  const recargas = tx.filter(t => t.tipo === 'recarga');

  const totalMovimentado = vendas.reduce((s, t) => s + parseFloat(t.valor), 0);
  const totalRecargas = recargas.reduce((s, t) => s + parseFloat(t.valor), 0);

  // Inicia com todas as barracas (mesmo sem vendas)
  const porBarraca = {};
  (barracas.data || []).forEach(b => {
    porBarraca[b.id] = { nome: `${b.emoji} ${b.nome}`, total: 0, vendas: 0 };
  });
  vendas.forEach(t => {
    if (!porBarraca[t.barraca_id]) {
      porBarraca[t.barraca_id] = {
        nome: t.barracas ? `${t.barracas.emoji} ${t.barracas.nome}` : 'Desconhecida',
        total: 0, vendas: 0
      };
    }
    porBarraca[t.barraca_id].total += parseFloat(t.valor);
    porBarraca[t.barraca_id].vendas += 1;
  });

  res.json({
    totalMovimentado,
    totalRecargas,
    numClientes: (clientes.data || []).length,
    numVendas: vendas.length,
    numRecargas: recargas.length,
    porBarraca: Object.values(porBarraca).sort((a, b) => b.total - a.total),
    clientes: clientes.data || [],
    transacoes: tx.slice(0, 200)
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

// ── PRODUTOS ──────────────────────────────────────────────────────────────────

app.get('/api/barracas/:id/produtos', async (req, res) => {
  const { data, error } = await supabase
    .from('produtos').select('*')
    .eq('barraca_id', req.params.id).eq('ativo', true).order('nome');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/barracas/:id/produtos', async (req, res) => {
  const { nome, preco } = req.body;
  if (!nome || !preco) return res.status(400).json({ error: 'Nome e preço obrigatórios' });
  const { data, error } = await supabase
    .from('produtos')
    .insert({ barraca_id: req.params.id, nome: nome.trim(), preco: parseFloat(preco), ativo: true })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/produtos/:id', async (req, res) => {
  const { nome, preco } = req.body;
  const updates = {};
  if (nome !== undefined) updates.nome = nome.trim();
  if (preco !== undefined) updates.preco = parseFloat(preco);
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

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Alegrias rodando em http://localhost:${PORT}`));
