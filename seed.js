require('dotenv').config();
const supabase = require('./database');

async function seed() {
  // Apaga cliente de teste
  await supabase.from('clientes').delete().eq('nome', 'Teste RLS');

  // Verifica se já tem barracas
  const { data: existentes } = await supabase.from('barracas').select('id');
  if (existentes && existentes.length > 0) {
    console.log(`Barracas já existem (${existentes.length}). Pulando insert.`);
  } else {
    const { error } = await supabase.from('barracas').insert([
      { nome: 'Pamonha Assada',                           emoji: '🌽', ativa: true },
      { nome: 'Bolo com Café',                       emoji: '🍰', ativa: true },
      { nome: 'Lanche no Pote',                           emoji: '🥪', ativa: true },
      { nome: 'Cachorro-quente',                          emoji: '🌭', ativa: true },
      { nome: 'Milho, Cuscuz e Caldo',                    emoji: '🍲', ativa: true },
      { nome: 'Açaí',                           emoji: '🍧', ativa: true },
      { nome: 'Bebidas',                                   emoji: '🥤', ativa: true },
      { nome: 'Salgados',                                  emoji: '🧆', ativa: true },
      { nome: 'Pipoca e Docinhos',                         emoji: '🍿', ativa: true },
      { nome: 'Churrasco',                                 emoji: '🔥', ativa: true },
      { nome: 'Cordelsinho (Pescaria/Camarim/Pula-pula)', emoji: '🎠', ativa: true },
    ]);
    if (error) { console.error('Erro ao inserir barracas:', error.message); process.exit(1); }
    console.log('11 barracas inseridas com sucesso!');
  }

  // Confirma lendo
  const { data } = await supabase.from('barracas').select('nome, emoji').order('nome');
  console.log('\nBarracas no banco:');
  (data || []).forEach(b => console.log(' ', b.emoji, b.nome));
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
