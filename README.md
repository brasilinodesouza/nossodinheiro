# Nosso Dinheiro

App de finanças para um casal, feito com Next.js, React, TypeScript e Supabase, preparado para hospedagem na Vercel. O visual e as regras financeiras foram adaptados do `codigo.txt` fornecido: a planilha do Google foi substituída pelo Supabase.

## O que já funciona

- Interface para celular e computador, com navegação inferior no celular.
- Conta individual com e-mail e senha, confirmação por e-mail e recuperação de senha.
- Espaço de duas pessoas: uma cria o espaço, a outra entra com um convite.
- Salários, descontos e comissões separados para cada pessoa e mês.
- Custos fixos, variáveis e cartão de crédito; adicionar, editar e remover registros.
- Visão geral da renda, gastos e saldo, com gráficos.
- Objetivos de poupança com saldo atual, meta e progresso, independentes do mês.
- Exportação e importação dos backups JSON do app original.
- Proteção contra sobrescrever uma versão mais recente dos dados do outro celular.
- Manifesto e ícones para adicionar o app à tela inicial do smartphone.

## Experimentar no computador

Use Node.js 22 ou superior. Na pasta do projeto:

```powershell
npm ci
npm run dev
```

Abra http://localhost:3000/demo para experimentar com dados fictícios. As alterações da demonstração ficam apenas em memória e são descartadas ao recarregar. A demonstração funciona sem configurar o Supabase.

## Conectar ao Supabase

1. Escolha um projeto **dedicado a este app** no [Supabase](https://supabase.com/dashboard). O banco remoto ainda não foi configurado. Não execute o esquema em um projeto de outro aplicativo.
2. No SQL Editor, execute **uma única vez** o conteúdo de `supabase/schema.sql`. Ele cria tabelas, políticas de acesso e funções. Não é um script para repetir ou para apagar dados existentes.
3. Copie `.env.example` para `.env.local` e preencha as duas variáveis com a URL do projeto e a chave **publishable** da tela Connect / API Keys:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
```

Nunca use `service_role` ou uma secret key nessas variáveis públicas. O app usa autenticação e políticas RLS para proteger os dados.

4. Em **Authentication → Providers**, habilite Email e mantenha a confirmação de e-mail ativa.
5. Em **Authentication → URL Configuration**, coloque seu domínio da Vercel como **Site URL**. Cadastre as URLs de redirecionamento de produção e desenvolvimento, por exemplo:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/recuperar
https://SEU-APP.vercel.app/auth/callback
https://SEU-APP.vercel.app/auth/callback?next=/recuperar
```

6. Em **Authentication → Email Templates**, prefira os links com `token_hash` abaixo. Eles permitem confirmar o e-mail ou recuperar a senha mesmo abrindo o link em outro navegador. Para testes locais, use `http://localhost:3000` como Site URL e depois troque para o domínio publicado.

**Confirm signup:**

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
  >Confirmar minha conta</a
>
```

**Reset password:**

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery"
  >Criar nova senha</a
>
```

7. Reinicie o app depois de alterar `.env.local`. Crie sua conta, confirme o e-mail e crie o espaço. Nas configurações do app, gere o convite. Sua esposa cria e confirma a própria conta, escolhe **Tenho um convite** e cola o código. O convite expira em 7 dias, é válido uma vez e é invalidado quando outro código é gerado.

Se o Supabase limitar o envio de e-mails, aguarde ou configure seu SMTP na área de autenticação. Não desative a confirmação como solução de produção.

## Publicar na Vercel

1. Coloque este projeto em um repositório GitHub e importe-o na [Vercel](https://vercel.com/new).
2. Selecione o framework **Next.js**, o diretório raiz deste projeto e Node.js **22.x** ou superior.
3. Adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em **Settings → Environment Variables**. A URL e a chave precisam pertencer ao mesmo projeto Supabase.
4. A Vercel usa `npm run build`. Publique e ajuste as URLs e os modelos de e-mail no Supabase para o domínio final.
5. Se mudar as variáveis de ambiente, faça um novo deploy: as variáveis `NEXT_PUBLIC_` são incorporadas à compilação.

O aplicativo não foi publicado automaticamente. Não é necessário usar outro serviço de hospedagem.

## Usar no smartphone

Abra a URL publicada com HTTPS. No Android, use o menu do Chrome → **Instalar app** ou **Adicionar à tela inicial**. No iPhone, use Compartilhar no Safari → **Adicionar à Tela de Início**.

É um app web instalável, sem necessidade de loja de aplicativos. Os dados financeiros exigem internet. Não existe cache offline de dados ou telas autenticadas. O comportamento de instalação pode variar por navegador.

## Trazer os dados antigos

No app antigo, exporte o backup JSON. No Nosso Dinheiro, abra **Configurações e backup → Importar backup**. Confira a tela de confirmação e exporte os dados atuais antes de substituir.

O código anexado é a aplicação, não uma exportação dos dados da planilha. Para trazer valores reais, é necessário exportá-los pelo app antigo. A nova versão mantém as chaves `fin_ANO_MÊS_categoria`, com mês de 0 a 11, e `fin_poupanca_objetivos`. IDs numéricos e valores serializados do sistema original são aceitos. Arquivos inválidos, valores negativos e registros duplicados são rejeitados. Limite: 2 MB por backup/espaço.

## Como os meses e o salvamento funcionam

Salários e gastos fixos são sugeridos a partir do mês anterior. As descrições de variáveis, cartão e comissões também são sugeridas, com valores zerados. A sugestão é salva no mês selecionado quando você altera um registro. A poupança registra saldos acumulados; ela não é uma despesa mensal.

O botão **Atualizar dados** lê as alterações do outro dispositivo. Ao salvar, o banco compara a versão carregada com a versão atual. Se outra pessoa já salvou, o aplicativo interrompe a gravação, mantém a alteração pendente na sessão e oferece exportação e atualização. Ele não combina alterações conflitantes automaticamente. Não feche a tela antes de exportar ou salvar alterações pendentes.

O armazenamento usa um documento financeiro por casal, para preservar a compatibilidade com o backup original. Convites ficam armazenados somente como hash. As funções privilegiadas de criação e entrada ficam no schema `private`; as funções públicas usam `SECURITY INVOKER`. Ambos os membros podem editar os dados compartilhados; outros usuários não podem ler ou alterar esse espaço. Não exponha o schema `private` na Data API.

## Verificações

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Os testes financeiros verificam centavos, salários/comissões, troca de mês, poupança e compatibilidade de backup. Os testes de banco executam o SQL real em PostgreSQL local em memória (PGlite), verificando políticas RLS, isolamento entre casais, convites, validade, uso único e bloqueio de versões antigas.

A validação local não substitui testar cadastro, confirmação de e-mail, recuperação de senha e compartilhamento em duas contas reais no projeto Supabase escolhido. A configuração remota e a publicação ainda dependem desse projeto e da sua conta Vercel.

Referências oficiais: [Next.js na Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Autenticação Supabase com Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Apps instaláveis com Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps).
