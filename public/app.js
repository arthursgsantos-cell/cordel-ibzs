// ═══════════════════════════════════════════════════════════════════
//  ALEGRIAS – Cordel 2026  |  Frontend App
// ═══════════════════════════════════════════════════════════════════

const API = '';  // mesmo origem

// ── Estado global ────────────────────────────────────────────────
let estado = {
  perfil: null,       // 'cliente' | 'gerente' | 'caixa' | 'admin'
  clienteId: null,
  clienteNome: null,
  barracaId: null,
  carrinho: [],       // [{ id, nome, preco, qty }]
  qrAtualId: null,
  scanner: null,
  qrPollTimer: null,
  clientePollTimer: null,
  caixaClienteId: null,
  pendingQrPayload: null,
};

const CODIGOS = { gerente: '2024', caixa: '5678', admin: '9999' };

// ── Produtos por barraca ─────────────────────────────────────────
const PRODUTOS = {
  'Pamonha Assada':         [{ nome:'Pamonha simples', preco:5 }, { nome:'Pamonha com queijo', preco:6 }, { nome:'Pamonha doce', preco:5 }],
  'Bolo com Café':          [{ nome:'Bolo de milho', preco:5 }, { nome:'Bolo de fubá', preco:5 }, { nome:'Café', preco:3 }, { nome:'Kit bolo+café', preco:7 }],
  'Lanche no Pote':         [{ nome:'Lanche no pote P', preco:10 }, { nome:'Lanche no pote G', preco:14 }, { nome:'Lanche especial', preco:16 }],
  'Cachorro-quente':        [{ nome:'Cachorro simples', preco:8 }, { nome:'Cachorro completo', preco:12 }, { nome:'Mini cachorro', preco:5 }],
  'Milho, Cuscuz e Caldo':  [{ nome:'Milho na espiga', preco:5 }, { nome:'Cuscuz', preco:5 }, { nome:'Caldo de cana', preco:6 }, { nome:'Combo', preco:12 }],
  'Açaí':                   [{ nome:'Açaí P (300ml)', preco:12 }, { nome:'Açaí M (500ml)', preco:16 }, { nome:'Açaí G (700ml)', preco:20 }],
  'Bebidas':                [{ nome:'Água', preco:3 }, { nome:'Refrigerante lata', preco:6 }, { nome:'Suco natural', preco:7 }, { nome:'Limonada', preco:8 }],
  'Salgados':               [{ nome:'Salgado (un.)', preco:4 }, { nome:'Combo 3 salgados', preco:10 }, { nome:'Combo 6 salgados', preco:18 }],
  'Pipoca e Docinhos':      [{ nome:'Pipoca', preco:5 }, { nome:'Brigadeiro', preco:3 }, { nome:'Beijinho', preco:3 }, { nome:'Combo 5 doces', preco:12 }],
  'Churrasco':              [{ nome:'Espetinho (un.)', preco:8 }, { nome:'Combo 2 espetos', preco:14 }, { nome:'Prato churrasquinho', preco:20 }],
  'Cordelsinho (Pescaria/Camarim/Pula-pula)': [{ nome:'Pescaria (1x)', preco:5 }, { nome:'Camarim (1x)', preco:5 }, { nome:'Pula-pula (1x)', preco:5 }, { nome:'Combo 3 atividades', preco:12 }],
};

// ═══════════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  renderLogoTodas();
  atualizarFormLogin();
  restaurarSessao();
});

// ── Sessão persistente ─────────────────────────────────────────────
const SESSAO_KEY = 'alegrias_sessao';

function salvarSessao() {
  localStorage.setItem(SESSAO_KEY, JSON.stringify({
    perfil: estado.perfil,
    clienteId: estado.clienteId,
    clienteNome: estado.clienteNome,
    barracaId: estado.barracaId,
  }));
}

function restaurarSessao() {
  const raw = localStorage.getItem(SESSAO_KEY);
  if (!raw) return;
  try {
    const sessao = JSON.parse(raw);
    if (!sessao.perfil) return;
    estado.perfil = sessao.perfil;
    estado.clienteId = sessao.clienteId || null;
    estado.clienteNome = sessao.clienteNome || null;
    estado.barracaId = sessao.barracaId || null;

    mostrarTela('screen-' + estado.perfil);

    if (estado.perfil === 'gerente') {
      iniciarGerente().then(() => {
        if (estado.barracaId) {
          document.getElementById('gerente-barraca-sel').value = estado.barracaId;
          selecionarBarraca();
        }
      });
    } else if (estado.perfil === 'caixa') {
      iniciarCaixa();
    } else if (estado.perfil === 'cliente') {
      document.getElementById('cliente-nome-header').textContent = estado.clienteNome || '';
      iniciarCliente();
    } else if (estado.perfil === 'admin') {
      iniciarAdmin();
    }
  } catch {}
}

function limparSessao() {
  localStorage.removeItem(SESSAO_KEY);
}

// ── Logo ─────────────────────────────────────────────────────────
function renderLogo(containerId, tamanho) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const img = new Image();
  img.onload = () => {
    el.innerHTML = tamanho === 'grande'
      ? `<img src="assets/logo.png" class="logo-img" alt="Logo" />`
      : `<img src="assets/logo.png" class="logo-img-sm" alt="Logo" />`;
  };
  img.onerror = () => {
    el.innerHTML = tamanho === 'grande'
      ? `<div class="logo-emoji">🎪🎭🎨</div>`
      : `<div class="logo-emoji-sm">🎪</div>`;
  };
  img.src = 'assets/logo.png';
}

function renderLogoTodas() {
  renderLogo('login-logo', 'grande');
  ['gerente-logo-header','caixa-logo-header','cliente-logo-header','admin-logo-header'].forEach(id => renderLogo(id, 'pequeno'));
}

// ═══════════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════════
function atualizarFormLogin() {
  const perfil = document.getElementById('login-perfil').value;
  const wrap = document.getElementById('login-codigo-wrap');
  wrap.style.display = perfil === 'cliente' ? 'none' : 'block';
}

async function fazerLogin() {
  const perfil = document.getElementById('login-perfil').value;
  const nome   = document.getElementById('login-nome').value.trim();
  const codigo = document.getElementById('login-codigo').value.trim();

  if (!nome) { toast('Digite seu nome!', 'error'); return; }

  if (perfil !== 'cliente') {
    if (!codigo) { toast('Digite o código!', 'error'); return; }
    if (codigo !== CODIGOS[perfil]) { toast('Código incorreto!', 'error'); return; }
  }

  if (perfil === 'cliente') {
    const clientes = await api('/api/clientes?nome=' + encodeURIComponent(nome));
    if (!Array.isArray(clientes)) { toast('Servidor indisponível. Tente novamente.', 'error'); return; }
    let cliente = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase());
    if (!cliente) {
      cliente = await api('/api/clientes', 'POST', { nome });
      if (!cliente.id) {
        toast(cliente.error || 'Erro ao cadastrar. Tente novamente.', 'error');
        return;
      }
      toast('Bem-vindo(a), ' + cliente.nome + '! Código: ' + cliente.codigo, 'success');
    }
    estado.clienteId   = cliente.id;
    estado.clienteNome = cliente.nome;
    document.getElementById('cliente-nome-header').textContent = cliente.nome;
  }

  estado.perfil = perfil;
  mostrarTela('screen-' + perfil);
  salvarSessao();

  if (perfil === 'gerente')      iniciarGerente();
  else if (perfil === 'caixa')   iniciarCaixa();
  else if (perfil === 'cliente') iniciarCliente();
  else if (perfil === 'admin')   iniciarAdmin();
}

function irAdmin(e) {
  e.preventDefault();
  document.getElementById('admin-codigo-input').value = '';
  document.getElementById('modal-admin').classList.remove('hidden');
  setTimeout(() => document.getElementById('admin-codigo-input').focus(), 100);
}

function fecharModalAdmin() {
  document.getElementById('modal-admin').classList.add('hidden');
}

function confirmarAdmin() {
  const codigo = document.getElementById('admin-codigo-input').value.trim();
  if (codigo !== CODIGOS.admin) { toast('Código incorreto!', 'error'); return; }
  fecharModalAdmin();
  estado.perfil = 'admin';
  mostrarTela('screen-admin');
  salvarSessao();
  iniciarAdmin();
}

function logout() {
  clearPolls();
  if (estado.scanner) { try { estado.scanner.stop(); } catch {} estado.scanner = null; }
  estado = { perfil:null, clienteId:null, clienteNome:null, barracaId:null, carrinho:[], qrAtualId:null, scanner:null, qrPollTimer:null, clientePollTimer:null, caixaClienteId:null, pendingQrPayload:null };
  document.getElementById('login-nome').value = '';
  document.getElementById('login-codigo').value = '';
  mostrarTela('screen-login');
  limparSessao();
}

// ═══════════════════════════════════════════════════════════════════
//  GERENTE
// ═══════════════════════════════════════════════════════════════════
async function iniciarGerente() {
  const barracas = await api('/api/barracas');
  const sel = document.getElementById('gerente-barraca-sel');
  sel.innerHTML = '<option value="">Selecione a barraca...</option>';
  barracas.forEach(b => {
    sel.innerHTML += `<option value="${b.id}">${b.emoji} ${b.nome}</option>`;
  });
}

async function selecionarBarraca() {
  const sel = document.getElementById('gerente-barraca-sel');
  estado.barracaId = sel.value;
  if (!estado.barracaId) { document.getElementById('gerente-painel').style.display='none'; return; }
  document.getElementById('gerente-painel').style.display = 'block';
  document.getElementById('gerente-barraca-titulo').textContent = sel.options[sel.selectedIndex].text;
  estado.carrinho = [];
  renderCarrinho();
  await renderProdutos(estado.barracaId);
  salvarSessao();
}

async function renderProdutos(barracaId) {
  document.getElementById('produtos-grid').innerHTML = '<div class="loading">Carregando produtos...</div>';
  const produtos = await api('/api/barracas/' + barracaId + '/produtos');
  const lista = Array.isArray(produtos) ? produtos : [];
  const grid = document.getElementById('produtos-grid');
  if (!lista.length) {
    grid.innerHTML = '<p style="color:#3A6EC8;text-align:center;padding:16px;grid-column:1/-1;">Nenhum produto cadastrado.<br>Peça ao admin para cadastrar.</p>';
    estado.carrinho = [];
    return;
  }
  grid.innerHTML = lista.map((p, i) => `
    <div class="produto-card">
      <div class="produto-nome">${p.nome}</div>
      <div class="produto-preco">${p.preco} 🌟</div>
      <div class="produto-qty-row">
        <button class="qty-btn" onclick="alterarQty(${i},-1)">−</button>
        <span class="qty-num" id="qty-${i}">0</span>
        <button class="qty-btn" onclick="alterarQty(${i},1)">+</button>
      </div>
    </div>
  `).join('');
  estado.carrinho = lista.map(p => ({ id: p.id, nome: p.nome, preco: parseFloat(p.preco), qty: 0 }));
}

function alterarQty(idx, delta) {
  if (!estado.carrinho[idx]) return;
  estado.carrinho[idx].qty = Math.max(0, (estado.carrinho[idx].qty || 0) + delta);
  document.getElementById('qty-' + idx).textContent = estado.carrinho[idx].qty;
  renderCarrinho();
}

function renderCarrinho() {
  const itens = estado.carrinho.filter(i => i.qty > 0);
  const total = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  const cont = document.getElementById('carrinho-itens');
  if (!itens.length) {
    cont.innerHTML = '<p style="color:#a0522d;text-align:center;padding:8px;">Nenhum item adicionado</p>';
  } else {
    cont.innerHTML = itens.map(i => `
      <div class="carrinho-item">
        <span>${i.qty}x ${i.nome}</span>
        <span>${i.preco * i.qty} 🌟</span>
      </div>
    `).join('');
  }
  document.getElementById('carrinho-total').textContent = `Total: ${total} Alegrias 🌟`;
}

async function gerarQR() {
  const itens = estado.carrinho.filter(i => i.qty > 0);
  if (!itens.length) { toast('Adicione itens ao carrinho!', 'error'); return; }
  if (!estado.barracaId) { toast('Selecione a barraca!', 'error'); return; }
  const total = itens.reduce((s, i) => s + i.preco * i.qty, 0);

  const res = await api('/api/qr', 'POST', {
    barraca_id: estado.barracaId,
    valor: total,
    itens: itens.map(i => ({ nome: i.nome, preco: i.preco, qty: i.qty }))
  });
  if (!res.id) { toast('Erro ao gerar QR!', 'error'); return; }

  estado.qrAtualId = res.id;
  document.getElementById('modal-qr-img').src = res.qr;
  document.getElementById('modal-qr-info').textContent = `Valor: ${total} Alegrias`;
  document.getElementById('modal-qr-aguarda').style.display = 'block';
  document.getElementById('modal-qr-ok').style.display = 'none';
  document.getElementById('modal-qr').classList.remove('hidden');

  iniciarPollQR(res.id, total);
}

function iniciarPollQR(qrId, total) {
  clearInterval(estado.qrPollTimer);
  estado.qrPollTimer = setInterval(async () => {
    const qr = await api('/api/qr/' + qrId);
    if (qr.confirmado) {
      clearInterval(estado.qrPollTimer);
      document.getElementById('modal-qr-aguarda').style.display = 'none';
      document.getElementById('modal-qr-ok').style.display = 'block';
      toast('✅ Venda confirmada! ' + total + ' Alegrias', 'success');
      estado.carrinho.forEach(i => i.qty = 0);
      document.querySelectorAll('.qty-num').forEach(el => el.textContent = '0');
      renderCarrinho();
    }
  }, 3000);
}

function fecharModalQR() {
  clearInterval(estado.qrPollTimer);
  document.getElementById('modal-qr').classList.add('hidden');
}

function abrirTab(ev, tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  ev.currentTarget.classList.add('active');
  if (tab === 'relatorio') carregarRelatorioBarraca();
}

async function carregarRelatorioBarraca() {
  if (!estado.barracaId) return;
  const r = await api('/api/barracas/' + estado.barracaId + '/relatorio');
  document.getElementById('gerente-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-valor">${r.total ?? 0} 🌟</div><div class="kpi-label">Total vendido</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.numVendas ?? 0}</div><div class="kpi-label">Nº de vendas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${(r.ticketMedio || 0).toFixed(1)}</div><div class="kpi-label">Ticket médio</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.topProduto || '—'}</div><div class="kpi-label">Produto top</div></div>
  `;
  const cont = document.getElementById('gerente-vendas');
  if (!r.vendas.length) { cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Nenhuma venda ainda</p>'; return; }
  cont.innerHTML = r.vendas.slice(0, 20).map(v => `
    <div class="hist-item">
      <div class="hist-info">
        <div class="hist-barraca">${v.clientes ? v.clientes.nome : 'Cliente'}</div>
        <div class="hist-hora">${formatarHora(v.timestamp)}</div>
      </div>
      <div class="hist-valor">−${v.valor} 🌟</div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════════
//  CAIXA
// ═══════════════════════════════════════════════════════════════════
function iniciarCaixa() {
  const atualizarDinheiro = () => {
    const v = parseFloat(document.getElementById('recarga-dinheiro-valor').value) || 0;
    const r = parseFloat(document.getElementById('recarga-dinheiro-recebido').value) || 0;
    document.getElementById('recarga-dinheiro-alegrias').value = v > 0 ? v + ' Alegrias' : '';
    const box = document.getElementById('troco-box');
    if (v > 0 && r > 0) {
      const troco = r - v;
      box.style.display = 'block';
      document.getElementById('troco-valor').textContent = Math.abs(troco).toFixed(2).replace('.', ',');
      box.className = troco >= 0 ? 'troco-positivo' : 'troco-negativo';
      box.firstChild.textContent = troco >= 0 ? 'Troco: R$ ' : 'Falta: R$ ';
    } else {
      box.style.display = 'none';
    }
  };
  document.getElementById('recarga-dinheiro-valor').oninput = atualizarDinheiro;
  document.getElementById('recarga-dinheiro-recebido').oninput = atualizarDinheiro;

  let pixTimer = null;
  document.getElementById('recarga-pix-valor').oninput = () => {
    const v = parseFloat(document.getElementById('recarga-pix-valor').value) || 0;
    clearTimeout(pixTimer);
    if (v <= 0) {
      document.getElementById('pix-qr-img').style.display = 'none';
      document.getElementById('pix-qr-placeholder').style.display = 'block';
      document.getElementById('pix-valor-destaque').style.display = 'none';
      return;
    }
    document.getElementById('pix-qr-placeholder').textContent = 'Gerando QR...';
    pixTimer = setTimeout(() => gerarQRPix(v), 600);
  };
}

async function gerarQRPix(valor) {
  const res = await api('/api/pix/qr', 'POST', { valor });
  if (!res.qr) return;
  const img = document.getElementById('pix-qr-img');
  img.src = res.qr;
  img.style.display = 'block';
  document.getElementById('pix-qr-placeholder').style.display = 'none';
  const destaque = document.getElementById('pix-valor-destaque');
  destaque.textContent = `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
  destaque.style.display = 'block';
}

function abrirQRFullscreen() {
  const img = document.getElementById('pix-qr-img');
  if (!img.src || img.style.display === 'none') return;
  const overlay = document.createElement('div');
  overlay.id = 'qr-fullscreen-overlay';
  overlay.innerHTML = `<img src="${img.src}" alt="QR PIX" /><p>Toque para fechar</p>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

async function buscarCliente() {
  const nome = document.getElementById('caixa-busca').value.trim();
  if (!nome) { toast('Digite um nome!', 'error'); return; }
  const lista = await api('/api/clientes?nome=' + encodeURIComponent(nome));
  renderListaClientes(lista, `Resultados para "${nome}"`);
}

async function verTodosClientes() {
  document.getElementById('caixa-busca').value = '';
  const lista = await api('/api/clientes');
  renderListaClientes(lista, `Todos os clientes (${Array.isArray(lista) ? lista.length : 0})`);
}

function renderListaClientes(lista, titulo) {
  const cont = document.getElementById('caixa-resultados');
  document.getElementById('caixa-cliente-card').style.display = 'none';
  if (!Array.isArray(lista) || !lista.length) {
    cont.innerHTML = '<p style="color:#dc2626;font-size:0.95rem;padding:8px;">Nenhum cliente encontrado.</p>';
    return;
  }
  cont.innerHTML = `<div style="font-size:0.85rem;color:#3A6EC8;margin-bottom:6px;padding:0 4px;">${titulo}</div>` +
    lista.map(c => `
      <div class="card" style="cursor:pointer;padding:12px;margin-bottom:8px;" onclick="selecionarClienteCaixa('${c.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong style="color:#1E3A6E;">${c.nome}</strong>
            <span style="color:#3A6EC8;font-size:0.85rem;margin-left:8px;">Cód: ${c.codigo}</span>
          </div>
          <span style="font-weight:700;color:#C8A020;">${c.saldo} 🌟</span>
        </div>
      </div>
    `).join('');
}

async function selecionarClienteCaixa(id) {
  const c = await api('/api/clientes/' + id);
  estado.caixaClienteId = id;
  document.getElementById('caixa-resultados').innerHTML = '';
  document.getElementById('caixa-busca').value = '';
  document.getElementById('caixa-cliente-info').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:1.3rem;font-weight:700;">${c.nome}</div>
        <div style="color:#a0522d;">Código: ${c.codigo}</div>
      </div>
      <div class="saldo-box" style="padding:14px 24px;margin:0;">
        <div class="saldo-label" style="font-size:0.85rem;">Saldo atual</div>
        <div class="saldo-valor" style="font-size:2rem;">${c.saldo}</div>
        <div class="saldo-moeda" style="font-size:0.85rem;">Alegrias</div>
      </div>
    </div>
  `;
  document.getElementById('caixa-cliente-card').style.display = 'block';
}

function abrirRecarga(ev, tipo) {
  document.querySelectorAll('.recarga-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.recarga-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('recarga-' + tipo).classList.add('active');
  ev.currentTarget.classList.add('active');
}

async function confirmarRecarga(forma) {
  if (!estado.caixaClienteId) { toast('Selecione um cliente!', 'error'); return; }

  let valor = 0;
  if (forma === 'dinheiro') valor = parseFloat(document.getElementById('recarga-dinheiro-valor').value);
  if (forma === 'pix') {
    if (!document.getElementById('pix-confirmado').checked) { toast('Confirme o recebimento do PIX!', 'error'); return; }
    valor = parseFloat(document.getElementById('recarga-pix-valor').value);
  }
  if (forma === 'cartao') valor = parseFloat(document.getElementById('recarga-cartao-valor').value);

  if (!valor || valor <= 0) { toast('Valor inválido!', 'error'); return; }

  const res = await api('/api/clientes/' + estado.caixaClienteId + '/recarregar', 'POST', { valor, forma });
  if (res.saldo !== undefined) {
    toast(`✅ Recarga de ${valor} Alegrias realizada!`, 'success');
    selecionarClienteCaixa(estado.caixaClienteId);
    // Limpa campos
    document.getElementById('recarga-dinheiro-valor').value = '';
    document.getElementById('recarga-dinheiro-recebido').value = '';
    document.getElementById('recarga-dinheiro-alegrias').value = '';
    document.getElementById('troco-box').style.display = 'none';
    document.getElementById('pix-qr-img').style.display = 'none';
    document.getElementById('pix-qr-placeholder').style.display = 'block';
    document.getElementById('pix-valor-destaque').style.display = 'none';
    document.getElementById('recarga-pix-valor').value = '';
    document.getElementById('recarga-cartao-valor').value = '';
    document.getElementById('pix-confirmado').checked = false;
  } else {
    toast('Erro na recarga!', 'error');
  }
}

async function cadastrarCliente() {
  const nome = document.getElementById('novo-cliente-nome').value.trim();
  if (!nome) { toast('Digite o nome!', 'error'); return; }
  const c = await api('/api/clientes', 'POST', { nome });
  if (c.id) {
    toast(`✅ ${c.nome} cadastrado! Código: ${c.codigo}`, 'success');
    document.getElementById('novo-cliente-nome').value = '';
  } else {
    toast(c.error || 'Erro ao cadastrar!', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CLIENTE
// ═══════════════════════════════════════════════════════════════════
function iniciarCliente() {
  carregarSaldoCliente();
  carregarHistoricoCliente();
  estado.clientePollTimer = setInterval(() => {
    carregarSaldoCliente();
    carregarHistoricoCliente();
  }, 5000);
}

async function carregarSaldoCliente() {
  if (!estado.clienteId) return;
  const c = await api('/api/clientes/' + estado.clienteId);
  if (c.saldo !== undefined) {
    document.getElementById('cliente-saldo').textContent = c.saldo;
  }
}

async function carregarHistoricoCliente() {
  if (!estado.clienteId) return;
  const tx = await api('/api/transacoes?cliente_id=' + estado.clienteId + '&tipo=venda&limit=20');
  const cont = document.getElementById('cliente-historico');
  if (!tx.length) { cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Nenhuma compra ainda</p>'; return; }
  cont.innerHTML = tx.map(t => `
    <div class="hist-item">
      <div class="hist-info">
        <div class="hist-barraca">${t.barracas ? t.barracas.emoji+' '+t.barracas.nome : 'Barraca'}</div>
        <div class="hist-hora">${formatarHora(t.timestamp)}</div>
      </div>
      <div class="hist-valor">−${t.valor} 🌟</div>
    </div>
  `).join('');
}

function abrirScanner() {
  document.getElementById('scanner-container').style.display = 'block';
  document.getElementById('reader').innerHTML = '';

  const scanner = new Html5Qrcode('reader');
  estado.scanner = scanner;

  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      try {
        const payload = JSON.parse(decodedText);
        if (payload.tipo === 'venda' && payload.id) {
          fecharScanner();
          mostrarModalCompra(payload);
        }
      } catch (e) { /* ignora QR inválido */ }
    },
    () => {}
  ).catch(() => toast('Câmera indisponível', 'error'));
}

function fecharScanner() {
  document.getElementById('scanner-container').style.display = 'none';
  if (estado.scanner) {
    estado.scanner.stop().catch(() => {});
    estado.scanner = null;
  }
}

function mostrarModalCompra(payload) {
  estado.pendingQrPayload = payload;
  let itensHtml = '';
  if (payload.itens && payload.itens.length) {
    itensHtml = '<ul style="margin:8px 0;padding-left:20px;color:#5a2d0c;">' +
      payload.itens.map(i => `<li>${i.qty}x ${i.nome} — ${i.preco * i.qty} 🌟</li>`).join('') +
      '</ul>';
  }
  document.getElementById('modal-compra-detalhe').innerHTML = `
    <div class="card" style="margin:12px 0;">
      <div style="font-size:1.1rem;font-weight:700;color:#8B0000;">${payload.barraca_nome}</div>
      ${itensHtml}
      <div style="font-size:1.5rem;font-weight:700;color:#d4770a;margin-top:8px;">Total: ${payload.valor} 🌟</div>
    </div>
    <p style="color:#a0522d;font-size:0.9rem;">Saldo atual: <strong>${document.getElementById('cliente-saldo').textContent} Alegrias</strong></p>
  `;
  document.getElementById('modal-compra').classList.remove('hidden');
}

function fecharModalCompra() {
  document.getElementById('modal-compra').classList.add('hidden');
  estado.pendingQrPayload = null;
}

async function confirmarCompra() {
  const payload = estado.pendingQrPayload;
  if (!payload) return;
  fecharModalCompra();

  const res = await api('/api/comprar', 'POST', {
    qr_id: payload.id,
    cliente_id: estado.clienteId
  });

  if (res.ok) {
    toast(`✅ Compra confirmada! Novo saldo: ${res.saldo} 🌟`, 'success');
    document.getElementById('cliente-saldo').textContent = res.saldo;
    carregarHistoricoCliente();
  } else {
    const msg = res.error === 'Saldo insuficiente'
      ? `Saldo insuficiente! Você tem ${res.saldo} 🌟 mas a compra é ${res.valor} 🌟`
      : (res.error || 'Erro na compra');
    toast(msg, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════════
async function iniciarAdmin() {
  await carregarAdmin();
  estado.clientePollTimer = setInterval(carregarAdmin, 15000);
}

function abrirTabAdmin(ev, tab) {
  document.querySelectorAll('#screen-admin .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-admin .tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-admin-' + tab).classList.add('active');
  ev.currentTarget.classList.add('active');
}

async function carregarAdmin() {
  const [r, barracas] = await Promise.all([
    api('/api/admin/relatorio'),
    api('/api/barracas')
  ]);

  // ── Dashboard KPIs
  document.getElementById('admin-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-valor">${r.totalMovimentado ?? 0} 🌟</div><div class="kpi-label">Total Movimentado</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.numClientes ?? 0}</div><div class="kpi-label">Clientes</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.numVendas ?? 0}</div><div class="kpi-label">Vendas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.totalRecargas ?? 0} 🌟</div><div class="kpi-label">Total Recargas</div></div>
  `;

  // ── Dashboard: vendas por barraca (todas, mesmo com 0)
  document.getElementById('admin-barracas-tabela').innerHTML = (r.porBarraca || []).map(b => `
    <tr>
      <td>${b.nome}</td>
      <td style="text-align:center;">${b.vendas}</td>
      <td style="text-align:right;font-weight:700;color:${b.total > 0 ? '#C8A020' : '#9aaccc'};">${b.total} 🌟</td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;color:#3A6EC8;">Sem dados</td></tr>';

  // ── Aba Clientes
  document.getElementById('admin-clientes-tabela').innerHTML = (r.clientes || [])
    .sort((a, b) => b.saldo - a.saldo)
    .map(c => `
      <tr>
        <td>${c.nome}</td>
        <td><span class="badge badge-yellow">${c.codigo}</span></td>
        <td style="text-align:right;font-weight:700;color:#C8A020;">${c.saldo} 🌟</td>
      </tr>
    `).join('') || '<tr><td colspan="3" style="text-align:center;color:#3A6EC8;">Sem clientes</td></tr>';

  // ── Aba Transações
  document.getElementById('admin-tx-tabela').innerHTML = (r.transacoes || []).slice(0, 100).map(t => `
    <tr>
      <td>${formatarHora(t.timestamp)}</td>
      <td><span class="badge ${t.tipo === 'venda' ? 'badge-red' : 'badge-green'}">${t.tipo}</span></td>
      <td>${t.clientes ? t.clientes.nome : '—'}</td>
      <td>${t.barracas ? t.barracas.emoji + ' ' + t.barracas.nome : '—'}</td>
      <td style="text-align:right;font-weight:700;">${t.valor} 🌟</td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:#3A6EC8;">Sem transações</td></tr>';

  // ── Aba Barracas
  if (Array.isArray(barracas) && barracas.length) {
    document.getElementById('admin-barracas-lista').innerHTML = barracas.map(b => {
      const stats = (r.porBarraca || []).find(x => x.nome.includes(b.nome));
      return `
        <div class="card" style="margin-bottom:12px;">
          <div class="barraca-admin-card">
            <div>
              <span style="font-size:1.8rem;">${b.emoji}</span>
              <span style="font-size:1.1rem;font-weight:700;color:#1E3A6E;margin-left:8px;">${b.nome}</span>
              ${stats && stats.vendas > 0
                ? `<div style="font-size:0.85rem;color:#3A6EC8;margin-top:4px;">${stats.vendas} vendas · ${stats.total} 🌟</div>`
                : `<div style="font-size:0.85rem;color:#9aaccc;margin-top:4px;">Sem vendas ainda</div>`}
            </div>
            <button class="btn btn-info btn-sm" style="width:auto;padding:10px 18px;" onclick="gerenciarProdutos('${b.id}','${b.emoji} ${b.nome.replace(/'/g,"\\'")}')">
              🛒 Produtos
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ── Gerenciamento de Produtos ────────────────────────────────────
let produtosBarracaAtual = null;

async function gerenciarProdutos(barracaId, nome) {
  produtosBarracaAtual = barracaId;
  document.getElementById('modal-produtos-titulo').textContent = nome;
  document.getElementById('novo-produto-nome').value = '';
  document.getElementById('novo-produto-preco').value = '';
  document.getElementById('modal-produtos').classList.remove('hidden');
  await carregarProdutosModal(barracaId);
}

async function carregarProdutosModal(barracaId) {
  const produtos = await api('/api/barracas/' + barracaId + '/produtos');
  const cont = document.getElementById('modal-produtos-lista');
  if (!Array.isArray(produtos) || !produtos.length) {
    cont.innerHTML = '<p style="color:#3A6EC8;text-align:center;padding:12px;">Nenhum produto cadastrado</p>';
    return;
  }
  cont.innerHTML = produtos.map(p => `
    <div class="produto-linha">
      <span class="produto-linha-nome">${p.nome}</span>
      <span class="produto-linha-preco">${p.preco} 🌟</span>
      <button class="btn btn-danger btn-sm" style="width:auto;min-height:36px;padding:4px 12px;font-size:0.85rem;" onclick="deletarProduto('${p.id}')">Remover</button>
    </div>
  `).join('');
}

async function adicionarProduto() {
  const nome = document.getElementById('novo-produto-nome').value.trim();
  const preco = parseFloat(document.getElementById('novo-produto-preco').value);
  if (!nome) { toast('Digite o nome do produto!', 'error'); return; }
  if (!preco || preco <= 0) { toast('Digite um preço válido!', 'error'); return; }
  const res = await api('/api/barracas/' + produtosBarracaAtual + '/produtos', 'POST', { nome, preco });
  if (res.id) {
    toast('Produto adicionado!', 'success');
    document.getElementById('novo-produto-nome').value = '';
    document.getElementById('novo-produto-preco').value = '';
    await carregarProdutosModal(produtosBarracaAtual);
  } else {
    toast(res.error || 'Erro ao adicionar!', 'error');
  }
}

async function deletarProduto(id) {
  const res = await api('/api/produtos/' + id, 'DELETE');
  if (res.ok) {
    toast('Produto removido!', 'success');
    await carregarProdutosModal(produtosBarracaAtual);
  } else {
    toast('Erro ao remover!', 'error');
  }
}

function fecharModalProdutos() {
  document.getElementById('modal-produtos').classList.add('hidden');
  produtosBarracaAtual = null;
}

// ═══════════════════════════════════════════════════════════════════
//  UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════
function mostrarTela(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function clearPolls() {
  clearInterval(estado.qrPollTimer);
  clearInterval(estado.clientePollTimer);
}

async function api(url, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + url, opts);
    return await res.json();
  } catch (e) {
    console.error('API error', url, e);
    return {};
  }
}

let toastTimer;
function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + (tipo === 'success' ? 'success' : tipo === 'error' ? 'error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function formatarHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
