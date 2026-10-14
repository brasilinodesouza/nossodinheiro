# Nosso Dinheiro

App de finanças para um casal, feito com Next.js, React, TypeScript e Supabase, preparado para hospedagem na Vercel. O visual e as regras financeiras foram adaptados do `codigo.txt` fornecido: a planilha do Google foi substituída pelo Supabase.

## O que já funciona

- Interface para celular e computador, com navegação inferior no celular.
- Conta individual com usuário e senha, sem solicitar endereço de e-mail ou enviar mensagens.
- Espaço de duas pessoas: uma cria o espaço, a outra entra com um convite.
- Salários, descontos e comissões separados para cada pessoa e mês.
- Custos fixos, variáveis e cartão de crédito; adicionar, editar e remover registros.
- Visão geral da renda, gastos e saldo, com gráficos.
- Objetivos de poupança com saldo atual, meta e progresso, independentes do mês.
- Exportação e importação dos backups JSON do app original.
- Proteção contra sobrescrever uma versão mais recente dos dados do outro celular.
- Manifesto e ícones para adicionar o app à tela inicial do smartphone.
- Convite de instalação no Android e orientação de instalação no iPhone/iPad.
- Detecção automática de novas versões, com proteção de formulários e alterações pendentes.

## Experimentar no computador

Use Node.js 22 ou superior. Na pasta do projeto:

```powershell
npm ci
npm run dev
```

Abra http://localhost:3000/demo para experimentar com dados fictícios. As alterações da demonstração ficam apenas em memória e são descartadas ao recarregar. A demonstração funciona sem configurar o Supabase.

## Conectar ao Supabase

1. O projeto deste app é [nossodinheiro — bsidllisvxsyznoprwan](https://supabase.com/dashboard/project/bsidllisvxsyznoprwan). As tabelas, funções e políticas foram configuradas nesse projeto.
2. **Não execute o esquema novamente nesse projeto.** O histórico inicial está em `supabase/migrations`. `supabase/schema.sql` é uma referência para criar um banco novo e vazio. Mudanças futuras no banco devem usar novas migrações.
3. Copie `.env.example` para `.env.local` e preencha as duas variáveis com a URL do projeto e a chave **publishable** da tela Connect / API Keys:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
```

Nunca use `service_role` ou uma secret key nessas variáveis públicas. O app usa autenticação e políticas RLS para proteger os dados.

4. Em **Authentication → Sign In / Providers**, mantenha o provedor **Email** habilitado e desative **Confirm email**. O usuário escolhe apenas um nome e uma senha; não existe confirmação por mensagem. A mesma configuração está em `supabase/config.toml` para desenvolvimento local. Não configure SMTP.
5. Reinicie o app depois de alterar `.env.local`. Escolha **Criar conta**, defina um usuário com 3 a 32 caracteres e uma senha com 8 a 128 caracteres e crie o espaço. Nas configurações do app, gere o convite. Sua esposa cria a própria conta, escolhe **Tenho um convite** e cola o código. O convite expira em 7 dias, é válido uma vez e é invalidado quando outro código é gerado.

Nomes de usuário são normalizados para minúsculas e aceitam letras ASCII, números, ponto, hífen e sublinhado, começando com letra ou número. Internamente, o servidor transforma o nome em um identificador determinístico em hexadecimal no domínio reservado `usuarios.nossodinheiro.invalid`, porque o Supabase Auth exige um identificador em formato de e-mail para contas com senha. Esse domínio não possui caixa postal; o app não pede um endereço real. Cadastro e login usam exatamente a mesma transformação. O Supabase continua armazenando o hash da senha e emitindo sessões; as políticas RLS usam o UUID autenticado, nunca o nome de usuário. Não altere esse mapeamento depois de cadastrar contas sem planejar uma migração.

A recuperação por e-mail foi removida. Esta versão não oferece recuperação automática de senha; guarde a senha no gerenciador do celular. As antigas rotas de confirmação e recuperação redirecionam ao login.

## Publicar na Vercel

1. Coloque este projeto em um repositório GitHub e importe-o na [Vercel](https://vercel.com/new).
2. Selecione o framework **Next.js**, o diretório raiz deste projeto e Node.js **22.x** ou superior.
3. Adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em **Settings → Environment Variables**. A URL e a chave precisam pertencer ao mesmo projeto Supabase.
4. A Vercel usa `npm run build`. Publique e mantenha o cadastro sem confirmação no Supabase.
5. Se mudar as variáveis de ambiente, faça um novo deploy: as variáveis `NEXT_PUBLIC_` são incorporadas à compilação.

O endereço permanente de produção é **https://nossodinheiro-xi.vercel.app**. O projeto Vercel está conectado a `brasilinodesouza/nossodinheiro`, com `main` como branch de produção e atribuição automática do domínio habilitada. Commits em `main` geram um novo deploy; outras branches geram previews. A versão precisa terminar o build e ficar Ready antes de chegar aos celulares. Não use a URL de um deploy específico para instalar: ela continua apontando para aquele deploy.

## Usar no smartphone

Abra **https://nossodinheiro-xi.vercel.app** com HTTPS. Ao abrir no celular pelo navegador, aparece um convite de instalação. Ele deixa de aparecer dentro do app instalado; fechar o convite o oculta durante a sessão do navegador. Também existe o botão **Instalar no celular** nas configurações.

No Android/Chrome, o botão abre a instalação nativa quando o navegador oferece `beforeinstallprompt`. Esse pedido exige um toque do usuário; o site não pode forçar a janela nativa ao carregar. Caso o navegador ainda não libere o pedido, o app mostra como usar **Instalar app** ou **Adicionar à tela inicial** no menu.

No iPhone/iPad, o app mostra o passo a passo do Safari: **Compartilhar → Adicionar à Tela de Início → Adicionar**. Mantenha **Abrir como App Web** ligado se essa opção aparecer. O iOS não permite ao site abrir automaticamente a janela nativa de instalação.

É um app web instalável, sem necessidade de loja de aplicativos. Os dados financeiros exigem internet. Não existe cache offline de dados ou telas autenticadas. O comportamento de instalação pode variar por navegador.

## Atualizações automáticas dos celulares

O app consulta `/api/version` ao abrir, ao voltar à tela, ao recuperar a conexão e a cada 60 segundos enquanto estiver visível. A versão usa o identificador do commit fornecido pela Vercel. Quando encontra um deploy novo, o app recarrega automaticamente. Se houver um formulário aberto, um salvamento em andamento ou alterações pendentes, ele espera você terminar, salvar ou exportar/descartar essas alterações. A consulta de versão ignora caches; falhas de conexão não provocam recargas.

Um service worker recebe as navegações pela rede e mostra uma tela de reconexão quando ela falha. Ele não grava dados, sessões, APIs ou páginas financeiras em cache. O app fechado recebe a versão nova quando for aberto novamente com internet. Não há instalação silenciosa de APK ou atualização de aplicativo nativo por loja.

Os dados continuam no mesmo projeto Supabase. Um commit de interface não modifica as tabelas automaticamente. Para mudanças de esquema, crie e aplique uma nova migração antes de disponibilizar a funcionalidade que depende dela; não reutilize a migração inicial.

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

Os testes de autenticação verificam normalização de usuário, limites, rejeição de endereços pessoais, mapeamento sem colisões e validação da operação no servidor. A validação local não substitui testar cadastro, entrada e compartilhamento em duas contas reais no projeto Supabase escolhido.

Referências oficiais: [Next.js na Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Autenticação Supabase com Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Apps instaláveis com Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps).
