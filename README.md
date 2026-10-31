# Webchat para DataCrazy

Um chat próprio para o seu site, **conectado ao Multiatendimento do DataCrazy**. O visitante conversa pelo site; a conversa aparece no DataCrazy como mais um canal (junto com WhatsApp e Instagram); o atendente responde de lá e a resposta aparece no site na hora.

- Funciona em qualquer site: HTML, WordPress, Wix, Webflow, Shopify, Google Tag Manager, Next.js… Basta colar **uma linha** de código.
- Roda de graça nos planos gratuitos da **Vercel** e do **Supabase**.
- Tudo se configura por um **painel** (`/admin`), sem mexer em código.

> Projeto **não oficial**. Usa a [Conexão Universal](https://docs.datacrazy.io/universal-connection/overview) e a [API pública](https://docs.datacrazy.io) do DataCrazy. Não tem vínculo com o DataCrazy, a Vercel ou o Supabase.

---

## Sumário

1. [O que ele faz](#o-que-ele-faz)
2. [Como funciona](#como-funciona)
3. [O que você precisa](#o-que-você-precisa)
4. [Instalação passo a passo](#instalação-passo-a-passo)
5. [Configurando pelo painel](#configurando-pelo-painel)
6. [Colando o chat no seu site](#colando-o-chat-no-seu-site)
7. [API JavaScript (opcional)](#api-javascript-opcional)
8. [Solução de problemas](#solução-de-problemas)
9. [Segurança](#segurança)
10. [LGPD](#lgpd)
11. [Limitações conhecidas](#limitações-conhecidas)
12. [Como atualizar](#como-atualizar)
13. [Desenvolvimento local](#desenvolvimento-local)
14. [Créditos e licença](#créditos-e-licença)

---

## O que ele faz

**Para o visitante**

- Bolha flutuante no canto do site (esquerda ou direita), com texto opcional.
- Formulário curto antes da conversa: **nome, e-mail e telefone** (cada um obrigatório, opcional ou oculto), máscara de telefone brasileiro com validação de DDD, número internacional, **caixa de consentimento LGPD** com link para a sua política e proteção anti-robô.
- Conversa em tempo real: horário, status de cada mensagem (enviando / enviada / não enviada com “tentar de novo”), links clicáveis, envio de **imagem, PDF, documentos, áudio e vídeo**.
- Aviso de mensagem nova quando o chat está fechado: contador na bolha, título da aba piscando e som.
- A conversa continua se a página for recarregada. Botão “iniciar nova conversa”.
- Mensagem de boas-vindas, aviso **fora do horário de atendimento**, avatar, cores, tema claro/escuro/automático.
- Tela cheia no celular, acompanhando o teclado. Navegável por teclado e leitores de tela.

**Para a equipe**

- As conversas caem no **Multiatendimento do DataCrazy**, como qualquer outro canal.
- Assim que o formulário é enviado, o webchat dispara **na hora** o webhook de uma automação do DataCrazy com nome, e-mail, telefone, página de origem e UTMs — para criar o lead mesmo que a pessoa não escreva nada.
- Na primeira mensagem, publica uma **anotação interna** na conversa com os dados do formulário (opcional).
- Se o DataCrazy estiver fora do ar, as mensagens **não se perdem**: ficam pendentes e são reenviadas.

**Para quem administra**

- Painel com login (usuários do Supabase), checklist de **Primeiros passos** e botões de copiar em cada valor.
- **Conferir configuração**: o painel lê a Conexão Universal salva no DataCrazy e aponta exatamente o que está errado.
- Aba **Testar**: você finge ser um visitante e vê, passo a passo, o que aconteceu com cada mensagem.
- Aba **Leads**: lista de quem preencheu o formulário, detalhes de cada conversa, exportação em CSV e exclusão de dados (LGPD).

---

## Como funciona

```
 Visitante no SEU SITE
   │  <script src="https://seu-webchat.vercel.app/widget.js" async></script>
   ▼
 widget.js (bolha) ──► iframe isolado: /embed (o chat)
                          │
                          │  HTTP (formulário, mensagens, anexos)
                          ▼
                    Seu webchat na Vercel ─────────────────────────────┐
                     ├─ /api/widget/*        widget                    │
                     ├─ /files/<id>          link permanente do anexo  │
                     ├─ /api/datacrazy/outbound ◄── respostas do atendente
                     └─ /admin               painel                    │
                          │                                            │
                          ▼                                            │
                    Supabase                                           │
                     ├─ Postgres  configurações, conversas, logs       │
                     ├─ Storage   anexos dos visitantes, avatar        │
                     └─ Realtime  entrega a resposta no chat na hora   │
                                                                       │
 DataCrazy ◄───────────────────────────────────────────────────────────┘
   ├─ Conexão Universal: recebe as mensagens do visitante (webhook assinado)
   │                     e chama o webchat quando o atendente responde
   └─ Automação de lead: recebe os dados do formulário na hora
```

O caminho de uma conversa:

1. O visitante preenche o formulário. O webchat cria a sessão e avisa a **automação de lead** do DataCrazy.
2. O visitante escreve. A mensagem é salva e enviada à **URL de Webhook** da Conexão Universal, assinada com HMAC.
3. A conversa aparece no Multiatendimento.
4. O atendente responde. O DataCrazy chama `/api/datacrazy/outbound` com um token; o webchat salva a resposta e a entrega no chat pelo Supabase Realtime.

A cópia das conversas guardada no Supabase serve só para o histórico do chat e para o painel. **O registro oficial das conversas é o DataCrazy.**

---

## O que você precisa

| Conta                             | Para quê                              | Plano                                                        |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| [GitHub](https://github.com)      | Guardar a sua cópia do código         | Grátis                                                       |
| [Vercel](https://vercel.com)      | Hospedar o webchat                    | Hobby (grátis, uso **não comercial**) ou Pro                 |
| [Supabase](https://supabase.com)  | Banco de dados, arquivos e tempo real | Free                                                         |
| [DataCrazy](https://datacrazy.io) | CRM e atendimento                     | Com **Conexão Universal**, **Automações** e acesso à **API** |

Não precisa instalar nada no computador para colocar no ar.

---

## Instalação passo a passo

Tempo estimado: 20 a 30 minutos.

### 1. Copie o código para o seu GitHub

Abra o repositório e clique em **Fork** (canto superior direito). Isso cria uma cópia na sua conta.

### 2. Crie o projeto na Vercel com o banco Supabase

**Opção A — botão de deploy (mais rápido)**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fggg-coder%2Fwebchat-datacrazy&project-name=webchat-datacrazy&repository-name=webchat-datacrazy&env=APP_SECRET&envDescription=Texto%20aleat%C3%B3rio%20com%2032%20ou%20mais%20caracteres.%20Protege%20cookies%20e%20criptografa%20a%20API%20key%20do%20DataCrazy.&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%2C%22protocol%22%3A%22storage%22%7D%5D)

1. Clique no botão, entre com o GitHub e confirme o nome do projeto.
2. Quando a Vercel oferecer o **Supabase**, aceite e crie um banco (plano Free). As chaves do Supabase entram sozinhas no projeto.
3. Ela vai pedir o **`APP_SECRET`**. Gere um texto aleatório com 32 caracteres ou mais — por exemplo, no terminal: `openssl rand -base64 32`, ou num gerador de senhas (use letras e números, sem espaços). **Guarde esse valor**: se ele mudar, a API key do DataCrazy precisa ser cadastrada de novo.
4. Clique em **Deploy** e espere terminar.

> O botão só funciona com repositório **público**. Se o seu fork for privado, use a opção B. Se a etapa do Supabase não aparecer, siga a opção B a partir do item 2.

**Opção B — passo a passo manual**

1. Na Vercel: **Add New → Project**, escolha o seu fork e clique em **Deploy** (o primeiro deploy pode falhar por falta de variáveis; tudo bem).
2. No projeto da Vercel: **Storage → Create Database → Supabase** (Marketplace). Isso cria o banco e as variáveis do Supabase automaticamente.
   - Se preferir um projeto Supabase criado à mão, copie de **Supabase → Project Settings → API** e cadastre as variáveis da tabela abaixo.
3. Em **Settings → Environment Variables**, cadastre o `APP_SECRET`.
4. Em **Deployments**, clique em **⋯ → Redeploy**.

### Variáveis de ambiente

Só o `APP_SECRET` é sempre manual. Todo o resto (API key do DataCrazy, URLs, aparência…) é configurado no painel e fica salvo no banco.

> **Como gerar o `APP_SECRET`:** no painel, em **Início → Detalhes → Gerar APP_SECRET** (o valor é criado no seu navegador e não é enviado a lugar nenhum), ou no terminal com `openssl rand -base64 48`. Guarde uma cópia: trocar o valor obriga a cadastrar de novo a API key do DataCrazy.

| Variável                    | Obrigatória | O que é                                                                                                                    |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `APP_SECRET`                | Sim         | Texto aleatório com 32+ caracteres. Assina cookies e tokens e criptografa a API key do DataCrazy no banco.                 |
| `SUPABASE_URL`              | Sim\*       | Endereço do projeto Supabase.                                                                                              |
| `SUPABASE_ANON_KEY`         | Sim\*       | Chave pública do Supabase (usada pelo chat para receber respostas em tempo real).                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim\*       | Chave de serviço do Supabase (secreta; só o servidor usa).                                                                 |
| `POSTGRES_URL_NON_POOLING`  | Não\*       | Conexão direta com o banco. Com ela, o painel cria as tabelas com um clique.                                               |
| `CRON_SECRET`               | Recomendada | Protege a rotina de reenvio (`/api/cron/retry`). A Vercel envia esse valor sozinha nas execuções agendadas.                |
| `APP_URL`                   | Não         | Endereço público do webchat. Só se usar domínio próprio ou rodar fora da Vercel (na Vercel o domínio é detectado sozinho). |

\* Criadas automaticamente pela integração Supabase da Vercel. O app também aceita os nomes `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` e `POSTGRES_URL`.

O modelo comentado está em [`.env.example`](.env.example).

### 3. Crie as tabelas no banco

Escolha **uma** das formas:

- **Pelo painel** (se `POSTGRES_URL_NON_POOLING` existir): no passo 5, ao abrir `/admin`, clique em **Criar tabelas**.
- **Pelo SQL Editor do Supabase**: abra **Supabase → SQL Editor**, cole o conteúdo de cada arquivo de [`supabase/migrations/`](supabase/migrations) **na ordem** (`0001_…`, `0002_…`, `0003_…`) e clique em **Run** em cada um.
- **Pela linha de comando**: `supabase link --project-ref <seu-projeto>` e `supabase db push`.

Os scripts podem ser rodados de novo sem problema.

### 4. Crie o seu usuário do painel e feche o cadastro público

O login do painel usa o **Supabase Auth** (e-mail e senha).

1. **Supabase → Authentication → Users → Add user → Create new user**. Informe e-mail e senha e marque **Auto Confirm User**.
2. **Supabase → Authentication → Sign In / Providers**: **desligue “Allow new users to sign up”** e salve.

> **Por que o passo 2 é obrigatório?** A chave pública do Supabase vai dentro do chat, no seu site. Com o cadastro público ligado, qualquer pessoa poderia criar uma conta e entrar no painel. Por isso o painel **se recusa a funcionar** enquanto o cadastro estiver aberto.

Crie quantos usuários quiser para a sua equipe — todos entram com e-mail e senha.

### 5. Abra o painel

Acesse `https://<seu-projeto>.vercel.app/admin`, entre com o usuário do passo 4 e siga os **Primeiros passos**.

---

## Configurando pelo painel

### Início

Mostra se o servidor e o banco estão prontos e um checklist com o que falta: dados da empresa, API key, Conexão Universal, automação de lead, aparência e instalação no site.

### Conexão DataCrazy

Siga os passos na ordem. A tabela completa, campo a campo, está em [`docs/datacrazy-setup.md`](docs/datacrazy-setup.md).

1. **API key** — gere em [crm.datacrazy.io/config/api](https://crm.datacrazy.io/config/api) e cole a chave **inteira, com o prefixo `dc_`**. O painel testa a chave e só então salva (criptografada). Depois escolha **qual conexão é a do webchat** (botão “Atualizar lista” se ela acabou de ser criada).
2. **Conexão Universal · aba Envio** — no DataCrazy: **Configurações → Conexões → Nova Conexão → Conexão Universal**. O painel lista os valores **na mesma ordem da tela do DataCrazy**: URL Base, Endpoint de Envio de Texto, Autenticação, Credenciais, Headers, Parâmetros de Query, Mapeamento de Resposta e Endpoints Adicionais.
3. **Conexão Universal · aba Recebimento** — mapeamento de campos, validação do webhook e filtros, também na ordem da tela. Clique em **Finalizar** no DataCrazy.
4. **Conferir a configuração** — o painel lê a conexão salva no DataCrazy e compara mais de 20 itens: URL Base, caminhos, templates, token, mapeamentos, header de assinatura (inclusive caracteres invisíveis), algoritmo, segredo e filtros. Os segredos são comparados no servidor e nunca aparecem na tela.
5. **URL de Webhook** — preenchida automaticamente a partir da conexão escolhida. O botão **Salvar e enviar mensagem de teste** manda uma mensagem fictícia (“Teste do Webchat”): confira se ela aparece no Multiatendimento.
6. **Automação de lead (recomendado)** — veja abaixo.
7. **Anotação interna** — liga/desliga a anotação com os dados do formulário na primeira mensagem (precisa da API key).

#### Automação de lead

No DataCrazy, crie uma automação com gatilho **Webhook**, copie a URL dela e cole no passo 6 do painel. Quando o visitante envia o formulário, o webchat chama essa URL **na hora** com estes campos no corpo:

| Campo                                                                 | Exemplo                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `evento`                                                              | `webchat_formulario`                                                        |
| `contactId`                                                           | ID do visitante — **o mesmo ID do contato da conversa no Multiatendimento** |
| `nome`                                                                | `Maria Silva`                                                               |
| `email`                                                               | `maria@exemplo.com`                                                         |
| `telefone`                                                            | `+55 (11) 91234-5678`                                                       |
| `telefoneNumeros`                                                     | `5511912345678`                                                             |
| `origem`                                                              | `Webchat` (configurável em Configurações)                                   |
| `paginaOrigem`                                                        | Página do site onde o chat foi aberto                                       |
| `referrer`                                                            | De onde o visitante veio                                                    |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | UTMs da página                                                              |
| `consentimentoVersao`, `consentimentoEm`                              | Registro do aceite LGPD                                                     |
| `criadoEm`                                                            | Data e hora do envio do formulário                                          |

Use esses campos nos blocos do fluxo (por exemplo, “Criar lead”: nome ← `nome`, e-mail ← `email`, telefone ← `telefone`, origem ← `origem`).

Além disso, **toda mensagem do chat** leva os mesmos dados dentro de `lead.*` (`lead.nome`, `lead.email`, `lead.telefoneNumeros`…), disponíveis para automações com gatilho **Mensagem Recebida**.

> **Importante:** um fluxo com gatilho **Webhook** roda fora de qualquer conversa (no registro de execução do DataCrazy o `contactId` aparece vazio). Para **ligar o lead à conversa** do Multiatendimento, use também uma automação com gatilho **Mensagem Recebida**, que roda dentro da conversa — por exemplo, localizando o lead pelo telefone (`lead.telefoneNumeros`) ou e-mail.

### Testar

Um chat de verdade dentro do painel. Preencha o formulário como se fosse um lead e converse. Ao lado aparece **o que aconteceu** em cada etapa: formulário recebido, lead enviado à automação, cada mensagem entregue (ou pendente/falhou, com o motivo), respostas e anotação interna.

O botão **Simular resposta do atendente** entrega uma resposta no chat de teste pelo mesmo caminho que o DataCrazy usa — útil enquanto o DataCrazy ainda não alcança o webchat. Ele só funciona em conversas abertas por essa aba.

### Leads

Lista de quem preencheu o formulário (nome, e-mail, telefone, página, data), com o histórico de cada conversa (somente leitura — o atendimento é feito no DataCrazy), **exportação em CSV** e **exclusão dos dados** de um visitante.

### Aparência

Nome e subtítulo do chat, avatar (recortado em quadrado automaticamente), cor principal e cor do texto, posição, tema, texto do botão, abertura automática, mensagem de boas-vindas e mensagem fora do horário. A **prévia** atualiza enquanto você edita. No site, as mudanças aparecem em até 1 minuto depois de salvar.

### Formulário e horário

- Cada campo (nome, e-mail, telefone) pode ser obrigatório, opcional ou não perguntado. DDI padrão (55 = Brasil).
- Texto da caixa de consentimento e **versão do texto** — mude a versão sempre que alterar o texto ou a política.
- Horário de atendimento por dia da semana e fuso horário. Fora do horário o chat continua funcionando, mas mostra a mensagem de fora do horário.

### Instalar no site

Endereços do seu site (só eles podem mostrar o chat), o código para colar e o passo a passo por plataforma.

### Configurações

Nome da empresa, site, política de privacidade, origem do lead, anexos (liga/desliga e tamanho máximo) e retenção de dados.

---

## Colando o chat no seu site

### 1. Cadastre os endereços do site

Em **Instalar no site**, informe um endereço por linha. Inclua **as versões com e sem `www`** e o endereço de testes, se houver:

```
https://www.seusite.com.br
https://seusite.com.br
```

Use `https://*.seusite.com.br` para todos os subdomínios. Sem nenhum endereço cadastrado, qualquer site consegue mostrar o seu chat (o painel avisa).

### 2. Cole o código

```html
<script src="https://<seu-projeto>.vercel.app/widget.js" async></script>
```

| Plataforma         | Onde colar                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| HTML puro          | Antes de `</body>` em todas as páginas (ou no template comum).                                                               |
| WordPress          | Instale o plugin **WPCode** → Code Snippets → Header & Footer → campo **Footer** → Salvar.                                   |
| Wix                | Configurações do site → Avançado → **Código personalizado** → + Adicionar código → “Todas as páginas”, posição “Body - fim”. |
| Webflow            | Site settings → **Custom code** → Footer code → Save → Publish.                                                              |
| Shopify            | Loja virtual → Temas → ⋯ → **Editar código** → `layout/theme.liquid` → antes de `</body>` → Salvar.                          |
| Google Tag Manager | Nova tag → **HTML personalizado** → cole o código → acionador **All Pages** → Salvar → Enviar/Publicar.                      |

### Opções no `<script>`

| Atributo        | Exemplo           | Efeito                                                  |
| --------------- | ----------------- | ------------------------------------------------------- |
| `data-position` | `left` ou `right` | Lado da tela (vence o painel).                          |
| `data-color`    | `#ff6600`         | Cor principal (vence o painel).                         |
| `data-text`     | `Fale conosco`    | Texto do botão.                                         |
| `data-open`     | `5`               | Abre sozinho depois de 5 segundos (uma vez por visita). |

```html
<script src="https://<seu-projeto>.vercel.app/widget.js" data-position="left" data-text="Fale conosco" async></script>
```

---

## API JavaScript (opcional)

```js
window.DCWebchat.open(); // abre o chat
window.DCWebchat.close(); // fecha
window.DCWebchat.toggle(); // alterna
// Pula o formulário quando o site já sabe quem é o visitante (ex.: usuário logado):
window.DCWebchat.identify({ name: "Maria Silva", email: "maria@exemplo.com", phone: "+55 11 91234-5678" });
```

Eventos disparados na página (úteis para registrar conversões no Meta Pixel, Google Ads ou GTM):

```js
window.addEventListener("dcwebchat:open", () => {});
window.addEventListener("dcwebchat:close", () => {});
window.addEventListener("dcwebchat:lead", () => {
  // formulário enviado
});
```

Os eventos não carregam dados pessoais. Com `identify()`, o consentimento é registrado como “dados informados pelo site”: garanta que o seu site coletou esse consentimento.

---

## Solução de problemas

Comece sempre por **Conexão DataCrazy → Conferir configuração** e pela aba **Testar**.

### A mensagem do visitante não chega no DataCrazy

O DataCrazy responde “sucesso” **mesmo quando descarta** a mensagem, então não confie só na resposta HTTP.

1. Na aba **Testar**, veja o motivo ao lado da mensagem. HTTP 404 normalmente é URL de Webhook errada — use **Conferir configuração**, que preenche a URL certa sozinha.
2. **Segredo de Validação** diferente do painel: o DataCrazy descarta tudo sem avisar. Copie de novo com o botão Copiar.
3. **Header de Assinatura** colado com caracteres invisíveis: apague e **digite** `X-Webchat-Signature`. O “Conferir configuração” detecta isso.
4. Veja a aba **Logs** da Conexão Universal no DataCrazy (`INVALID_SIGNATURE`, por exemplo). **Os logs de lá somem depois de 1 hora.**
5. A conexão precisa estar com **Habilitar recebimento de mensagens** ligado.

### A resposta do atendente não aparece no site

1. **URL Base** com `localhost` ou endereço interno: o DataCrazy não alcança. Use o endereço público (`https://<seu-projeto>.vercel.app`).
2. **Credencial `token`** diferente do painel: o webchat recusa com 401. Copie de novo.
3. Clique em **Testar Conexão** no DataCrazy: deve responder sucesso.
4. Para testar só o lado do site, use **Simular resposta do atendente** na aba Testar.

### O lead chega sem e-mail ou telefone

A Conexão Universal só transporta ID e nome do contato. E-mail e telefone chegam pela **automação de lead** (webhook do formulário) e pelo bloco `lead.*` das mensagens. Confira se a automação existe e se os campos estão mapeados nos blocos do fluxo. A anotação interna também mostra os dados dentro da conversa.

### Erro 429 / “Muitas tentativas”

- **No painel:** o login bloqueia depois de várias senhas erradas em 15 minutos. Espere e tente de novo.
- **No chat:** o visitante enviou mensagens ou arquivos rápido demais; ele pode tentar de novo em instantes.
- **API do DataCrazy:** o limite observado é de cerca de 30 chamadas por minuto por conta. O webchat respeita o `Retry-After` e reenvia depois.

### O chat abre em branco no site

O endereço do site não está em **Instalar no site**. Quem bloqueia é o navegador (`Content-Security-Policy: frame-ancestors`), e o erro aparece só no Console do navegador (“Refused to frame…”). Cadastre o endereço **exato**, com `https://`, com e sem `www`, e espere até 1 minuto.

### Não consigo entrar no painel

- “E-mail ou senha incorretos”: confira o usuário em Supabase → Authentication → Users (precisa estar confirmado).
- Aviso de **cadastro público**: desligue “Allow new users to sign up” no Supabase (passo 4 da instalação).

### O painel diz que faltam variáveis ou tabelas

Veja o card **Instalação** no Início: ele lista cada variável. Depois de cadastrar variáveis na Vercel, faça **Redeploy**.

---

## Segurança

- **API key do DataCrazy, token de envio e segredo do webhook** ficam criptografados no banco (AES-256-GCM, chave derivada do `APP_SECRET`) e nunca vão para o navegador.
- **Banco fechado:** todas as tabelas têm RLS ligado e nenhuma permissão para a chave pública. O chat não acessa o banco diretamente: tudo passa pelas rotas do servidor.
- **Tempo real sem exposição:** cada conversa usa um canal de Realtime com nome derivado por HMAC, impossível de adivinhar; a tabela de mensagens nunca é exposta. O aviso do Realtime só faz o chat buscar as mensagens de novo pela API (com o token da sessão): o conteúdo nunca vem do canal.
- **Webhook assinado** (HMAC-SHA256) e **token** comparado em tempo constante no endpoint chamado pelo DataCrazy.
- **Painel:** login pelo Supabase Auth (só e-mail e senha; login anônimo é recusado), cookies `httpOnly` e `SameSite=Strict`, checagem de origem nas rotas de escrita, bloqueio enquanto o cadastro público estiver ligado. Cada rota do painel confere a sessão por conta própria, além do `proxy.ts`. O painel não pode ser exibido dentro de outro site (`frame-ancestors 'none'`).
- **URLs de webhook só do DataCrazy:** o servidor só envia para `https://….datacrazy.io` e não segue redirecionamentos (em desenvolvimento, `localhost` também é aceito).
- **Sessão do visitante:** token assinado, enviado só no header (nunca na URL), válido por 180 dias.
- **Conversas da aba Testar** são marcadas pelo servidor com um token do painel; um visitante não consegue se passar por teste.
- **Limites de uso:** login (por IP, por IP+e-mail e por e-mail, contando só as falhas), criação de sessões por IP, mensagens e reenvios por sessão, uploads por sessão e por IP.
- **Chat isolado** num iframe, com `Content-Security-Policy` e `frame-ancestors` restritos aos domínios cadastrados (se a lista não puder ser lida, só o próprio webchat pode mostrar o chat).
- **Mensagens renderizadas como texto** (sem HTML); links abrem em nova aba com `rel="noopener noreferrer"`.
- **Uploads:** só tipos permitidos (imagens, PDF, Office, texto, áudio e vídeo MP4 — nada executável), cada um gravado com extensão fixa; tamanho e tipo conferidos no arquivo realmente gravado; arquivos enviados e nunca usados numa mensagem são apagados depois de 1 hora pela rotina de limpeza.
- **Logs** guardam só a estrutura das requisições, nunca o conteúdo das mensagens; respostas da API do DataCrazy têm os segredos removidos antes de qualquer registro.

> Os limites por IP confiam no IP informado pela Vercel (`x-vercel-forwarded-for`). Fora da Vercel, use um proxy que reescreva `x-real-ip`/`x-forwarded-for`; caso contrário esses limites podem ser burlados.

Encontrou uma falha? Não abra issue pública: fale com os mantenedores em privado.

---

## LGPD

> Este texto explica o que o software faz. Não é orientação jurídica.

- **Consentimento:** a caixa começa desmarcada. Cada aceite é gravado com a **hora do servidor**, o **texto exato** exibido e a **versão** configurada no painel.
- **Dados guardados:** nome, e-mail, telefone, página de origem (só endereço e caminho, sem parâmetros da URL), site de onde o visitante veio (só o domínio), UTMs, navegador resumido (ex.: “Chrome · Android”) e as mensagens.
- **`DCWebchat.identify()`** pula o formulário e a caixa de aceite: use só se o seu site já coletou o consentimento do visitante. O registro fica com a versão `identify`.
- **A cópia local** serve só para o histórico do chat e para o painel. **O registro oficial das conversas fica no DataCrazy**, que segue as regras da sua conta.
- **Retenção:** em Configurações, defina em quantos dias as conversas guardadas no webchat são apagadas, com os arquivos (0 = não apagar). A limpeza roda na rotina agendada (precisa de `CRON_SECRET`) ou no botão **Reprocessar pendentes** da aba Leads.
- **Exclusão a pedido:** na aba Leads, apague os dados de um visitante. Os anexos dele deixam de abrir, inclusive no DataCrazy.
- Publique uma política de privacidade que cite o webchat, o DataCrazy, a Vercel e o Supabase como operadores, e coloque o link dela em Configurações.

---

## Limitações conhecidas

- **Vercel Hobby é para uso não comercial.** Para uso comercial, use o plano Pro.
- **Reenvios:** cada mensagem é tentada na hora (várias vezes); o que continuar pendente é reprocessado pela rotina agendada `/api/cron/retry`. No plano Hobby, a Vercel só permite **uma execução por dia**, então reenvios depois de uma queda longa do DataCrazy podem demorar até o dia seguinte. No Pro dá para rodar com mais frequência.
- **Logs do DataCrazy duram 1 hora.** O histórico de integração do próprio webchat fica 7 dias.
- **Sem nome do atendente nem “atendimento finalizado” no chat**, de propósito: o DataCrazy não avisa esses eventos e descobrir exigiria consultar a API sem parar.
- **Limite da API do DataCrazy:** cerca de 30 chamadas por minuto por conta (observado). Afeta a anotação interna e a conferência da configuração, não o envio de mensagens.
- **Vínculo lead ↔ conversa** depende de uma automação “Mensagem Recebida” no DataCrazy (veja a seção da automação de lead).
- **Ambientes:** testes locais e produção apontando para o mesmo projeto Supabase compartilham configuração e conversas. Use projetos Supabase separados.
- **CSP do chat** usa `'unsafe-inline'` para scripts (necessário para o Next.js sem nonce). Um CSP com nonce é melhoria futura.

---

## Como atualizar

1. No seu fork no GitHub, clique em **Sync fork → Update branch**. A Vercel publica a nova versão sozinha.
2. **Suas configurações não se perdem**: elas ficam no banco, não no código.
3. Se a atualização trouxer arquivos novos em `supabase/migrations/`, aplique-os: pelo botão **Criar tabelas** no Início do painel (aplica só o que falta) ou colando os arquivos novos no SQL Editor, na ordem.

---

## Desenvolvimento local

Precisa de Node 22+ e pnpm.

```bash
pnpm install
cp .env.example .env.local   # preencha com um projeto Supabase de desenvolvimento
pnpm dev                     # http://localhost:3000/admin
```

| Comando                        | O que faz                               |
| ------------------------------ | --------------------------------------- |
| `pnpm dev`                     | App em http://localhost:3000            |
| `/demo.html`                   | Página de exemplo com o snippet do chat |
| `pnpm lint` / `pnpm typecheck` | ESLint e TypeScript                     |
| `pnpm format`                  | Prettier                                |

Estrutura principal:

```
public/widget.js            loader do chat (vanilla, sem dependências)
src/app/embed/              o chat (iframe)
src/app/admin/              o painel
src/app/api/widget/         rotas usadas pelo chat
src/app/api/datacrazy/      rota chamada pelo DataCrazy (outbound)
src/app/api/admin/          rotas do painel
src/lib/datacrazy/          cliente da API, webhook, outbound, conferência da conexão
supabase/migrations/        tabelas, funções e buckets
docs/                       guia da Conexão Universal
```

Mais detalhes em [`docs/datacrazy-setup.md`](docs/datacrazy-setup.md) (campo a campo e contratos JSON). Para testar o chat sem o DataCrazy, use a aba **Testar** do painel (resposta simulada do atendente).

---

## Créditos e licença

- Inspirado em e com trechos adaptados de [datacrazy-webchat-template](https://github.com/Powleiner/datacrazy-webchat-template) — MIT © 2026 Cristiano Alves — incluindo achados práticos sobre a Conexão Universal.
- Construído com Next.js, Supabase, Tailwind CSS e Zod.

Licença [MIT](LICENSE).
