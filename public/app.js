// ═══════════════════════════════════════════════════════════════════
//  ALEGRIAS – Cordel 2026  |  Frontend App
// ═══════════════════════════════════════════════════════════════════

const API = '';  // mesmo origem
let todasBarracas = [];

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
  // cardápio do cliente
  clienteCarrinho: [],   // [{barraca_id, nome, preco, qty}]
  clienteBarracaAtual: null,
  pedidosPollTimer: null,
  gerentePedidosTimer: null,
};

// Senhas de caixa/admin agora são validadas no servidor (tabela config do Supabase)
// e gerenciadas na aba 🔑 Senhas do Admin.

// ── PRODutos por barraca (cardápio oficial do evento) ──────────────
const PRODUTOS = {
  'Pamonha Assada':          [{ nome:'Pamonha assada', preco:3 }],
  'Bolo com Café':           [{ nome:'Bolo de milho', preco:5 }, { nome:'Bolo de fubá', preco:5 }, { nome:'Bolo caseiro', preco:6 }, { nome:'Café', preco:3 }, { nome:'Kit bolo + café', preco:7 }],
  'Lanche no Pote':          [{ nome:'Canjica', preco:5 }, { nome:'Escondidinho', preco:6 }, { nome:'Arroz doce', preco:5 }],
  'Cachorro-quente':         [{ nome:'Cachorro-quente', preco:6 }],
  'Milho, Cuscuz e Caldo':   [{ nome:'Milho', preco:4 }, { nome:'Cuscuz', preco:4 }, { nome:'Caldo de macaxeira', preco:6 }, { nome:'Caldo verde', preco:6 }],
  'Açaí':                    [{ nome:'Açaí P (300ml)', preco:12 }, { nome:'Açaí M (500ml)', preco:16 }, { nome:'Açaí G (700ml)', preco:20 }, { nome:'Açaí com granola', preco:18 }],
  'Bebidas':                 [{ nome:'Água', preco:3 }, { nome:'Água de coco (300mL)', preco:5 }, { nome:'Coca-Cola (350mL)', preco:5 }, { nome:'Coca-Cola Zero (350mL)', preco:5 }, { nome:'Guaraná (350mL)', preco:5 }, { nome:'Fanta Laranja (350mL)', preco:5 }, { nome:'Sprite (350mL)', preco:5 }, { nome:'Schweppes Citrus (350mL)', preco:5 }],
  'Salgados':                [{ nome:'Salgado (un.)', preco:4 }, { nome:'Combo 3 salgados', preco:10 }, { nome:'Combo 6 salgados', preco:18 }, { nome:'Coxinha', preco:5 }],
  'Pipoca e Docinhos':       [{ nome:'Pipoca', preco:5 }, { nome:'Brigadeiro', preco:3 }, { nome:'Beijinho', preco:3 }, { nome:'Combo 5 doces', preco:12 }, { nome:'Pipoca + Brigadeiro', preco:7 }],
  'Churrasco':               [{ nome:'🌶️ Tradicional — Carne', preco:8 }, { nome:'🌶️ Tradicional — Frango', preco:8 }, { nome:'🌶️ Tradicional — Calabresa', preco:8 }, { nome:'🌶️ Tradicional — Queijo coalho', preco:8 }, { nome:'🌶️ Tradicional — Coração', preco:8 }, { nome:'🌶️ Tradicional — Pão de alho', preco:8 }, { nome:'🌶️ Tradicional — Misto', preco:8 }, { nome:'⭐ Especial — Alcatra suína', preco:12 }, { nome:'⭐ Especial — Medalhão de carne', preco:12 }, { nome:'⭐ Especial — Medalhão de frango', preco:12 }, { nome:'⭐ Especial — Queijo com mel', preco:12 }, { nome:'🍓 Sobremesa — Romeu e Julieta', preco:8 }],
  'Cordelsinho (Pescaria/Camarim/Pula-pula)': [{ nome:'Pescaria (1x)', preco:5 }, { nome:'Camarim (1x)', preco:5 }, { nome:'Pula-pula (1x)', preco:5 }, { nome:'Combo 3 atividades', preco:12 }, { nome:'Pula-pula livre', preco:15 }],
};

// ═══════════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  iniciarSplash();
  renderLogoTodas();
  atualizarFormLogin();
  restaurarSessao();
});

// Quando o usuário volta para a aba (mobile sai do background / tela acende)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (estado.perfil === 'gerente') gerenteCarregarPedidos();
  if (estado.perfil === 'cliente') { carregarPedidosCliente(); carregarSaldoCliente(); }
});

// ── Splash (logomarca animada ao abrir/atualizar o app) ───────────
function iniciarSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('splash-out');
    setTimeout(() => splash.remove(), 650);
  }, 1700);
}

// ── Chuva de moedas (animação de venda/compra) ────────────────────
function chuvaDeMoedas(qtd = 20) {
  const simbolos = ['🪙', '⭐', '🌟', '🪙'];
  for (let i = 0; i < qtd; i++) {
    const moeda = document.createElement('span');
    moeda.className = 'moeda-anim';
    moeda.textContent = simbolos[Math.floor(Math.random() * simbolos.length)];
    moeda.style.left = (Math.random() * 96) + 'vw';
    moeda.style.animationDelay = (Math.random() * 0.5) + 's';
    moeda.style.animationDuration = (1.2 + Math.random() * 1.2) + 's';
    moeda.style.fontSize = (1.2 + Math.random() * 1.5) + 'rem';
    document.body.appendChild(moeda);
    setTimeout(() => moeda.remove(), 3400);
  }
}

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
      iniciarGerente(); // já lida com barracaId salvo internamente
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
  ['gerente-logo-header','caixa-logo-header','cliente-logo-header','admin-logo-header','criar-pin-logo'].forEach(id => renderLogo(id, 'pequeno'));
}

// ═══════════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════════
function atualizarFormLogin() {
  const perfil = document.getElementById('login-perfil').value;
  document.getElementById('login-codigo-wrap').style.display = perfil === 'cliente' ? 'none' : 'block';
  document.getElementById('login-pin-wrap').style.display = 'none';
}

function mostrarTela(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

async function fazerLogin() {
  const perfil = document.getElementById('login-perfil').value;
  const nome   = document.getElementById('login-nome').value.trim();
  const codigo = document.getElementById('login-codigo').value.trim();

  if (!nome) { toast('Digite seu nome!', 'error'); return; }

  // Se o campo PIN já está visível e preenchido, finalizar login com PIN
  const pinWrap = document.getElementById('login-pin-wrap');
  const pinVal  = document.getElementById('login-pin').value.trim();
  if (perfil === 'cliente' && pinWrap.style.display === 'block' && pinVal.length === 4) {
    return fazerLoginComPin();
  }

  if (perfil !== 'cliente') {
    if (!codigo) { toast('Digite o código!', 'error'); return; }

    // Gerente: autenticação por código de barraca (servidor)
    if (perfil === 'gerente') {
      const res = await api('/api/auth/gerente', 'POST', { codigo });
      if (!res.ok) { toast(res.error || 'Código inválido!', 'error'); return; }
      estado.perfil = 'gerente';
      estado.barracaId = res.barraca.id;
      estado.gerenteBarraca = res.barraca;
      mostrarTela('screen-gerente');
      salvarSessao();
      await iniciarGerenteComBarraca(res.barraca);
      return;
    }

    // Caixa e Admin: senha validada no servidor
    const auth = await api('/api/auth/perfil', 'POST', { perfil, codigo });
    if (!auth.ok) { toast(auth.error || 'Código incorreto!', 'error'); return; }
    estado.perfil = perfil;
    mostrarTela('screen-' + perfil);
    salvarSessao();
    if (perfil === 'caixa')   iniciarCaixa();
    else if (perfil === 'admin')   iniciarAdmin();
    return;
  }

  // CLIENTE: buscar cliente existente
  const clientes = await api('/api/clientes?nome=' + encodeURIComponent(nome));
  if (!Array.isArray(clientes)) { toast('Servidor indisponível. Tente novamente.', 'error'); return; }
  const cliente = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase());

  if (!cliente) {
    // Cliente novo → vai para tela criar PIN
    window._novoClienteNome = nome;
    document.getElementById('criar-pin-nome').value = nome;
    mostrarTela('screen-criar-pin');
    return;
  }

  if (!cliente.pin_hash) {
    // Cliente sem PIN → vai para criar PIN
    window._clienteExistenteId = cliente.id;
    window._clienteExistenteCodigo = cliente.codigo;
    document.getElementById('criar-pin-nome').value = nome;
    document.getElementById('criar-pin-nome').readOnly = true;
    mostrarTela('screen-criar-pin');
    return;
  }

  // Cliente com PIN → mostra campo de senha
  document.getElementById('login-pin-wrap').style.display = 'block';
  document.getElementById('login-pin').dataset.clienteId = cliente.id;
  toast('Digite sua senha de 4 dígitos', '');
}

async function fazerLoginComPin() {
  const nome = document.getElementById('login-nome').value.trim();
  const pin  = document.getElementById('login-pin').value.trim();

  if (!pin || pin.length !== 4) { toast('Digite os 4 dígitos!', 'error'); return; }

  const res = await api('/api/clientes/login', 'POST', { nome, pin });
  if (res.error === 'sem_pin') {
    document.getElementById('login-pin-wrap').style.display = 'none';
    document.getElementById('login-pin').value = '';
    toast('Configure sua senha primeiro', 'error');
    return;
  }
  if (res.error) { toast(res.error, 'error'); return; }

  estado.perfil = 'cliente';
  estado.clienteId   = res.id;
  estado.clienteNome = res.nome;
  document.getElementById('cliente-nome-header').textContent = res.nome;
  document.getElementById('login-pin').value = '';
  document.getElementById('login-pin-wrap').style.display = 'none';
  mostrarTela('screen-cliente');
  salvarSessao();
  iniciarCliente();
}

async function confirmarCriarPin() {
  const nome    = document.getElementById('criar-pin-nome').value.trim();
  const pin     = document.getElementById('criar-pin-senha').value.trim();
  const confirma = document.getElementById('criar-pin-confirma').value.trim();

  if (!nome) { toast('Digite seu nome!', 'error'); return; }
  if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) { toast('Senha deve ter 4 dígitos numéricos!', 'error'); return; }
  if (pin !== confirma) { toast('As senhas não coincidem!', 'error'); return; }

  // já existia mas sem PIN
  if (window._clienteExistenteId) {
    const res = await api('/api/clientes/' + window._clienteExistenteId, 'PUT', { pin });
    if (!res.id) { toast(res.error || 'Erro!', 'error'); return; }
    estado.clienteId   = res.id;
    estado.clienteNome = res.nome;
    toast('Conta criada! Anote seu código: ' + res.codigo, 'success');
  } else {
    // novo cliente (auto-cadastro: registra como 'cliente', não 'caixa')
    const cliente = await api('/api/clientes', 'POST', { nome, pin, perfil: 'cliente', perfilNome: nome });
    if (!cliente.id) { toast(cliente.error || 'Erro ao criar conta!', 'error'); return; }
    estado.clienteId   = cliente.id;
    estado.clienteNome = cliente.nome;
    toast('Conta criada! Código: ' + cliente.codigo + ' — anote!', 'success');
  }

  window._clienteExistenteId = null;
  window._novoClienteNome = null;
  document.getElementById('criar-pin-nome').readOnly = false;
  document.getElementById('criar-pin-senha').value = '';
  document.getElementById('criar-pin-confirma').value = '';
  estado.perfil = 'cliente';
  mostrarTela('screen-cliente');
  document.getElementById('cliente-nome-header').textContent = estado.clienteNome;
  salvarSessao();
  iniciarCliente();
}

function voltarLogin() {
  document.getElementById('criar-pin-nome').readOnly = false;
  document.getElementById('criar-pin-senha').value = '';
  document.getElementById('criar-pin-confirma').value = '';
  mostrarTela('screen-login');
}

function mostrarRecuperarPin() {
  document.getElementById('recuperar-codigo').value = '';
  document.getElementById('recuperar-pin-msg').textContent = '';
  document.getElementById('modal-esqueci-pin').classList.remove('hidden');
}

function fecharModalRecuperarPin() {
  document.getElementById('modal-esqueci-pin').classList.add('hidden');
}

function solicitarRecuperacaoPin() {
  // avisa para procurar o admin
  document.getElementById('recuperar-pin-msg').innerHTML =
    '<span style="color:#E8458C;"> peça ao admin para redefinir sua senha na aba Clientes.</span>';
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

async function confirmarAdmin() {
  const codigo = document.getElementById('admin-codigo-input').value.trim();
  const auth = await api('/api/auth/perfil', 'POST', { perfil: 'admin', codigo });
  if (!auth.ok) { toast(auth.error || 'Código incorreto!', 'error'); return; }
  fecharModalAdmin();
  estado.perfil = 'admin';
  mostrarTela('screen-admin');
  salvarSessao();
  iniciarAdmin();
}

function logout() {
  clearPolls();
  if (estado.scanner) { try { estado.scanner.stop(); } catch {} estado.scanner = null; }
  estado = { perfil:null, clienteId:null, clienteNome:null, barracaId:null, carrinho:[], qrAtualId:null, scanner:null, qrPollTimer:null, clientePollTimer:null, caixaClienteId:null, pendingQrPayload:null, clienteCarrinho:[], clienteBarracaAtual:null, pedidosPollTimer:null, gerentePedidosTimer:null, _clienteProdutosEstoque:{} };
  document.getElementById('login-nome').value = '';
  document.getElementById('login-codigo').value = '';
  document.getElementById('login-pin').value = '';
  document.getElementById('login-pin-wrap').style.display = 'none';
  document.getElementById('criar-pin-nome').readOnly = false;
  document.getElementById('criar-pin-senha').value = '';
  document.getElementById('criar-pin-confirma').value = '';
  window._clienteExistenteId = null;
  window._novoClienteNome = null;
  mostrarTela('screen-login');
  limparSessao();
}

// ═══════════════════════════════════════════════════════════════════
//  GERENTE
// ═══════════════════════════════════════════════════════════════════
async function iniciarGerente() {
  // Compatibilidade com sessão salva (restaura pelo barracaId)
  if (estado.barracaId) {
    const b = await api('/api/barracas/' + estado.barracaId);
    if (b && b.id) { await iniciarGerenteComBarraca(b); return; }
  }
  // Fallback: seletor manual (não deveria acontecer no novo fluxo)
  const barracas = await api('/api/barracas');
  const sel = document.getElementById('gerente-barraca-sel');
  sel.innerHTML = '<option value="">Selecione a barraca...</option>';
  if (Array.isArray(barracas)) barracas.forEach(b => {
    sel.innerHTML += `<option value="${b.id}">${b.emoji} ${b.nome}</option>`;
  });
}

async function iniciarGerenteComBarraca(barraca) {
  estado.barracaId = barraca.id;
  // Preenche o seletor (caso esteja visível) e esconde ele
  const sel = document.getElementById('gerente-barraca-sel');
  sel.innerHTML = `<option value="${barraca.id}" selected>${barraca.emoji} ${barraca.nome}</option>`;
  document.getElementById('gerente-sel-barraca').style.display = 'none';
  document.getElementById('gerente-painel').style.display = 'block';
  document.getElementById('gerente-barraca-titulo').textContent = `${barraca.emoji} ${barraca.nome}`;
  document.getElementById('gerente-barraca-nome').textContent = `${barraca.emoji} ${barraca.nome}`;
  // Preenche campos de edição
  document.getElementById('gerente-edit-emoji').value = barraca.emoji || '';
  document.getElementById('gerente-edit-nome').value = barraca.nome || '';
  estado.carrinho = [];
  renderCarrinho();
  await renderProdutos(barraca.id);
  gerenteCarregarPedidos();
  if (estado.gerentePedidosTimer) clearInterval(estado.gerentePedidosTimer);
  if (Notification.permission === 'default') Notification.requestPermission();
  estado.gerentePedidosTimer = setInterval(() => { gerenteCarregarPedidos(); }, 6000);
  salvarSessao();
  setTimeout(restaurarTabGerente, 0);
}

async function selecionarBarraca() {
  // Fallback manual — no novo fluxo o gerente entra direto pelo código
  const sel = document.getElementById('gerente-barraca-sel');
  if (!sel.value) { document.getElementById('gerente-painel').style.display='none'; return; }
  const info = await api('/api/barracas/' + sel.value);
  if (info && info.id) await iniciarGerenteComBarraca(info);
}

// ── GERENTE: EDITAR BARRACA ────────────────────────────────────
async function salvarInfoBarraca() {
  const emoji = document.getElementById('gerente-edit-emoji').value.trim();
  const nome = document.getElementById('gerente-edit-nome').value.trim();
  if (!nome) { toast('Nome obrigatório!', 'error'); return; }
  const res = await api('/api/barracas/' + estado.barracaId, 'PUT', { nome, emoji });
  if (res.id) {
    toast('Barraca atualizada!', 'success');
    // atualiza título e seletor
    document.getElementById('gerente-barraca-titulo').textContent = (emoji || '🏪') + ' ' + nome;
    document.getElementById('gerente-barraca-nome').textContent = (emoji || '🏪') + ' ' + nome;
    const sel = document.getElementById('gerente-barraca-sel');
    sel.options[sel.selectedIndex].text = (emoji || '🏪') + ' ' + nome;
    document.getElementById('gerente-edit-emoji').value = emoji;
    document.getElementById('gerente-edit-nome').value = nome;
  } else { toast(res.error || 'Erro!', 'error'); }
}

// ── GERENTE: GERENCIAR PRODUTOS ────────────────────────────────
const _draftKey = id => 'draft_prod_' + id;
const _draftTimers = {};

function _salvarRascunho(id) {
  const nome    = document.getElementById('ger-prod-nome-'    + id)?.value;
  const preco   = document.getElementById('ger-prod-preco-'   + id)?.value;
  const estoque = document.getElementById('ger-prod-estoque-' + id)?.value;
  if (nome !== undefined) localStorage.setItem(_draftKey(id), JSON.stringify({ nome, preco, estoque }));
  _mostrarIndicadorRascunho(id, true);
}

function _agendarRascunho(id) {
  clearTimeout(_draftTimers[id]);
  _draftTimers[id] = setTimeout(() => _salvarRascunho(id), 600);
}

function _limparRascunho(id) {
  localStorage.removeItem(_draftKey(id));
  _mostrarIndicadorRascunho(id, false);
}

function _mostrarIndicadorRascunho(id, tem) {
  const el = document.getElementById('ger-draft-' + id);
  if (el) { el.style.display = tem ? 'inline' : 'none'; }
}

async function gerenteCarregarProdutos() {
  if (!estado.barracaId) return;
  const produtos = await api('/api/barracas/' + estado.barracaId + '/produtos');
  const lista = Array.isArray(produtos) ? produtos : [];
  const cont = document.getElementById('gerente-produtos-lista');
  if (!lista.length) {
    cont.innerHTML = '<p style="color:#3A6EC8;text-align:center;padding:12px;">Nenhum produto cadastrado</p>';
    return;
  }
  cont.innerHTML = lista.map(p => {
    const draft = (() => { try { return JSON.parse(localStorage.getItem(_draftKey(p.id)) || 'null'); } catch { return null; } })();
    const nome    = draft?.nome    ?? p.nome;
    const preco   = draft?.preco   ?? p.preco;
    const estoque = draft?.estoque ?? (p.estoque ?? -1);
    const temDraft = !!draft;
    return `
    <div class="produto-linha">
      <div style="position:relative;flex:2;min-width:120px;">
        <input type="text" id="ger-prod-nome-${p.id}" value="${nome}" class="form-control${temDraft ? ' input-rascunho' : ''}" style="font-size:0.95rem;width:100%;"
          oninput="_agendarRascunho('${p.id}')" />
        <span id="ger-draft-${p.id}" title="Rascunho não salvo" style="display:${temDraft?'inline':'none'};position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:0.75rem;color:#E8458C;font-weight:700;">●</span>
      </div>
      <div class="prod-campo" style="flex:1;min-width:80px;">
        <span class="prod-campo-label">Preço 🌟</span>
        <input type="number" id="ger-prod-preco-${p.id}" value="${preco}" class="form-control${temDraft ? ' input-rascunho' : ''}" style="width:100%;font-size:0.95rem;" step="0.5" min="1"
          oninput="_agendarRascunho('${p.id}')" />
      </div>
      <div class="prod-campo" style="flex:1;min-width:70px;">
        <span class="prod-campo-label">Estoque</span>
        <input type="number" id="ger-prod-estoque-${p.id}" value="${estoque}" class="form-control${temDraft ? ' input-rascunho' : ''}" style="width:100%;font-size:0.95rem;" placeholder="-1" title="Estoque (-1 = ilimitado)"
          oninput="_agendarRascunho('${p.id}')" />
      </div>
      <button class="btn btn-primary btn-sm" style="width:auto;padding:8px 12px;" onclick="gerenteSalvarProduto('${p.id}')">💾</button>
      <button class="btn btn-danger btn-sm" style="width:auto;padding:8px 12px;" onclick="gerenteDeletarProduto('${p.id}')">🗑️</button>
    </div>
  `}).join('');
}

async function gerenteAdicionarProduto() {
  const nome = document.getElementById('gerente-novo-produto-nome').value.trim();
  const preco = parseFloat(document.getElementById('gerente-novo-produto-preco').value);
  const estoque = parseInt(document.getElementById('gerente-novo-produto-estoque').value) || -1;
  if (!nome) { toast('Nome obrigatório!', 'error'); return; }
  if (!preco || preco <= 0) { toast('Preço inválido!', 'error'); return; }
  const res = await api('/api/barracas/' + estado.barracaId + '/produtos', 'POST', { nome, preco, estoque });
  if (res.id) {
    toast('Produto adicionado!', 'success');
    document.getElementById('gerente-novo-produto-nome').value = '';
    document.getElementById('gerente-novo-produto-preco').value = '';
    document.getElementById('gerente-novo-produto-estoque').value = '';
    await gerenteCarregarProdutos();
  } else { toast(res.error || 'Erro!', 'error'); }
}

async function gerenteSalvarProduto(id) {
  const nome = document.getElementById('ger-prod-nome-' + id).value.trim();
  const preco = parseFloat(document.getElementById('ger-prod-preco-' + id).value);
  const estoque = parseInt(document.getElementById('ger-prod-estoque-' + id).value);
  if (!nome || !preco) { toast('Dados inválidos!', 'error'); return; }
  const res = await api('/api/produtos/' + id, 'PUT', { nome, preco, estoque, barraca_id: estado.barracaId });
  if (res.id) { _limparRascunho(id); toast('Produto atualizado!', 'success'); await gerenteCarregarProdutos(); }
  else { toast(res.error || 'Erro!', 'error'); }
}

async function gerenteDeletarProduto(id) {
  if (!confirm('Remover este produto?')) return;
  const res = await api('/api/produtos/' + id, 'DELETE');
  if (res.ok) { _limparRascunho(id); toast('Produto removido!', 'success'); gerenteCarregarProdutos(); }
  else { toast(res.error || 'Erro!', 'error'); }
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
  grid.innerHTML = lista.map((p, i) => {
    const semEstoque = p.estoque !== undefined && p.estoque !== null && p.estoque !== -1 && p.estoque <= 0;
    const estoqueLabel = p.estoque === -1 || p.estoque === null || p.estoque === undefined
      ? '' : semEstoque
        ? `<div class="estoque-badge estoque-zero">Esgotado</div>`
        : `<div class="estoque-badge estoque-ok">${p.estoque} em estoque</div>`;
    return `
      <div class="produto-card${semEstoque ? ' produto-esgotado' : ''}">
        <div class="produto-nome">${p.nome}</div>
        <div class="produto-preco">${p.preco} 🌟</div>
        ${estoqueLabel}
        <div class="produto-qty-row">
          <button class="qty-btn" onclick="alterarQty(${i},-1)" ${semEstoque ? 'disabled' : ''}>−</button>
          <span class="qty-num" id="qty-${i}">0</span>
          <button class="qty-btn" id="qty-btn-mais-${i}" onclick="alterarQty(${i},1)" ${semEstoque ? 'disabled' : ''}>+</button>
        </div>
      </div>
    `;
  }).join('');
  estado.carrinho = lista.map(p => ({ id: p.id, nome: p.nome, preco: parseFloat(p.preco), qty: 0, estoque: p.estoque ?? -1 }));
}

function alterarQty(idx, delta) {
  const item = estado.carrinho[idx];
  if (!item) return;
  const novaQty = Math.max(0, (item.qty || 0) + delta);
  // Bloqueia se estoque definido e qty tentaria ultrapassar
  if (delta > 0 && item.estoque !== -1 && item.estoque !== null && novaQty > item.estoque) {
    toast(`Estoque insuficiente! Apenas ${item.estoque} disponível.`, 'error');
    return;
  }
  item.qty = novaQty;
  document.getElementById('qty-' + idx).textContent = item.qty;
  // Desabilita botão + se atingiu o limite
  const btnMais = document.getElementById('qty-btn-mais-' + idx);
  if (btnMais && item.estoque !== -1 && item.estoque !== null) {
    btnMais.disabled = item.qty >= item.estoque;
  }
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
    itens: itens.map(i => ({ id: i.id, nome: i.nome, preco: i.preco, qty: i.qty }))
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
      chuvaDeMoedas();
      toast('✅ Venda confirmada! ' + total + ' Alegrias', 'success');
      estado.carrinho.forEach(i => i.qty = 0);
      document.querySelectorAll('.qty-num').forEach(el => el.textContent = '0');
      renderCarrinho();
    }
  }, 3000);
}

// ── GERENTE: VENDA EM ESPÉCIE (Alegrias físicas) ──────────────────
function abrirVendaEspecie() {
  const itens = estado.carrinho.filter(i => i.qty > 0);
  if (!itens.length) { toast('Adicione itens ao carrinho!', 'error'); return; }
  if (!estado.barracaId) { toast('Selecione a barraca!', 'error'); return; }
  const total = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  document.getElementById('venda-especie-itens').innerHTML = itens.map(i => `
    <div class="carrinho-item"><span>${i.qty}x ${i.nome}</span><span>${i.preco * i.qty} 🌟</span></div>
  `).join('');
  document.getElementById('venda-especie-total').textContent = `Total: ${total} Alegrias 🌟`;
  document.getElementById('especie-pagamento').value = total;
  document.getElementById('especie-troco-box').style.display = 'none';
  document.getElementById('especie-troco-falta').style.display = 'none';
  // Reseta cliente da venda (identificação é opcional)
  estado.especieClienteId = null;
  estado.especieClienteNome = null;
  renderEspecieCliente();
  document.getElementById('especie-busca-painel').style.display = 'none';
  document.getElementById('especie-busca').value = '';
  document.getElementById('especie-busca-resultados').innerHTML = '';
  document.getElementById('modal-venda-especie').classList.remove('hidden');
  calcularTroco();
}

// ── Cliente da venda em espécie (opcional) ────────────────────────
function renderEspecieCliente() {
  const box = document.getElementById('especie-cliente-info');
  if (!box) return;
  if (estado.especieClienteId) {
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div style="text-align:left;min-width:0;">
          <div style="font-weight:700;color:#1E3A6E;font-size:0.95rem;">👤 ${estado.especieClienteNome}</div>
          <div style="font-size:0.78rem;color:#16a34a;">Vai aparecer no app do cliente</div>
        </div>
        <button class="btn btn-outline btn-sm" style="width:auto;padding:6px 10px;font-size:0.8rem;" onclick="removerEspecieCliente()">Remover</button>
      </div>`;
  } else {
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div style="text-align:left;color:#3A6EC8;font-size:0.9rem;">🪙 Sem cliente (anônimo)</div>
        <button class="btn btn-primary btn-sm" style="width:auto;padding:6px 12px;font-size:0.82rem;" onclick="abrirBuscaEspecie()">Identificar</button>
      </div>`;
  }
}

function abrirBuscaEspecie() {
  const p = document.getElementById('especie-busca-painel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
  if (p.style.display === 'block') document.getElementById('especie-busca').focus();
}

function removerEspecieCliente() {
  estado.especieClienteId = null;
  estado.especieClienteNome = null;
  renderEspecieCliente();
}

async function buscarClienteEspecie() {
  const nome = document.getElementById('especie-busca').value.trim();
  if (!nome) { toast('Digite um nome!', 'error'); return; }
  const lista = await api('/api/clientes?nome=' + encodeURIComponent(nome));
  renderResultadosEspecie(lista);
}

async function verTodosClientesEspecie() {
  document.getElementById('especie-busca').value = '';
  const lista = await api('/api/clientes');
  renderResultadosEspecie(lista);
}

function renderResultadosEspecie(lista) {
  const cont = document.getElementById('especie-busca-resultados');
  if (!Array.isArray(lista) || !lista.length) {
    cont.innerHTML = '<p style="color:#dc2626;font-size:0.85rem;padding:6px;">Nenhum cliente encontrado.</p>';
    return;
  }
  cont.innerHTML = lista.slice(0, 30).map(c => `
    <div style="cursor:pointer;padding:9px 10px;margin-bottom:6px;border:1px solid #d6e0f5;border-radius:8px;background:#fafbff;display:flex;justify-content:space-between;align-items:center;"
         onclick="selecionarClienteEspecie('${c.id}','${(c.nome || '').replace(/'/g, "\\'")}')">
      <span style="color:#1E3A6E;font-weight:600;font-size:0.9rem;">${c.nome}</span>
      <span style="color:#3A6EC8;font-size:0.78rem;">Cód: ${c.codigo}</span>
    </div>
  `).join('');
}

function selecionarClienteEspecie(id, nome) {
  estado.especieClienteId = id;
  estado.especieClienteNome = nome;
  document.getElementById('especie-busca-painel').style.display = 'none';
  document.getElementById('especie-busca').value = '';
  document.getElementById('especie-busca-resultados').innerHTML = '';
  renderEspecieCliente();
}

async function criarClienteEspecie() {
  const nome = document.getElementById('especie-busca').value.trim();
  if (!nome) { toast('Digite o nome do novo cliente!', 'error'); return; }
  const c = await api('/api/clientes', 'POST', { nome, perfil: 'gerente', perfilNome: estado.gerenteBarraca?.nome || 'Gerente' });
  if (c && c.id) {
    toast(`✅ ${c.nome} cadastrado!`, 'success');
    selecionarClienteEspecie(c.id, c.nome);
  } else {
    toast(c.error || 'Erro ao cadastrar!', 'error');
  }
}

// ── Scanner QR de cliente (venda em espécie) ──────────────────────
let _scannerEspecie = null;
function abrirScannerEspecie() {
  document.getElementById('reader-especie').innerHTML = '';
  document.getElementById('modal-scanner-especie').classList.remove('hidden');
  _scannerEspecie = new Html5Qrcode('reader-especie');
  _scannerEspecie.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    (decodedText) => {
      try {
        const payload = JSON.parse(decodedText);
        if (payload.tipo === 'cliente' && payload.id) {
          fecharScannerEspecie();
          selecionarClienteEspecie(payload.id, payload.nome || 'Cliente');
          toast(`✅ Cliente ${payload.nome || ''} identificado!`, 'success');
        }
      } catch {}
    },
    () => {}
  ).catch(() => { fecharScannerEspecie(); toast('Câmera indisponível', 'error'); });
}

function fecharScannerEspecie() {
  document.getElementById('modal-scanner-especie').classList.add('hidden');
  if (_scannerEspecie) { _scannerEspecie.stop().catch(() => {}); _scannerEspecie = null; }
}

function calcularTroco() {
  const itens = estado.carrinho.filter(i => i.qty > 0);
  const total = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  const pagamento = parseInt(document.getElementById('especie-pagamento').value) || 0;
  const troco = pagamento - total;
  const trocoBox  = document.getElementById('especie-troco-box');
  const faltaBox  = document.getElementById('especie-troco-falta');
  const btnConf   = document.getElementById('btn-confirmar-especie');

  trocoBox.style.display  = 'none';
  faltaBox.style.display  = 'none';

  if (pagamento > 0 && troco > 0) {
    document.getElementById('especie-troco-valor').textContent = `${troco} 🌟`;
    trocoBox.style.display = 'block';
    btnConf.disabled = false;
  } else if (pagamento > 0 && troco < 0) {
    faltaBox.textContent = `Faltam ${Math.abs(troco)} Alegrias para completar o pagamento`;
    faltaBox.style.display = 'block';
    btnConf.disabled = true;
  } else if (pagamento === total) {
    btnConf.disabled = false;
  } else {
    btnConf.disabled = pagamento === 0;
  }
}

function fecharModalVendaEspecie() {
  document.getElementById('modal-venda-especie').classList.add('hidden');
}

async function confirmarVendaEspecie() {
  const itens = estado.carrinho.filter(i => i.qty > 0);
  if (!itens.length) { fecharModalVendaEspecie(); return; }
  const total    = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  const pagamento = parseInt(document.getElementById('especie-pagamento').value) || total;
  const troco    = pagamento - total;

  const res = await api('/api/vendas/especie', 'POST', {
    barraca_id: estado.barracaId,
    itens: itens.map(i => ({ id: i.id, nome: i.nome, preco: i.preco, qty: i.qty })),
    pagamento,
    cliente_id: estado.especieClienteId || null
  });
  if (res.ok) {
    fecharModalVendaEspecie();
    chuvaDeMoedas();
    const trocoMsg = troco > 0 ? ` · Troco: ${troco} 🌟` : '';
    toast(`✅ Venda registrada! ${res.valor} Alegrias${trocoMsg}`, 'success');
    estado.carrinho.forEach(i => i.qty = 0);
    renderCarrinho();
    await renderProdutos(estado.barracaId);
  } else {
    toast(res.error || 'Erro ao registrar venda!', 'error');
  }
}

function fecharModalQR() {
  clearInterval(estado.qrPollTimer);
  document.getElementById('modal-qr').classList.add('hidden');
}

function abrirTab(ev, tab) {
  document.querySelectorAll('#screen-gerente .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-gerente .tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  ev.currentTarget.classList.add('active');
  localStorage.setItem('tab_gerente', tab);
  if (tab === 'relatorio') carregarRelatorioBarraca();
  if (tab === 'gerenciar') gerenteCarregarProdutos();
  if (tab === 'pedidos') gerenteCarregarPedidos();
  if (tab === 'historico') gerenteCarregarHistorico();
}

function restaurarTabGerente() {
  const tab = localStorage.getItem('tab_gerente') || 'vender';
  document.querySelectorAll('#screen-gerente .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-gerente .tab-content').forEach(c => c.classList.remove('active'));
  const tabEl = document.getElementById('tab-' + tab);
  const btn = document.querySelector(`#screen-gerente .tab-btn[onclick*="'${tab}'"]`);
  if (tabEl) tabEl.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'relatorio') carregarRelatorioBarraca();
  else if (tab === 'gerenciar') gerenteCarregarProdutos();
  else if (tab === 'pedidos') gerenteCarregarPedidos();
  else if (tab === 'historico') gerenteCarregarHistorico();
}

let _ultimosPedidosIds = new Set();

async function gerenteCarregarPedidos() {
  if (!estado.barracaId) return;
  const pedidos = await api('/api/pedidos/pendentes/' + estado.barracaId);
  const cont = document.getElementById('gerente-pedidos-lista');

  // ── Badge na aba ──────────────────────────────────────────────
  const badge = document.getElementById('badge-pedidos');
  if (badge) {
    if (Array.isArray(pedidos) && pedidos.length > 0) {
      badge.textContent = pedidos.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Notificação de novo pedido ────────────────────────────────
  if (Array.isArray(pedidos) && pedidos.length > 0) {
    const novos = pedidos.filter(p => !_ultimosPedidosIds.has(p.id));
    if (novos.length > 0 && _ultimosPedidosIds.size > 0) {
      // Há pedidos que não existiam antes → notificar
      novos.forEach(p => {
        let itens = [];
        try { itens = JSON.parse(p.itens || '[]'); } catch {}
        const nomeCliente = p.clientes?.nome || 'Cliente';
        const resumo = itens.map(i => `${i.qty}x ${i.nome}`).join(', ');
        toast(`🔔 Novo pedido de ${nomeCliente}: ${resumo}`, 'success');
        // Notificação do sistema se permitida
        if (Notification.permission === 'granted') {
          new Notification('🔔 Novo pedido!', { body: `${nomeCliente}: ${resumo}`, icon: '/favicon.ico' });
        }
      });
      // Piscar a aba de Pedidos
      const abaPedidos = document.querySelector(`#screen-gerente .tab-btn[onclick*="'pedidos'"]`);
      if (abaPedidos) {
        abaPedidos.style.animation = 'none';
        setTimeout(() => { abaPedidos.style.animation = 'abaPiscar 2.4s ease-in-out'; }, 10);
        setTimeout(() => { abaPedidos.style.animation = ''; }, 2450);
      }
    }
    _ultimosPedidosIds = new Set(pedidos.map(p => p.id));
  } else {
    _ultimosPedidosIds = new Set();
  }

  if (!Array.isArray(pedidos) || !pedidos.length) {
    cont.innerHTML = '<p style="color:#16a34a;text-align:center;padding:16px;">🎉 Nenhum pedido pendente! Aproveite!</p>';
    return;
  }

  const agora = Date.now();
  const esperas = pedidos.map(p => Math.max(0, Math.floor((agora - new Date(p.criado_em)) / 60000)));
  const tempoMedio = Math.round(esperas.reduce((s, v) => s + v, 0) / esperas.length);
  const mediaCor = tempoMedio >= 15 ? '#dc2626' : tempoMedio >= 8 ? '#ea580c' : '#3A6EC8';

  cont.innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
      <div style="font-weight:700;color:#E8458C;font-size:1rem;">🕐 ${pedidos.length} pedido(s) em espera</div>
      <div style="font-size:0.82rem;color:${mediaCor};font-weight:600;">
        Espera média: ${tempoMedio}min
      </div>
    </div>` +
    pedidos.map((p, idx) => {
      let itens = [];
      try { itens = JSON.parse(p.itens || '[]'); } catch {}
      const waitMin = esperas[idx];
      const urgClass = waitMin >= 20 ? 'pedido-urgente' : waitMin >= 10 ? 'pedido-alerta' : waitMin >= 5 ? 'pedido-aviso' : '';
      const waitLabel = waitMin < 1 ? 'agora' : `${waitMin}min`;
      const waitCor = waitMin >= 20 ? '#dc2626' : waitMin >= 10 ? '#ea580c' : waitMin >= 5 ? '#d97706' : '#16a34a';
      const especie = itens.some(i => i && i._forma === 'especie');
      const nomeHeader = especie
        ? (p.clientes ? '🪙 ' + p.clientes.nome : '🪙 Espécie')
        : (p.clientes ? p.clientes.nome : 'Cliente');
      return `
        <div class="pedido-card ${urgClass}">
          <div class="pedido-header">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;color:#1E3A6E;font-size:1rem;">${nomeHeader}</div>
              <div style="font-size:0.82rem;color:#3A6EC8;">${formatarHora(p.criado_em)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:1.1rem;font-weight:700;color:${waitCor};white-space:nowrap;">⏱ ${waitLabel}</div>
              <div style="font-size:1rem;font-weight:700;color:#C8A020;">${p.valor_total ?? '?'} 🌟</div>
            </div>
          </div>
          <div class="pedido-itens">${itens.map(i => `<span class="pedido-item-tag">${i.qty}x ${i.nome}</span>`).join('')}</div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-success btn-sm" style="flex:2;" onclick="gerenteConfirmarPedido('${p.id}')">✅ Confirmar</button>
            <button class="btn btn-danger btn-sm" style="flex:1;" onclick="gerenteCancelarPedido('${p.id}','${(p.clientes?.nome||'Espécie').replace(/'/g,"\\'")}')">✖</button>
          </div>
        </div>
      `;
    }).join('');
}

async function gerenteCancelarPedido(pedidoId, nomeCliente) {
  const motivo = prompt(`Cancelar pedido de ${nomeCliente}?\n\nMotivo (opcional):`);
  if (motivo === null) return; // clicou Cancelar no prompt
  const res = await api('/api/pedidos/' + pedidoId + '/cancelar', 'POST', { motivo });
  if (res.ok) {
    toast(`❌ Pedido cancelado. Alegrias estornadas para ${nomeCliente}.`, 'success');
    gerenteCarregarPedidos();
  } else {
    toast(res.error || 'Erro ao cancelar pedido!', 'error');
  }
}

async function gerenteConfirmarPedido(pedidoId) {
  const res = await api('/api/pedidos/' + pedidoId + '/confirmar', 'POST');
  if (res.ok) {
    toast('✅ Pedido confirmado! O cliente pode retirar.', 'success');
    gerenteCarregarPedidos();
    carregarRelatorioBarraca();
  } else {
    toast(res.error || 'Erro ao confirmar pedido!', 'error');
  }
}

async function gerenteCarregarHistorico() {
  if (!estado.barracaId) return;
  const cont = document.getElementById('gerente-historico-lista');
  cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Carregando...</p>';
  const pedidos = await api('/api/pedidos/historico/' + estado.barracaId);
  if (!Array.isArray(pedidos) || !pedidos.length) {
    cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Nenhum pedido ainda</p>';
    return;
  }
  const statusLabel = { pendente: '🕐 Aguardando', confirmado: '✅ Entregue', cancelado: '❌ Cancelado' };
  const statusCor   = { pendente: '#E8458C', confirmado: '#16a34a' };
  cont.innerHTML = pedidos.map(p => {
    let itens = [];
    try { itens = JSON.parse(p.itens || '[]'); } catch {}
    const cor = statusCor[p.status] || '#3A6EC8';
    const isEspecie = itens.some(i => i._forma === 'especie') || !p.cliente_id;
    const troco = isEspecie ? (itens[0]?._troco ?? 0) : 0;
    const nomeCliente = isEspecie
      ? (p.clientes?.nome ? '🪙 ' + p.clientes.nome : '🪙 Espécie')
      : (p.clientes?.nome || 'Cliente');
    const extraInfo = isEspecie && troco > 0
      ? `<div style="font-size:0.8rem;color:#16a34a;font-weight:600;">Troco devolvido: ${troco} 🌟</div>`
      : isEspecie ? '' : '';
    return `
      <div style="border-left:4px solid ${cor};padding:10px 12px;margin-bottom:8px;background:#fafbff;border-radius:0 8px 8px 0;">
        <div style="display:flex;justify-content:space-between;align-items:start;">
          <div>
            <div style="font-weight:700;color:#1E3A6E;">${nomeCliente}</div>
            <div style="font-size:0.8rem;color:${cor};font-weight:600;">${statusLabel[p.status] || p.status}</div>
            ${extraInfo}
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;color:#C8A020;">${p.valor_total ?? '?'} 🌟</div>
            <div style="font-size:0.75rem;color:#3A6EC8;">${formatarHora(p.criado_em)}</div>
          </div>
        </div>
        <div style="margin-top:4px;font-size:0.83rem;color:#3A6EC8;">${itens.filter(i => i.nome).map(i => `${i.qty}x ${i.nome}`).join(' · ')}</div>
      </div>`;
  }).join('');
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
        <div class="hist-barraca">${v.clientes ? v.clientes.nome : '🪙 Venda em espécie'}</div>
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
    chuvaDeMoedas();
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
  clienteCarregarCardapio();
  carregarPedidosCliente();
  estado.clientePollTimer = setInterval(() => {
    carregarSaldoCliente();
    carregarHistoricoCliente();
  }, 5000);
  if (!estado.pedidosPollTimer) {
    estado.pedidosPollTimer = setInterval(carregarPedidosCliente, 8000);
  }
  setTimeout(restaurarTabCliente, 0);
}

async function carregarSaldoCliente() {
  if (!estado.clienteId) return;
  const c = await api('/api/clientes/' + estado.clienteId);
  if (c && c.saldo !== undefined) {
    document.getElementById('cliente-saldo').textContent = c.saldo;
  }
}

async function carregarHistoricoCliente() {
  if (!estado.clienteId) return;
  const txRaw = await api('/api/transacoes?cliente_id=' + estado.clienteId + '&tipo=venda&limit=20');
  const cont = document.getElementById('cliente-historico');
  // Remove vendas em espécie: elas têm um pedido próprio e já aparecem na aba
  // "Pedidos" com status de entrega. Mostrá-las aqui (como débito de saldo)
  // seria duplicado e enganoso, pois foram pagas em dinheiro.
  const tx = (Array.isArray(txRaw) ? txRaw : []).filter(t => {
    if (t.forma === 'especie') return false;
    try { return !JSON.parse(t.itens || '[]').some(i => i && i._forma === 'especie'); } catch { return true; }
  });
  if (!tx.length) {
    cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Nenhuma compra ainda</p>';
    return;
  }
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

// ── Cliente: Cardápio ─────────────────────────────────────────────
async function clienteCarregarCardapio() {
  const cardapio = await api('/api/cardapio');
  const cont = document.getElementById('cliente-barracas-lista');
  console.log('[CARDÁPIO] resposta:', JSON.stringify(cardapio).substring(0, 200));
  if (!Array.isArray(cardapio) || !cardapio.length) {
    cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Nenhuma barraca disponível</p>';
    return;
  }
  cont.innerHTML = cardapio.map(b => {
    const temProdutos = b.produtos && b.produtos.length > 0;
    const n = b.num_pendentes || 0;
    const m = b.espera_media_min || 0;
    let esperaHtml = '';
    if (temProdutos) {
      if (n === 0) {
        esperaHtml = '<span style="font-size:0.78rem;color:#16a34a;font-weight:600;">🟢 Tranquilo</span>';
      } else if (m < 5) {
        esperaHtml = `<span style="font-size:0.78rem;color:#16a34a;font-weight:600;">⏱ ~${m}min</span>`;
      } else if (m < 15) {
        esperaHtml = `<span style="font-size:0.78rem;color:#d97706;font-weight:600;">⏱ ~${m}min</span>`;
      } else {
        esperaHtml = `<span style="font-size:0.78rem;color:#dc2626;font-weight:600;">⏱ ~${m}min</span>`;
      }
    }
    return `
      <div class="barraca-item" onclick="${temProdutos ? 'clienteAbrirBarraca(\'' + b.id + '\',\'' + b.nome.replace(/'/g, '\\\'') + '\',\'' + b.emoji + '\')' : ''}" style="${temProdutos ? 'cursor:pointer;' : 'opacity:0.5;'}">
        <span style="font-size:1.8rem;">${b.emoji}</span>
        <div style="flex:1;margin-left:10px;">
          <div style="font-weight:700;color:#1E3A6E;font-size:1rem;">${b.nome}</div>
          <div style="font-size:0.82rem;color:#3A6EC8;margin-bottom:2px;">${b.produtos ? b.produtos.length : 0} itens</div>
          ${esperaHtml}
        </div>
        ${temProdutos ? '<span style="font-size:1.2rem;">→</span>' : '<span style="font-size:0.8rem;color:#9aaccc;">Sem produtos</span>'}
      </div>
    `;
  }).join('');
}

function clienteAbrirBarraca(barracaId, nome, emoji) {
  estado.clienteBarracaAtual = { id: barracaId, nome, emoji };
  estado.clienteCarrinho = [];
  document.getElementById('cliente-cardapio-emoji').textContent = emoji;
  document.getElementById('cliente-cardapio-nome').textContent = nome;
  document.getElementById('cliente-cardapio-barraca').style.display = 'block';
  document.getElementById('cliente-barracas-lista').parentElement.style.display = 'none';
  clienteCarregarProdutos(barracaId);
}

function clienteVoltarBarracas() {
  estado.clienteBarracaAtual = null;
  estado.clienteCarrinho = [];
  document.getElementById('cliente-cardapio-barraca').style.display = 'none';
  document.getElementById('cliente-barracas-lista').parentElement.style.display = 'block';
}

async function clienteCarregarProdutos(barracaId) {
  const produtos = await api('/api/barracas/' + barracaId + '/produtos');
  const lista = Array.isArray(produtos) ? produtos : [];
  const cont = document.getElementById('cliente-produtos-lista');
  if (!lista.length) {
    cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Esta barraca ainda não tem produtos.</p>';
    return;
  }
  // Guarda estoque por produto para validação no alterarQty
  estado._clienteProdutosEstoque = {};
  lista.forEach(p => { estado._clienteProdutosEstoque[p.nome + '_' + barracaId] = p.estoque ?? -1; });

  cont.innerHTML = lista.map(p => {
    const item = estado.clienteCarrinho.find(i => i.nome === p.nome && i.barraca_id === barracaId);
    const qty = item ? item.qty : 0;
    const semEstoque = p.estoque !== undefined && p.estoque !== null && p.estoque !== -1 && p.estoque <= 0;
    const estoqueLabel = (p.estoque === -1 || p.estoque === null || p.estoque === undefined) ? ''
      : semEstoque
        ? `<div class="estoque-badge estoque-zero" style="margin-top:2px;">Esgotado</div>`
        : `<div class="estoque-badge estoque-ok" style="margin-top:2px;">${p.estoque} disponíveis</div>`;
    const nomeId = p.nome.replace(/\s/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
    return `
      <div class="cliente-produto-item${semEstoque ? ' produto-esgotado' : ''}">
        <div>
          <div class="cliente-produto-nome">${p.nome}</div>
          ${estoqueLabel}
        </div>
        <div class="cliente-produto-preco">${p.preco} 🌟</div>
        <div class="cliente-produto-qty">
          <button class="qty-btn" onclick="clienteAlterarQty('${p.nome.replace(/'/g,"\\'")}',${p.preco},-1,'${barracaId}','${p.id}')" ${semEstoque ? 'disabled' : ''}>−</button>
          <span class="qty-num" id="cliente-qty-${nomeId}">${qty}</span>
          <button class="qty-btn" id="cliente-qty-mais-${nomeId}" onclick="clienteAlterarQty('${p.nome.replace(/'/g,"\\'")}',${p.preco},1,'${barracaId}','${p.id}')" ${semEstoque ? 'disabled' : ''}>+</button>
        </div>
      </div>
    `;
  }).join('');
}

function clienteAlterarQty(nome, preco, delta, barracaId, produtoId) {
  let item = estado.clienteCarrinho.find(i => i.nome === nome && i.barraca_id === barracaId);
  if (!item) {
    item = { id: produtoId, barraca_id: barracaId, nome, preco: parseFloat(preco), qty: 0 };
    estado.clienteCarrinho.push(item);
  }
  if (!item.id && produtoId) item.id = produtoId;
  const novaQty = Math.max(0, item.qty + delta);
  const estoque = (estado._clienteProdutosEstoque || {})[nome + '_' + barracaId] ?? -1;
  if (delta > 0 && estoque !== -1 && novaQty > estoque) {
    toast(`Apenas ${estoque} disponível!`, 'error');
    return;
  }
  item.qty = novaQty;
  const nomeId = nome.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  document.getElementById('cliente-qty-' + nomeId).textContent = item.qty;
  const btnMais = document.getElementById('cliente-qty-mais-' + nomeId);
  if (btnMais && estoque !== -1) btnMais.disabled = item.qty >= estoque;
  clienteAtualizarCarrinho();
}

function clienteAtualizarCarrinho() {
  const resumo = document.getElementById('cliente-carrinho-resumo');
  const itens = estado.clienteCarrinho.filter(i => i.qty > 0);
  if (!itens.length) {
    resumo.style.display = 'none';
    return;
  }
  resumo.style.display = 'block';
  const total = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  document.getElementById('cliente-carrinho-itens').innerHTML = itens.map(i => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #D0DCFF;font-size:0.95rem;">
      <span>${i.qty}x ${i.nome}</span>
      <span style="font-weight:700;color:#C8A020;">${i.preco * i.qty} 🌟</span>
    </div>
  `).join('');
  document.getElementById('cliente-carrinho-total').textContent = `Total: ${total} Alegrias`;
}

async function clienteFazerPedido() {
  const itens = estado.clienteCarrinho.filter(i => i.qty > 0);
  if (!itens.length) { toast('Nenhum item no pedido!', 'error'); return; }
  if (!estado.clienteBarracaAtual) { toast('Selecione uma barraca!', 'error'); return; }

  const total = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  const saldo = parseInt(document.getElementById('cliente-saldo').textContent) || 0;
  if (saldo < total) { toast(`Saldo insuficiente! Você tem ${saldo} 🌟 mas o pedido é ${total} 🌟`, 'error'); return; }

  const res = await api('/api/pedidos', 'POST', {
    cliente_id: estado.clienteId,
    barraca_id: estado.clienteBarracaAtual.id,
    itens: itens.map(i => ({ id: i.id, nome: i.nome, preco: i.preco, qty: i.qty }))
  });

  if (res.ok) {
    chuvaDeMoedas();
    document.getElementById('cliente-saldo').textContent = res.saldo;
    estado.clienteCarrinho = [];
    clienteAtualizarCarrinho();
    clienteCarregarProdutos(estado.clienteBarracaAtual.id);
    carregarPedidosCliente();
    // Modal de confirmação
    const b = estado.clienteBarracaAtual;
    document.getElementById('modal-pedido-conf-barraca').textContent = `${b.emoji} ${b.nome}`;
    document.getElementById('modal-pedido-conf-itens').textContent =
      itens.map(i => `${i.qty}x ${i.nome}`).join(' · ') + ` — Total: ${total} 🌟`;
    document.getElementById('modal-pedido-confirmado').classList.remove('hidden');
  } else if (res.error === 'Saldo insuficiente') {
    toast(`Saldo insuficiente! Você tem ${res.saldo} 🌟 mas o pedido é ${res.valor} 🌟`, 'error');
  } else {
    toast(res.error || 'Erro ao fazer pedido!', 'error');
  }
}

function fecharModalPedidoConfirmado() {
  document.getElementById('modal-pedido-confirmado').classList.add('hidden');
}

// ── Cliente: Abas ─────────────────────────────────────────────────
function abrirTabCliente(ev, tab) {
  document.querySelectorAll('#screen-cliente .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-cliente .tab-content').forEach(c => c.classList.remove('active'));
  const content = document.getElementById('cliente-tab-' + tab);
  if (content) content.classList.add('active');
  ev.currentTarget.classList.add('active');
  localStorage.setItem('tab_cliente', tab);
}

function restaurarTabCliente() {
  const tab = localStorage.getItem('tab_cliente') || 'cardapio';
  document.querySelectorAll('#screen-cliente .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-cliente .tab-content').forEach(c => c.classList.remove('active'));
  const tabEl = document.getElementById('cliente-tab-' + tab);
  const btn = document.querySelector(`#screen-cliente .tab-btn[onclick*="'${tab}'"]`);
  if (tabEl) tabEl.classList.add('active');
  if (btn) btn.classList.add('active');
}

// ── Cliente: Pedidos ──────────────────────────────────────────────
async function carregarPedidosCliente() {
  if (!estado.clienteId) return;
  const pedidos = await api('/api/pedidos/cliente/' + estado.clienteId);
  const cont = document.getElementById('cliente-pedidos-lista');
  const contHistorico = document.getElementById('cliente-historico');

  if (!Array.isArray(pedidos) || !pedidos.length) {
    cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Nenhum pedido feito ainda</p>';
    return;
  }

  const pendentes  = pedidos.filter(p => p.status === 'pendente');
  const entregues  = pedidos.filter(p => p.status === 'confirmado');
  const cancelados = pedidos.filter(p => p.status === 'cancelado');

  if (!pendentes.length) {
    cont.innerHTML = '<p style="color:#a0522d;text-align:center;">Nenhum pedido em andamento</p>';
  } else {
    cont.innerHTML = pendentes.slice(0, 15).map(p => {
      let itens = [];
      try { itens = JSON.parse(p.itens || '[]'); } catch {}
      const especie = itens.some(i => i && i._forma === 'especie');
      const tagEspecie = especie ? '<div style="font-size:0.75rem;color:#C8A020;font-weight:600;margin-top:2px;">🪙 Pago em espécie</div>' : '';
      return `
        <div class="pedido-card-cliente" style="border-left:5px solid #E8458C;">
          <div style="display:flex;justify-content:space-between;align-items:start;">
            <div>
              <div style="font-weight:700;color:#1E3A6E;">${p.barracas ? p.barracas.emoji + ' ' + p.barracas.nome : '—'}</div>
              <div style="font-size:0.85rem;color:#E8458C;font-weight:600;margin-top:2px;">🕐 Aguardando preparo...</div>
              ${tagEspecie}
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.2rem;font-weight:700;color:#C8A020;">${p.valor_total ?? p.valor ?? '?'} 🌟</div>
              <div style="font-size:0.78rem;color:#3A6EC8;">${formatarHora(p.criado_em)}</div>
            </div>
          </div>
          <div style="margin-top:6px;font-size:0.88rem;color:#3A6EC8;">
            ${itens.map(i => `${i.qty}x ${i.nome}`).join(' · ')}
          </div>
        </div>
      `;
    }).join('');
  }

  const contEntregues = document.getElementById('cliente-pedidos-entregues');
  if (contEntregues) {
    const entreguesHtml = entregues.slice(0, 10).map(p => {
      let itens = [];
      try { itens = JSON.parse(p.itens || '[]'); } catch {}
      const especie = itens.some(i => i && i._forma === 'especie');
      const tagEspecie = especie ? '<div style="font-size:0.75rem;color:#C8A020;font-weight:600;">🪙 Pago em espécie</div>' : '';
      return `
        <div class="hist-item" style="border-left:4px solid #16a34a;padding-left:8px;">
          <div class="hist-info">
            <div class="hist-barraca">${p.barracas ? p.barracas.emoji + ' ' + p.barracas.nome : '—'}</div>
            <div style="font-size:0.8rem;color:#16a34a;font-weight:600;">✅ Entregue · ${itens.map(i => `${i.qty}x ${i.nome}`).join(', ')}</div>
            ${tagEspecie}
            <div class="hist-hora">${formatarHora(p.criado_em)}</div>
          </div>
          <div class="hist-valor">${especie ? '' : '−'}${p.valor_total ?? p.valor ?? '?'} 🌟</div>
        </div>
      `;
    }).join('');

    const canceladosHtml = cancelados.slice(0, 5).map(p => {
      let itens = [];
      try { itens = JSON.parse(p.itens || '[]'); } catch {}
      // Motivo: da coluna dedicada ou embutido no primeiro item como _motivo
      const motivoTexto = p.motivo_cancelamento || itens[0]?._motivo || '';
      const motivo = motivoTexto ? ` · "${motivoTexto}"` : '';
      const especie = itens.some(i => i && i._forma === 'especie');
      const estornoLinha = especie
        ? '<div style="font-size:0.75rem;color:#C8A020;font-weight:600;">🪙 Pago em espécie · sem estorno de saldo</div>'
        : '<div style="font-size:0.75rem;color:#16a34a;font-weight:600;">↩ Alegrias estornadas</div>';
      return `
        <div class="hist-item" style="border-left:4px solid #dc2626;padding-left:8px;opacity:0.75;">
          <div class="hist-info">
            <div class="hist-barraca">${p.barracas ? p.barracas.emoji + ' ' + p.barracas.nome : '—'}</div>
            <div style="font-size:0.8rem;color:#dc2626;font-weight:600;">❌ Cancelado${motivo}</div>
            ${estornoLinha}
            <div class="hist-hora">${formatarHora(p.criado_em)}</div>
          </div>
          <div class="hist-valor" style="color:#dc2626;text-decoration:line-through;">${p.valor_total ?? p.valor ?? '?'} 🌟</div>
        </div>
      `;
    }).join('');

    contEntregues.innerHTML = canceladosHtml + entreguesHtml;
  }
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

// ── QR Code do cliente ────────────────────────────────────────────
async function mostrarMeuQR() {
  if (!estado.clienteId) return;
  const res = await api('/api/clientes/' + estado.clienteId + '/qr');
  if (!res.qr) { toast('Erro ao gerar QR', 'error'); return; }
  document.getElementById('meu-qr-img').src = res.qr;
  document.getElementById('meu-qr-nome').textContent = estado.clienteNome || '';
  document.getElementById('modal-meu-qr').classList.remove('hidden');
}

// ── Scanner QR de cliente (caixa) ─────────────────────────────────
let _scannerCaixa = null;

function abrirScannerCaixa() {
  document.getElementById('reader-caixa').innerHTML = '';
  document.getElementById('modal-scanner-cliente').classList.remove('hidden');
  _scannerCaixa = new Html5Qrcode('reader-caixa');
  _scannerCaixa.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    (decodedText) => {
      try {
        const payload = JSON.parse(decodedText);
        if (payload.tipo === 'cliente' && payload.id) {
          fecharScannerCaixa();
          selecionarClienteCaixa(payload.id);
          toast(`✅ Cliente ${payload.nome} carregado!`, 'success');
        }
      } catch (e) { /* ignora QR inválido */ }
    },
    () => {}
  ).catch(() => { fecharScannerCaixa(); toast('Câmera indisponível', 'error'); });
}

function fecharScannerCaixa() {
  document.getElementById('modal-scanner-cliente').classList.add('hidden');
  if (_scannerCaixa) { _scannerCaixa.stop().catch(() => {}); _scannerCaixa = null; }
}

// ── Scanner QR de cliente (admin) ─────────────────────────────────
let _scannerAdmin = null;

function abrirScannerAdmin() {
  document.getElementById('reader-admin').innerHTML = '';
  document.getElementById('modal-scanner-admin').classList.remove('hidden');
  _scannerAdmin = new Html5Qrcode('reader-admin');
  _scannerAdmin.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    (decodedText) => {
      try {
        const payload = JSON.parse(decodedText);
        if (payload.tipo === 'cliente' && payload.id) {
          fecharScannerAdmin();
          abrirEditarCliente(payload.id);
          toast(`✅ Cliente ${payload.nome} encontrado!`, 'success');
        }
      } catch (e) { /* ignora QR inválido */ }
    },
    () => {}
  ).catch(() => { fecharScannerAdmin(); toast('Câmera indisponível', 'error'); });
}

function fecharScannerAdmin() {
  document.getElementById('modal-scanner-admin').classList.add('hidden');
  if (_scannerAdmin) { _scannerAdmin.stop().catch(() => {}); _scannerAdmin = null; }
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
    chuvaDeMoedas();
    toast(`✅ Compra confirmada! Novo saldo: ${res.saldo} 🌟`, 'success');
    document.getElementById('cliente-saldo').textContent = res.saldo;
    carregarPedidosCliente();
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
  setTimeout(restaurarTabAdmin, 0);
}

async function confirmarResetEvento() {
  const confirmou = confirm(
    '⚠️ ATENÇÃO — RESET DO EVENTO\n\n' +
    'Isso vai apagar PERMANENTEMENTE:\n' +
    '• Todos os clientes e seus saldos\n' +
    '• Todas as vendas e recargas\n' +
    '• Todos os pedidos\n\n' +
    'Barracas e produtos serão MANTIDOS.\n\n' +
    'Tem certeza? Esta ação não pode ser desfeita.'
  );
  if (!confirmou) return;
  const confirmou2 = confirm('Tem ABSOLUTA certeza? Todos os dados de teste serão apagados.');
  if (!confirmou2) return;

  const res = await api('/api/admin/reset-evento', 'POST', { confirmacao: 'RESETAR' });
  if (res.ok) {
    toast('✅ Aplicação resetada! Pronta para o evento.', 'success');
    await carregarAdmin();
  } else {
    toast(res.error || 'Erro ao resetar!', 'error');
  }
}

function abrirTabAdmin(ev, tab) {
  document.querySelectorAll('#screen-admin .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-admin .tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-admin-' + tab).classList.add('active');
  ev.currentTarget.classList.add('active');
  localStorage.setItem('tab_admin', tab);
  if (tab === 'log') carregarLogAdmin();
  if (tab === 'transacoes') filtrarTransacoes();
  if (tab === 'senhas') carregarSenhas();
  if (tab === 'monitor') iniciarMonitorPedidos();
  else pararMonitorPedidos();
}

let _monitorTimer = null;

function pararMonitorPedidos() {
  clearInterval(_monitorTimer);
  _monitorTimer = null;
}

function iniciarMonitorPedidos() {
  carregarMonitorPedidos();
  clearInterval(_monitorTimer);
  _monitorTimer = setInterval(carregarMonitorPedidos, 30000);
}

async function carregarMonitorPedidos() {
  const r = await api('/api/admin/pedidos-monitor');
  if (!r || r.error) return;

  const urgCor = m => m >= 20 ? '#dc2626' : m >= 10 ? '#ea580c' : m >= 5 ? '#d97706' : '#16a34a';
  const urgLabel = m => m >= 20 ? '🔴' : m >= 10 ? '🟠' : m >= 5 ? '🟡' : '🟢';

  document.getElementById('admin-monitor-resumo').innerHTML = `
    <div class="kpi-card"><div class="kpi-valor" style="color:${r.total_pendentes>0?'#E8458C':'#16a34a'}">${r.total_pendentes}</div><div class="kpi-label">Em espera agora</div></div>
    <div class="kpi-card"><div class="kpi-valor" style="color:${urgCor(r.espera_max_geral)}">${r.espera_max_geral}min</div><div class="kpi-label">Maior espera</div></div>
  `;

  const barracas = r.barracas || [];
  if (!barracas.length) {
    document.getElementById('admin-monitor-barracas').innerHTML = '<p style="text-align:center;color:#3A6EC8;padding:20px;">Nenhuma barraca ativa.</p>';
    return;
  }

  document.getElementById('admin-monitor-barracas').innerHTML = barracas.map(b => {
    const semPedidos = b.num_pendentes === 0;
    const bordaCor = semPedidos ? '#4ade80' : urgCor(b.espera_max_min);
    const pedidosHtml = b.pendentes.slice(0, 5).map(p => {
      const wCor = urgCor(p.wait_min);
      return `<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:4px 0;border-bottom:1px solid #f0f0f0;">
        <span style="color:#1E3A6E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%;">${p.cliente}</span>
        <span style="font-weight:700;color:${wCor};white-space:nowrap;">⏱ ${p.wait_min < 1 ? 'agora' : p.wait_min + 'min'} · ${p.valor ?? '?'} 🌟</span>
      </div>`;
    }).join('');
    const maisHtml = b.pendentes.length > 5
      ? `<div style="font-size:0.78rem;color:#9aaccc;text-align:center;padding-top:4px;">+ ${b.pendentes.length - 5} mais...</div>` : '';

    return `
      <div class="card" style="border-left:5px solid ${bordaCor};margin-bottom:10px;padding:12px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px;">
          <div style="font-size:1rem;font-weight:700;color:#1E3A6E;">${b.emoji} ${b.nome}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
            ${semPedidos
              ? `<span style="font-size:0.82rem;color:#16a34a;font-weight:700;">✅ Livre</span>`
              : `<span style="font-weight:700;color:${bordaCor};font-size:1rem;">${urgLabel(b.espera_max_min)} ${b.num_pendentes} pedido${b.num_pendentes>1?'s':''}</span>`
            }
          </div>
        </div>
        ${!semPedidos ? `
          <div style="display:flex;gap:12px;font-size:0.8rem;color:#3A6EC8;margin-bottom:8px;flex-wrap:wrap;">
            <span>Espera máx: <strong style="color:${urgCor(b.espera_max_min)}">${b.espera_max_min}min</strong></span>
            <span>Espera média: <strong style="color:${urgCor(b.espera_media_min)}">${b.espera_media_min}min</strong></span>
            <span>Confirmados hoje: <strong style="color:#16a34a">${b.confirmados_hoje}</strong></span>
          </div>
          <div>${pedidosHtml}${maisHtml}</div>
        ` : `<div style="font-size:0.82rem;color:#9aaccc;">${b.confirmados_hoje} pedidos confirmados hoje</div>`}
      </div>`;
  }).join('');

  const ts = new Date(r.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('admin-monitor-ts').textContent = `Atualizado às ${ts} · próximo em 30s`;
}

// ── ADMIN: GERENCIAR SENHAS ─────────────────────────────────────
async function carregarSenhas() {
  const r = await api('/api/admin/senhas');
  if (r.admin !== undefined) document.getElementById('senha-admin-input').value = r.admin;
  if (r.caixa !== undefined) document.getElementById('senha-caixa-input').value = r.caixa;
  const aviso = document.getElementById('senhas-aviso-migracao');
  if (aviso) aviso.style.display = r.persistido ? 'none' : 'block';
}

function toggleVerSenha(inputId, btn) {
  const el = document.getElementById(inputId);
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? '👁️' : '🙈';
}

async function salvarSenha(perfil) {
  const senha = document.getElementById('senha-' + perfil + '-input').value.trim();
  if (!/^\d{4,8}$/.test(senha)) { toast('Senha deve ter de 4 a 8 dígitos numéricos!', 'error'); return; }
  if (!confirm(`Alterar a senha do ${perfil} para "${senha}"?\n\nAnote em local seguro — a senha antiga deixa de funcionar imediatamente.`)) return;
  const res = await api('/api/admin/senhas', 'PUT', { perfil, senha });
  if (res.ok) toast(`✅ Senha do ${perfil} atualizada!`, 'success');
  else toast(res.error || 'Erro ao salvar senha!', 'error');
}

function restaurarTabAdmin() {
  const tab = localStorage.getItem('tab_admin') || 'dashboard';
  document.querySelectorAll('#screen-admin .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-admin .tab-content').forEach(c => c.classList.remove('active'));
  const tabEl = document.getElementById('tab-admin-' + tab);
  const btn = document.querySelector(`#screen-admin .tab-btn[onclick*="'${tab}'"]`);
  if (tabEl) tabEl.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'log') carregarLogAdmin();
  else if (tab === 'transacoes') filtrarTransacoes();
  else if (tab === 'senhas') carregarSenhas();
  else if (tab === 'monitor') iniciarMonitorPedidos();
}

async function carregarLogAdmin() {
  const logs = await api('/api/admin/log?limit=50');
  const cont = document.getElementById('admin-log-lista');
  if (!Array.isArray(logs) || !logs.length) {
    cont.innerHTML = '<p style="color:#3A6EC8;text-align:center;padding:20px;">Nenhuma atividade ainda.</p>';
    return;
  }
  const aviso = logs.length >= 50 ? `<p style="text-align:center;font-size:0.8rem;color:#9aaccc;padding:4px 0 8px;">📋 Mostrando os últimos ${logs.length} registros</p>` : '';
  const acaoIcon = { criar: '➕', excluir: '🗑️', editar: '✏️', recarregar: '💰', vender: '🛒', confirmar: '✅' };
  cont.innerHTML = logs.map(l => {
    const icon = acaoIcon[l.acao] || '📌';
    const hora = l.criado_em ? new Date(l.criado_em).toLocaleString('pt-BR') : '';
    const perfilBadge = l.perfil ? `<span class="badge badge-${l.perfil === 'admin' ? 'red' : l.perfil === 'caixa' ? 'green' : 'yellow'}">${l.perfil}</span>` : '';
    const undone = l.desfeito ? `<span style="color:#9aaccc;font-size:0.8rem;margin-left:6px;">desfeito</span>` : '';
    const undoBtn = !l.desfeito && l.desfazivel ? `<button class="btn btn-outline btn-sm" style="width:auto;padding:4px 12px;font-size:0.82rem;" onclick="desfazerLog('${l.id}')">↩️ Desfazer</button>` : '';
    const detalhes = l.detalhes ? Object.entries(l.detalhes).map(([k,v]) => `<span style="font-size:0.8rem;color:#3A6EC8;">${k}: ${v}</span>`).join(' · ') : '';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 8px;border-bottom:1px solid #eee;${l.desfeito ? 'opacity:0.5;' : ''}">
        <span style="font-size:1.2rem;">${icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:#1E3A6E;">${l.acao} ${l.entidade}${undone}</div>
          <div style="font-size:0.8rem;color:#3A6EC8;">${hora} · ${perfilBadge} ${l.perfil_nome || ''}</div>
          ${detalhes ? `<div style="font-size:0.78rem;color:#666;margin-top:2px;">${detalhes}</div>` : ''}
        </div>
        ${undoBtn}
      </div>
    `;
  }).join('');
  cont.innerHTML = aviso + cont.innerHTML;
}

async function confirmarApagarTodosClientes() {
  if (!confirm('Apagar TODOS os clientes? Esta ação não pode ser desfeita e também remove recargas!')) return;
  const res = await api('/api/clientes', 'DELETE');
  if (res.ok) {
    toast(`${res.total} clientes excluídos!`, 'success');
    carregarAdmin();
  } else toast(res.error || 'Erro!', 'error');
}

async function confirmarApagarTodasTransacoes() {
  if (!confirm('Apagar TODAS as transações? Esta ação não pode ser desfeita!')) return;
  const res = await api('/api/transacoes', 'DELETE');
  if (res.ok) {
    toast(`${res.total} transações excluídas!`, 'success');
    carregarAdmin();
  } else toast(res.error || 'Erro!', 'error');
}

async function apagarLogAdmin() {
  if (!confirm('Apagar todo o histórico de atividades? Esta ação não pode ser desfeita.')) return;
  const res = await api('/api/admin/log', 'DELETE');
  if (res.ok) {
    toast('Histórico apagado!', 'success');
    carregarLogAdmin();
  } else toast(res.error || 'Erro ao apagar!', 'error');
}

async function desfazerLog(id) {
  const res = await api('/api/admin/log/' + id + '/desfazer', 'POST');
  if (res.ok) {
    toast('Ação desfeita!', 'success');
    carregarLogAdmin();
    carregarAdmin();
  } else toast(res.error || 'Erro ao desfazer!', 'error');
}

async function carregarAdmin() {
  const [r, barracas] = await Promise.all([
    api('/api/admin/relatorio'),
    api('/api/barracas')
  ]);
  todasBarracas = Array.isArray(barracas) ? barracas : [];

  // ── Dashboard KPIs
  document.getElementById('admin-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-valor">${r.totalMovimentado ?? 0} 🌟</div><div class="kpi-label">Total Vendido</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.totalRecargas ?? 0} 🌟</div><div class="kpi-label">Total Recargas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.numClientes ?? 0}</div><div class="kpi-label">Clientes</div></div>
    <div class="kpi-card"><div class="kpi-valor">${(r.numVendasQR ?? 0)} QR · ${(r.numPedidos ?? 0)} 📦</div><div class="kpi-label">Vendas (QR + Pedidos)</div></div>
  `;

  // ── Dashboard: vendas por barraca (todas, mesmo com 0)
  document.getElementById('admin-barracas-tabela').innerHTML = (r.porBarraca || []).map(b => `
    <tr>
      <td>${b.nome}</td>
      <td style="text-align:center;">${b.vendas}</td>
      <td style="text-align:right;font-weight:700;color:${b.total > 0 ? '#C8A020' : '#9aaccc'};">${b.total} 🌟</td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;color:#3A6EC8;">Sem dados</td></tr>';

  // ── Aba Barracas
  if (Array.isArray(barracas) && barracas.length) {
    document.getElementById('admin-barracas-lista').innerHTML = barracas.map(b => {
      const stats = (r.porBarraca || []).find(x => x.nome.includes(b.nome));
      const codigoDisplay = b.codigo
        ? `<span style="font-family:monospace;font-size:1.1rem;font-weight:900;color:#E8458C;letter-spacing:4px;background:#FFF0F6;padding:2px 10px;border-radius:8px;">${b.codigo}</span>`
        : `<span style="color:#aaa;font-size:0.8rem;">sem código</span>`;
      return `
        <div class="card" style="margin-bottom:12px;">
          <div class="barraca-admin-card">
            <div style="flex:1;">
              <span style="font-size:1.8rem;">${b.emoji}</span>
              <span style="font-size:1.1rem;font-weight:700;color:#1E3A6E;margin-left:8px;">${b.nome}</span>
              ${b.responsavel ? `<div style="font-size:0.82rem;color:#E8458C;margin-top:4px;">👤 ${b.responsavel}</div>` : ''}
              <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
                <span style="font-size:0.78rem;color:#3A6EC8;font-weight:600;">🔑 Código:</span>
                ${codigoDisplay}
              </div>
              ${stats && stats.vendas > 0
                ? `<div style="font-size:0.85rem;color:#3A6EC8;margin-top:4px;">${stats.vendas} vendas · ${stats.total} 🌟</div>`
                : `<div style="font-size:0.85rem;color:#9aaccc;margin-top:4px;">Sem vendas ainda</div>`}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" style="width:auto;padding:10px 14px;" onclick="editarBarraca('${b.id}','${b.emoji}','${b.nome.replace(/'/g,"\\'")}','${(b.responsavel||'').replace(/'/g,"\\'")}','${b.codigo||''}')">✏️ Editar</button>
              <button class="btn btn-info btn-sm" style="width:auto;padding:10px 14px;" onclick="gerenciarProdutos('${b.id}','${b.emoji} ${b.nome.replace(/'/g,"\\'")}')">🛒 Produtos</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  initFiltrosBarraca();

  // inicialmente renderiza clientes na aba clientes
  renderTabelaClientes(r.clientes || []);
}

// ── CLIENTES ──────────────────────────────────────────────────────
let clienteEditandoId = null;

function mostrarModalNovoCliente() {
  const nome = prompt('Nome do novo cliente:');
  if (!nome || !nome.trim()) return;
  cadastrarClientePorAdmin(nome.trim());
}

async function cadastrarClientePorAdmin(nome) {
  const c = await api('/api/clientes', 'POST', { nome });
  if (c.id) { toast(`✅ ${c.nome} cadastrado!`, 'success'); carregarAdmin(); }
  else toast(c.error || 'Erro!', 'error');
}

async function buscarAdminClientes() {
  const q = document.getElementById('admin-busca-cliente').value.trim();
  const r = await api('/api/admin/relatorio');
  const clientes = (r.clientes || []).filter(c => !q || c.nome.toLowerCase().includes(q.toLowerCase()));
  renderTabelaClientes(clientes);
}

function renderTabelaClientes(clientes) {
  const sorted = [...clientes].sort((a, b) => b.saldo - a.saldo);
  document.getElementById('admin-clientes-tabela').innerHTML = sorted.map(c => `
    <tr>
      <td style="font-weight:600;">${c.nome}</td>
      <td><span class="badge badge-yellow">${c.codigo}</span></td>
      <td style="text-align:right;font-weight:700;color:#C8A020;">${c.saldo} 🌟</td>
      <td style="text-align:center;">
        <button class="btn btn-outline btn-sm" style="width:auto;padding:6px 12px;font-size:0.85rem;" onclick="abrirEditarCliente('${c.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" style="width:auto;padding:6px 10px;font-size:0.8rem;" onclick="confirmarExcluirCliente('${c.id}','${c.nome.replace(/'/g,"\\'")}')">🗑️</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:#3A6EC8;">Nenhum cliente</td></tr>';
}

async function confirmarExcluirCliente(id, nome) {
  if (!confirm(`Excluir cliente "${nome}"?`)) return;
  const res = await api('/api/clientes/' + id, 'DELETE');
  if (res.ok) {
    toast(`"${nome}" excluído!`, 'success', async () => {
      const log = await api('/api/admin/log/ultimo-excluir?entidade=cliente&nome=' + encodeURIComponent(nome));
      if (log?.id && !log.desfeito) await api('/api/admin/log/' + log.id + '/desfazer', 'POST');
      carregarAdmin();
    });
  } else toast(res.error || 'Erro!', 'error');
}

function abrirEditarCliente(id) {
  clienteEditandoId = id;
  api('/api/clientes/' + id).then(c => {
    document.getElementById('editar-cliente-info').textContent = `Código: ${c.codigo}`;
    document.getElementById('editar-cliente-nome').value = c.nome;
    document.getElementById('editar-cliente-saldo').value = c.saldo;
    document.getElementById('modal-editar-cliente').dataset.clienteNome = c.nome;
    document.getElementById('modal-editar-cliente').classList.remove('hidden');
  });
}

function verTransacoesCliente() {
  const nome = document.getElementById('modal-editar-cliente').dataset.clienteNome || '';
  fecharModalEditarCliente();
  // Navega para aba transações e aplica filtro
  const btnTx = document.querySelector('#screen-admin .tab-btn[onclick*="\'transacoes\'"]');
  if (btnTx) btnTx.click();
  setTimeout(() => {
    document.getElementById('tx-filtro-cliente').value = nome;
    filtrarTransacoes();
  }, 50);
}

function fecharModalEditarCliente() {
  document.getElementById('modal-editar-cliente').classList.add('hidden');
  clienteEditandoId = null;
}

async function salvarEdicaoCliente() {
  const nome   = document.getElementById('editar-cliente-nome').value.trim();
  const saldo  = parseFloat(document.getElementById('editar-cliente-saldo').value);
  const novoPin = document.getElementById('editar-cliente-novopin').value.trim();
  if (!nome) { toast('Nome obrigatório!', 'error'); return; }
  const updates = { nome };
  if (!isNaN(saldo)) updates.saldo = saldo;
  if (novoPin && /^\d{4}$/.test(novoPin)) updates.pin = novoPin;
  else if (novoPin) { toast('PIN deve ter 4 dígitos numéricos!', 'error'); return; }

  const res = await api('/api/clientes/' + clienteEditandoId, 'PUT', updates);
  if (res.id) {
    toast('Cliente atualizado!' + (novoPin ? ' Nova senha definida.' : ''), 'success');
    fecharModalEditarCliente();
    carregarAdmin();
  } else { toast(res.error || 'Erro!', 'error'); }
}

async function deletarCliente() {
  if (!confirm('Excluir este cliente? Esta ação não pode ser desfeita.')) return;
  const nome = document.getElementById('editar-cliente-nome').value.trim();
  const res = await api('/api/clientes/' + clienteEditandoId, 'DELETE');
  if (res.ok) {
    toast('Cliente excluído!', 'success', async () => {
      await api('/api/admin/log/undo-cliente', 'POST', { nome, logId: null });
    });
    fecharModalEditarCliente();
    carregarAdmin();
  } else toast(res.error || 'Erro!', 'error');
}

// ── BARRACAS ──────────────────────────────────────────────────────
function mostrarModalNovaBarraca() {
  document.getElementById('nova-barraca-emoji').value = '';
  document.getElementById('nova-barraca-nome').value = '';
  document.getElementById('nova-barraca-responsavel').value = '';
  document.getElementById('modal-nova-barraca').classList.remove('hidden');
}

function fecharModalNovaBarraca() {
  document.getElementById('modal-nova-barraca').classList.add('hidden');
}

async function criarBarraca() {
  const emoji = document.getElementById('nova-barraca-emoji').value.trim() || '🏪';
  const nome = document.getElementById('nova-barraca-nome').value.trim();
  const responsavel = document.getElementById('nova-barraca-responsavel').value.trim();
  if (!nome) { toast('Nome obrigatório!', 'error'); return; }
  const res = await api('/api/barracas', 'POST', { nome, emoji, responsavel });
  if (res.id) {
    fecharModalNovaBarraca();
    carregarAdmin();
    // Mostra o código gerado
    if (res.codigo) {
      document.getElementById('modal-codigo-valor').textContent = res.codigo;
      document.getElementById('modal-codigo-barraca-nome').textContent = `${emoji} ${nome}`;
      document.getElementById('modal-codigo-barraca').classList.remove('hidden');
    } else {
      toast('Barraca criada! (sem código — rode o SQL no Supabase)', 'success');
    }
  } else toast(res.error || 'Erro!', 'error');
}

function fecharModalCodigo() {
  document.getElementById('modal-codigo-barraca').classList.add('hidden');
}

function copiarCodigo() {
  const codigo = document.getElementById('modal-codigo-valor').textContent;
  navigator.clipboard.writeText(codigo).then(() => toast('Código copiado!', 'success'));
}

let barracaEditandoId = null;

function editarBarraca(id, emoji, nome, responsavel, codigo) {
  barracaEditandoId = id;
  document.getElementById('editar-barraca-id').value = id;
  document.getElementById('editar-barraca-emoji').value = emoji;
  document.getElementById('editar-barraca-nome').value = nome;
  document.getElementById('editar-barraca-responsavel').value = responsavel || '';
  document.getElementById('editar-barraca-codigo').value = codigo || '';
  document.getElementById('editar-barraca-titulo').textContent = `✏️ Editar: ${nome}`;
  document.getElementById('modal-editar-barraca').classList.remove('hidden');
}

async function regenerarCodigoBarraca() {
  if (!barracaEditandoId) return;
  if (!confirm('Gerar um novo código? O código antigo vai parar de funcionar imediatamente.')) return;
  const res = await api('/api/barracas/' + barracaEditandoId + '/regenerar-codigo', 'POST');
  if (res.ok) {
    document.getElementById('editar-barraca-codigo').value = res.codigo;
    toast(`✅ Novo código: ${res.codigo} — anote antes de salvar!`, 'success');
  } else toast(res.error || 'Erro ao gerar código!', 'error');
}

function fecharModalEditarBarraca() {
  document.getElementById('modal-editar-barraca').classList.add('hidden');
  barracaEditandoId = null;
}

async function salvarEdicaoBarraca() {
  const emoji = document.getElementById('editar-barraca-emoji').value.trim();
  const nome = document.getElementById('editar-barraca-nome').value.trim();
  const responsavel = document.getElementById('editar-barraca-responsavel').value.trim();
  const codigo = document.getElementById('editar-barraca-codigo').value.trim();
  if (!nome) { toast('Nome obrigatório!', 'error'); return; }
  if (codigo && !/^\d{4,6}$/.test(codigo)) { toast('Código deve ter 4 a 6 dígitos numéricos!', 'error'); return; }
  const res = await api('/api/barracas/' + barracaEditandoId, 'PUT', { nome, emoji, responsavel, codigo: codigo || undefined });
  if (res.id) { toast('Barraca atualizada!', 'success'); fecharModalEditarBarraca(); carregarAdmin(); }
  else toast(res.error || 'Erro!', 'error');
}

async function deletarBarraca() {
  if (!confirm('Desativar esta barraca? Ela não aparecerá mais na lista.')) return;
  const res = await api('/api/barracas/' + barracaEditandoId, 'DELETE');
  if (res.ok) { toast('Barraca desativada!', 'success'); fecharModalEditarBarraca(); carregarAdmin(); }
  else toast(res.error || 'Erro!', 'error');
}

// ── TRANSAÇÕES FILTRADAS ────────────────────────────────────────
let txFiltros = { data: '', tipo: '', barraca_id: '', cliente_nome: '' };

const _origemLabel = {
  qr:      { texto: 'QR Code',  cor: '#E8458C', badge: 'badge-red' },
  especie: { texto: '🪙 Espécie', cor: '#C8A020', badge: 'badge-yellow' },
  pedido:  { texto: 'Cardápio', cor: '#3A6EC8', badge: 'badge-blue' },
  recarga: { texto: 'Recarga',  cor: '#16a34a', badge: 'badge-green' },
};

const _formaLabel = {
  dinheiro: '💵 Dinheiro',
  pix:      '📱 Pix',
  cartao:   '💳 Cartão',
  debito:   '💳 Débito',
  credito:  '💳 Crédito',
  especie:  '🪙 Espécie (Alegrias)',
  qr:       '📲 QR Code',
};

async function filtrarTransacoes() {
  txFiltros.data         = document.getElementById('tx-filtro-data').value;
  txFiltros.tipo         = document.getElementById('tx-filtro-tipo').value;
  txFiltros.barraca_id   = document.getElementById('tx-filtro-barraca').value;
  txFiltros.cliente_nome = document.getElementById('tx-filtro-cliente').value;

  let url = '/api/admin/transacoes?limit=100';
  if (txFiltros.data)         url += '&data='         + txFiltros.data;
  if (txFiltros.tipo)         url += '&tipo='         + txFiltros.tipo;
  if (txFiltros.barraca_id)   url += '&barraca_id='   + txFiltros.barraca_id;
  if (txFiltros.cliente_nome) url += '&cliente_nome=' + encodeURIComponent(txFiltros.cliente_nome);

  const r = await api(url);
  const tx = r.transacoes || [];

  document.getElementById('tx-resumo').innerHTML = `
    <div class="kpi-card"><div class="kpi-valor">${r.resumo?.totalVendas ?? 0} 🌟</div><div class="kpi-label">Vendas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.resumo?.totalRecargas ?? 0} 🌟</div><div class="kpi-label">Recargas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.resumo?.numVendas ?? 0}</div><div class="kpi-label">Nº Vendas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.resumo?.numRecargas ?? 0}</div><div class="kpi-label">Nº Recargas</div></div>
  `;

  const avisoTx = tx.length >= 100 ? `<tr><td colspan="6" style="text-align:center;font-size:0.8rem;color:#9aaccc;padding:6px;">📋 Mostrando os últimos ${tx.length} registros — use os filtros para refinar</td></tr>` : '';
  document.getElementById('admin-tx-tabela').innerHTML = avisoTx + tx.map(t => {
    const origem = _origemLabel[t._origem] || { texto: t.tipo, cor: '#888', badge: '' };

    let localHtml = '—';
    if (t.barracas) localHtml = `${t.barracas.emoji} ${t.barracas.nome}`;
    else if (t.tipo === 'recarga') localHtml = `<span style="color:#16a34a;font-weight:600;">🏧 Caixa</span>`;

    let detalhes = '—';
    if (t._origem === 'recarga') {
      detalhes = `<span style="font-size:0.85rem;">${_formaLabel[t.forma] || ('💵 ' + (t.forma || 'Dinheiro'))}</span>`;
    } else if (t.itens) {
      try {
        const itens = JSON.parse(t.itens);
        if (Array.isArray(itens) && itens.length)
          detalhes = `<span style="font-size:0.8rem;color:#3A6EC8;">${itens.map(i => `${i.qty}x ${i.nome}`).join(', ')}</span>`;
      } catch {}
    }

    return `
      <tr>
        <td style="white-space:nowrap;">${formatarHora(t.timestamp)}</td>
        <td><span class="badge ${origem.badge}" style="white-space:nowrap;">${origem.texto}</span></td>
        <td style="font-weight:600;">${t.clientes ? t.clientes.nome : '—'}</td>
        <td>${localHtml}</td>
        <td style="font-size:0.85rem;max-width:200px;">${detalhes}</td>
        <td style="text-align:right;font-weight:700;white-space:nowrap;">${t.valor} 🌟</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#3A6EC8;">Nenhuma transação encontrada</td></tr>';
}

function exportarCSV() {
  window.open('/api/admin/export-csv', '_blank');
}

async function initFiltrosBarraca() {
  if (!todasBarracas.length) return;
  const sel = document.getElementById('tx-filtro-barraca');
  sel.innerHTML = '<option value="">Todas barracas</option>' +
    todasBarracas.map(b => `<option value="${b.id}">${b.emoji} ${b.nome}</option>`).join('');
}

// ── FECHAR CAIXA ────────────────────────────────────────────────
function mostrarModalFecharCaixa() {
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('fechar-caixa-data').value = hoje;
  document.getElementById('fechar-caixa-resultado').style.display = 'none';
  document.getElementById('modal-fechar-caixa').classList.remove('hidden');
}

function fecharModalFecharCaixa() {
  document.getElementById('modal-fechar-caixa').classList.add('hidden');
}

let _caixaRelatorio = null;

async function gerarFecharCaixa() {
  const data = document.getElementById('fechar-caixa-data').value;
  if (!data) { toast('Selecione uma data!', 'error'); return; }
  const r = await api('/api/admin/fechar-caixa', 'POST', { data });
  if (!r.data) { toast('Erro ao gerar relatório!', 'error'); return; }
  _caixaRelatorio = r;

  document.getElementById('fechar-caixa-resumo').innerHTML = `
    <div class="kpi-card"><div class="kpi-valor">${r.totalVendas} 🌟</div><div class="kpi-label">Total Vendas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.totalRecargas} 🌟</div><div class="kpi-label">Total Recargas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.numVendas}</div><div class="kpi-label">Nº Vendas</div></div>
    <div class="kpi-card"><div class="kpi-valor">${r.numRecargas}</div><div class="kpi-label">Nº Recargas</div></div>
  `;

  document.getElementById('fechar-caixa-barracas').innerHTML = (r.porBarraca || []).map(b => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #D0DCFF;">
      <span>${b.emoji} ${b.nome}</span>
      <span><strong>${b.vendas}</strong> vendas · <strong>${b.total} 🌟</strong></span>
    </div>
  `).join('') || '<p style="color:#9aaccc;text-align:center;">Nenhuma venda</p>';

  document.getElementById('fechar-caixa-tx').innerHTML = (r.transacoes || []).map(t => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #D0DCFF;font-size:0.9rem;">
      <span>${formatarHora(t.timestamp)} ${t.tipo === 'venda' ? '🔴' : '🟢'} ${t.clientes ? t.clientes.nome : '—'} ${t.barracas ? '→ ' + (t.barracas.emoji||'') + ' ' + t.barracas.nome : ''}</span>
      <span style="font-weight:700;">${t.valor} 🌟</span>
    </div>
  `).join('') || '<p style="color:#9aaccc;text-align:center;">Nenhuma transação</p>';

  document.getElementById('fechar-caixa-resultado').style.display = 'block';
}

// ── Exportar Fechar Caixa ────────────────────────────────────────
function exportarCaixaExcel() {
  if (!_caixaRelatorio) { toast('Gere o relatório primeiro!', 'error'); return; }
  const r = _caixaRelatorio;
  const data = document.getElementById('fechar-caixa-data').value;
  const wb = XLSX.utils.book_new();

  // Aba 1: Resumo
  const resumo = [
    ['Cordel 2026 — Relatório de Caixa', ''],
    ['Data', data],
    ['', ''],
    ['Total Vendas (Alegrias)', r.totalVendas],
    ['Total Recargas (Alegrias)', r.totalRecargas],
    ['Nº de Vendas', r.numVendas],
    ['Nº de Recargas', r.numRecargas],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo');

  // Aba 2: Vendas por Barraca
  const barracasData = [['Barraca', 'Nº Vendas', 'Total (Alegrias)']];
  (r.porBarraca || []).forEach(b => barracasData.push([(b.emoji || '') + ' ' + b.nome, b.vendas, b.total]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(barracasData), 'Por Barraca');

  // Aba 3: Transações
  const txData = [['Hora', 'Tipo', 'Cliente', 'Barraca', 'Valor (Alegrias)']];
  (r.transacoes || []).forEach(t => txData.push([
    formatarHora(t.timestamp),
    t.tipo,
    t.clientes?.nome || '—',
    t.barracas ? (t.barracas.emoji || '') + ' ' + t.barracas.nome : '—',
    t.valor
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txData), 'Transações');

  XLSX.writeFile(wb, `cordel2026-caixa-${data}.xlsx`);
  toast('📊 Excel exportado!', 'success');
}

// Remove emojis e caracteres não suportados pelo jsPDF
function _semEmoji(str) {
  return String(str || '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[^\x00-\xFF]/g, '')
    .trim();
}

function exportarCaixaPDF() {
  if (!_caixaRelatorio) { toast('Gere o relatório primeiro!', 'error'); return; }
  const r = _caixaRelatorio;
  const data = document.getElementById('fechar-caixa-data').value;
  const dataFmt = data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : data;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Cabeçalho
  doc.setFillColor(30, 58, 110);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('Cordel 2026 — Relatório de Caixa', 14, 12);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('Data: ' + dataFmt, 14, 22);

  // KPIs
  doc.setTextColor(30, 58, 110);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  let y = 36;
  const kpis = [
    ['Total Vendas', r.totalVendas + ' Alegrias'],
    ['Total Recargas', r.totalRecargas + ' Alegrias'],
    ['Nº de Vendas', String(r.numVendas)],
    ['Nº de Recargas', String(r.numRecargas)],
  ];
  const colW = 45;
  kpis.forEach((k, i) => {
    const x = 14 + i * colW;
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(x, y, colW - 3, 16, 3, 3, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.setTextColor(200, 160, 32);
    doc.text(k[1], x + (colW - 3) / 2, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(58, 110, 200);
    doc.text(k[0], x + (colW - 3) / 2, y + 13, { align: 'center' });
  });

  // Vendas por Barraca
  y += 24;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(232, 69, 140);
  doc.text('Vendas por Barraca', 14, y); y += 4;
  doc.autoTable({
    startY: y,
    head: [['Barraca', 'Nº Vendas', 'Total (Alegrias)']],
    body: (r.porBarraca || []).map(b => [_semEmoji(b.nome), b.vendas, b.total]),
    headStyles: { fillColor: [30, 58, 110], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // Transações
  y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(232, 69, 140);
  doc.text('Transações do Dia', 14, y); y += 4;
  doc.autoTable({
    startY: y,
    head: [['Hora', 'Tipo', 'Cliente', 'Barraca', 'Valor']],
    body: (r.transacoes || []).map(t => [
      formatarHora(t.timestamp),
      t.tipo === 'venda' ? 'Venda' : 'Recarga',
      _semEmoji(t.clientes?.nome || '—'),
      t.barracas ? _semEmoji(t.barracas.nome) : '—',
      t.valor + ' Alegrias'
    ]),
    headStyles: { fillColor: [30, 58, 110], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // Rodapé
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Igreja Batista Zona Sul · Cordel 2026 · Página ${i}/${pageCount}`, 105, 292, { align: 'center' });
  }

  doc.save(`cordel2026-caixa-${data}.pdf`);
  toast('📄 PDF exportado!', 'success');
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
      <input type="text" id="prod-nome-${p.id}" value="${p.nome}" class="form-control" style="flex:2;min-width:120px;font-size:0.85rem;" />
      <div class="prod-campo" style="width:70px;">
        <span class="prod-campo-label">Preço 🌟</span>
        <input type="number" id="prod-preco-${p.id}" value="${p.preco}" class="form-control" style="width:100%;font-size:0.85rem;" step="0.5" min="1" />
      </div>
      <div class="prod-campo" style="width:70px;">
        <span class="prod-campo-label">Estoque</span>
        <input type="number" id="admin-prod-estoque-${p.id}" value="${p.estoque ?? -1}" class="form-control" style="width:100%;font-size:0.85rem;" placeholder="-1" title="Estoque" />
      </div>
      <button class="btn btn-success btn-sm" style="width:auto;min-height:36px;padding:4px 10px;font-size:0.85rem;" onclick="editarProduto('${p.id}')" title="Salvar">💾</button>
      <button class="btn btn-danger btn-sm" style="width:auto;min-height:36px;padding:4px 12px;font-size:0.85rem;" onclick="deletarProduto('${p.id}')">✕</button>
    </div>
  `).join('');
}

async function adicionarProduto() {
  const nome = document.getElementById('novo-produto-nome').value.trim();
  const preco = parseFloat(document.getElementById('novo-produto-preco').value);
  const estoque = parseInt(document.getElementById('novo-produto-estoque').value) || -1;
  if (!nome) { toast('Digite o nome do produto!', 'error'); return; }
  if (!preco || preco <= 0) { toast('Digite um preço válido!', 'error'); return; }
  const res = await api('/api/barracas/' + produtosBarracaAtual + '/produtos', 'POST', { nome, preco, estoque });
  if (res.id) {
    toast('Produto adicionado!', 'success');
    document.getElementById('novo-produto-nome').value = '';
    document.getElementById('novo-produto-preco').value = '';
    document.getElementById('novo-produto-estoque').value = '';
    await carregarProdutosModal(produtosBarracaAtual);
  } else {
    toast(res.error || 'Erro ao adicionar!', 'error');
  }
}

async function adminSalvarEstoque(id) {
  const estoque = parseInt(document.getElementById('admin-prod-estoque-' + id).value);
  const res = await api('/api/produtos/' + id + '/estoque', 'PUT', { estoque });
  if (res.id) toast('Estoque atualizado!', 'success');
  else toast(res.error || 'Erro!', 'error');
}

async function editarProduto(id) {
  const nome = document.getElementById('prod-nome-' + id).value.trim();
  const preco = parseFloat(document.getElementById('prod-preco-' + id).value);
  const estoque = parseInt(document.getElementById('admin-prod-estoque-' + id).value);
  if (!nome) { toast('Nome obrigatório!', 'error'); return; }
  if (!preco || preco <= 0) { toast('Preço inválido!', 'error'); return; }
  const res = await api('/api/produtos/' + id, 'PUT', { nome, preco, estoque });
  if (res.id) { toast('Produto atualizado!', 'success'); await carregarProdutosModal(produtosBarracaAtual); }
  else { toast(res.error || 'Erro!', 'error'); }
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
function clearPolls() {
  clearInterval(estado.qrPollTimer);
  clearInterval(estado.clientePollTimer);
}

async function api(url, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    console.log('[API]', method, url);
    const res = await fetch(API + url, opts);
    const data = await res.json();
    console.log('[API] resposta:', url, res.status, JSON.stringify(data).substring(0, 150));
    return data;
  } catch (e) {
    console.error('[API] erro', url, e);
    return {};
  }
}

let toastTimer;
let toastUndoFn = null;
let toastUndoTimer = null;

function toast(msg, tipo = '', undoFn = null) {
  const el = document.getElementById('toast');
  toastUndoFn = undoFn;
  clearTimeout(toastTimer);
  clearTimeout(toastUndoTimer);

  let undoHtml = '';
  if (typeof undoFn === 'function') {
    undoHtml = `<button class="toast-undo" onclick="toastDesfazer()">Desfazer</button>`;
  }

  el.innerHTML = `<span>${msg}</span>${undoHtml}`;
  el.className = 'show ' + (tipo === 'success' ? 'success' : tipo === 'error' ? 'error' : '');
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    toastUndoFn = null;
  }, 6000);
}

function toastDesfazer() {
  if (typeof toastUndoFn === 'function') {
    toastUndoFn();
    toastUndoFn = null;
  }
  const el = document.getElementById('toast');
  el.classList.remove('show');
  clearTimeout(toastTimer);
}

function formatarHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
