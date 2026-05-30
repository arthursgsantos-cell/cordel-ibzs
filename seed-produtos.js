require('dotenv').config();
const supabase = require('./database');

const PRODUTOS = {
  'Pamonha Assada':         [{nome:'Pamonha simples', preco:5}, {nome:'Pamonha com queijo', preco:6}, {nome:'Pamonha doce', preco:5}],
  'Bolo com Café':          [{nome:'Bolo de milho', preco:5}, {nome:'Bolo de fubá', preco:5}, {nome:'Café', preco:3}, {nome:'Kit bolo+café', preco:7}],
  'Lanche no Pote':         [{nome:'Lanche no pote P', preco:10}, {nome:'Lanche no pote G', preco:14}, {nome:'Lanche especial', preco:16}],
  'Cachorro-quente':        [{nome:'Cachorro simples', preco:8}, {nome:'Cachorro completo', preco:12}, {nome:'Mini cachorro', preco:5}],
  'Milho, Cuscuz e Caldo':  [{nome:'Milho na espiga', preco:5}, {nome:'Cuscuz', preco:5}, {nome:'Caldo de cana', preco:6}, {nome:'Combo', preco:12}],
  'Açaí':                   [{nome:'Açaí P (300ml)', preco:12}, {nome:'Açaí M (500ml)', preco:16}, {nome:'Açaí G (700ml)', preco:20}],
  'Bebidas':                [{nome:'Água', preco:3}, {nome:'Refrigerante lata', preco:6}, {nome:'Suco natural', preco:7}, {nome:'Limonada', preco:8}],
  'Salgados':               [{nome:'Salgado (un.)', preco:4}, {nome:'Combo 3 salgados', preco:10}, {nome:'Combo 6 salgados', preco:18}],
  'Pipoca e Docinhos':      [{nome:'Pipoca', preco:5}, {nome:'Brigadeiro', preco:3}, {nome:'Beijinho', preco:3}, {nome:'Combo 5 doces', preco:12}],
  'Churrasco':              [{nome:'Espetinho (un.)', preco:8}, {nome:'Combo 2 espetos', preco:14}, {nome:'Prato churrasquinho', preco:20}],
  'Cordelsinho':            [{nome:'Pescaria (1x)', preco:5}, {nome:'Camarim (1x)', preco:5}, {nome:'Pula-pula (1x)', preco:5}, {nome:'Combo 3 atividades', preco:12}],
};

async function seed() {
  const { data: barracas, error } = await supabase.from('barracas').select('id, nome');
  if (error) { console.error('Erro ao buscar barracas:', error.message); process.exit(1); }

  const { data: existentes } = await supabase.from('produtos').select('id').limit(1);
  if (existentes && existentes.length > 0) {
    console.log('Produtos já existem. Pulando seed.');
    process.exit(0);
  }

  let total = 0;
  for (const barraca of barracas) {
    const key = Object.keys(PRODUTOS).find(k => barraca.nome.includes(k) || k.includes(barraca.nome.split(',')[0].split('(')[0].trim()));
    if (!key) { console.log(`  Sem produtos mapeados para: ${barraca.nome}`); continue; }

    const lista = PRODUTOS[key].map(p => ({ barraca_id: barraca.id, nome: p.nome, preco: p.preco, ativo: true }));
    const { error: ie } = await supabase.from('produtos').insert(lista);
    if (ie) { console.error(`Erro em ${barraca.nome}:`, ie.message); continue; }
    console.log(`  ✓ ${lista.length} produtos → ${barraca.nome}`);
    total += lista.length;
  }
  console.log(`\nTotal: ${total} produtos inseridos.`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
