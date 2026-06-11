# 🎪 AI - Alegria Inteligente – Sistema de Moeda Digital  
**Cordel 2026 · Igreja Batista Zona Sul**

---

## 🚀 Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
# Edite o arquivo .env com suas credenciais do Supabase

# 3. Iniciar o servidor
npm start
# → http://localhost:3000
```

---

## ⚙️ Configurar o Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. No menu lateral, vá em **SQL Editor**
3. Cole e execute o conteúdo de `supabase_setup.sql`
4. Vá em **Project Settings → API**
5. Copie a **Project URL** e a **anon public key**
6. Cole no arquivo `.env`:

```env
SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Desabilitar RLS (Row Level Security) para desenvolvimento

No Supabase, vá em **Authentication → Policies** e para cada tabela
(`clientes`, `barracas`, `transacoes`, `qr_pendentes`):
- Clique em "Disable RLS" **ou** crie uma policy "Allow all" com `TRUE`

---

## 🚂 Deploy no Railway

1. Instale o Railway CLI: `npm i -g @railway/cli`
2. Faça login: `railway login`
3. Crie um projeto: `railway init`
4. Configure as variáveis de ambiente no dashboard do Railway:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `PIX_CHAVE`
   - `PIX_NOME`
5. Faça deploy: `railway up`

Ou pelo GitHub:
1. Suba o projeto para um repositório GitHub
2. No Railway, clique em "Deploy from GitHub repo"
3. Configure as variáveis de ambiente
4. Deploy automático a cada push!

---

## 🖼️ Como adicionar a logo

Simplesmente copie sua logo para:
```
public/assets/logo.png
```
O sistema detecta automaticamente. Se não existir, exibe emojis 🎪🎭🎨.

---

## 👤 Perfis de acesso

| Perfil   | Código | Como acessar |
|----------|--------|-------------|
| Cliente  | sem código (PIN próprio de 4 dígitos) | Qualquer pessoa pelo nome |
| Gerente  | código individual por barraca | Dropdown "Gerente de Barraca" |
| Caixa    | gerenciável na aba 🔑 Senhas do Admin (padrão `5678`) | Dropdown "Caixa" |
| Admin    | gerenciável na aba 🔑 Senhas do Admin (padrão `9999`) | Botão "Admin" no rodapé |

> 🔑 As senhas de **Caixa** e **Admin** ficam na tabela `config` do Supabase e
> podem ser alteradas em **Admin → 🔑 Senhas**. Se a tabela não existir, o
> sistema usa os padrões acima (rode `supabase_migration_v2.sql` para ativar).

---

## 🔄 Migração v2 (junho/2026)

Execute `supabase_migration_v2.sql` no **SQL Editor** do Supabase. Ele cria:
- Tabela `config` (senhas de admin/caixa gerenciáveis pelo app)
- Coluna `forma` em `transacoes` (`qr`, `especie`, `dinheiro`, `pix`, `cartao`)

O deploy funciona mesmo **sem** a migração (o servidor detecta e usa fallback),
mas a troca de senhas só funciona depois de rodar o SQL.

---

## 🪙 Venda em espécie (Alegrias físicas)

Na aba **Vender** do gerente há duas formas de recebimento:
- **📲 QR Code** – debita o saldo digital do cliente
- **🪙 Espécie** – o gerente recebe Alegrias físicas (papel) e registra a venda
  sem debitar saldo de nenhum cliente. Aparece nos relatórios como "Espécie".

---

## 🏗️ Estrutura do projeto

```
alegrias/
├── server.js          ← API REST (Express)
├── database.js        ← Conexão Supabase
├── public/
│   ├── index.html     ← SPA (todas as telas)
│   ├── style.css      ← Tema festa junina
│   ├── app.js         ← Lógica frontend
│   └── assets/
│       └── logo.png   ← ← Coloque sua logo aqui
├── supabase_setup.sql ← SQL completo das tabelas
├── .env               ← Variáveis de ambiente
└── package.json
```

---

## 💡 Fluxo de pagamento

```
Gerente adiciona produtos → Gera QR Code
        ↓
  QR aparece na tela (enorme, fácil de escanear)
        ↓
Cliente abre o app → "📷 Escanear QR Code"
        ↓
  Vê detalhes da compra → Confirma
        ↓
  Saldo debitado automaticamente
        ↓
  Gerente vê "✅ Pagamento confirmado!"
```
