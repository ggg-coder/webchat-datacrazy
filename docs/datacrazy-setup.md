# Conexão Universal do DataCrazy — campo a campo

Este guia lista **todos os campos da Conexão Universal na mesma ordem em que aparecem na tela do DataCrazy**. O painel do webchat (`/admin/conexao`) mostra os mesmos valores com botão de copiar — prefira copiar de lá, porque o token e o segredo são gerados para a sua instalação.

> Os textos cinza que já aparecem nos campos do DataCrazy (`from`, `text`, `message_id`, `X-Signature`...) são **apenas exemplos**. Substitua todos.

Para criar: **Configurações → Conexões → Nova Conexão → Conexão Universal**. Dê um nome, por exemplo “Webchat do site”.

---

## Aba Envio (o DataCrazy chamando o webchat)

| Campo        | Valor                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL Base** | O endereço público do seu webchat, sem barra no fim. Ex.: `https://meu-webchat.vercel.app`. **Não use `localhost`**: o DataCrazy não alcança a sua máquina. |

### Endpoint de Envio de Texto

| Campo            | Valor                                  |
| ---------------- | -------------------------------------- |
| Método           | `POST`                                 |
| Caminho          | `/api/datacrazy/outbound`              |
| Template do Body | ver abaixo (template de texto)         |
| Content-Type     | `application/json` (já vem preenchido) |
| Timeout (ms)     | `30000` (deixe como está)              |

Template de texto:

```json
{ "type": "text", "visitorId": "${contact.contactId}", "text": "${message.body}", "dcMessageId": "${message.id}" }
```

### Autenticação

| Campo                 | Valor          |
| --------------------- | -------------- |
| Tipo de Autenticação  | `Bearer Token` |
| Chave do Bearer Token | `token`        |

### Credenciais

| Nome da variável | Valor                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `token`          | O **token de envio** gerado pelo painel (Conexão DataCrazy → passo 2 → Credenciais → Valor). |

### Headers e Parâmetros de Query

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| Headers             | Deixe só o `Content-Type: application/json` que já vem. |
| Parâmetros de Query | Deixe vazio.                                            |

### Mapeamento de Resposta

| Campo                     | Valor |
| ------------------------- | ----- |
| Caminho do ID da Mensagem | `id`  |
| Caminho do Sucesso        | `ok`  |

### Endpoints Adicionais

Clique em **Adicionar Endpoint** (para respostas do atendente com imagem, PDF, áudio):

| Campo            | Valor                           |
| ---------------- | ------------------------------- |
| Nome do Endpoint | `Anexos`                        |
| Tipos de Anexo   | `Todos`                         |
| Método           | `POST`                          |
| Caminho          | `/api/datacrazy/outbound`       |
| Template do Body | ver abaixo (template de anexos) |

Template de anexos:

```json
{
  "type": "attachment",
  "visitorId": "${contact.contactId}",
  "text": "${message.body}",
  "dcMessageId": "${message.id}",
  "attachment": { "url": "${attachment.url}", "mimeType": "${attachment.mimeType}", "filename": "${attachment.filename}" }
}
```

Depois clique em **Testar Conexão** no DataCrazy. O webchat responde `{"ok":true,...}` mesmo para o contato fictício do teste.

---

## Aba Recebimento (o webchat chamando o DataCrazy)

| Campo                              | Valor  |
| ---------------------------------- | ------ |
| Habilitar recebimento de mensagens | Ligado |

### Mapeamento de Campos

| Campo                             | Valor                         |
| --------------------------------- | ----------------------------- |
| Caminho do ID do Contato          | `contact.id`                  |
| Caminho do Corpo da Mensagem      | `message.text`                |
| Caminho do ID da Mensagem         | `message.id`                  |
| Caminho do Nome do Contato        | `contact.name`                |
| Caminho do Timestamp              | `message.timestamp`           |
| Caminho do ID Externo da Mensagem | _(deixe vazio)_               |
| Caminho da URL do Anexo           | `message.attachment.url`      |
| Caminho do Tipo do Anexo          | `message.attachment.mimeType` |
| Caminho do From Me                | `contact.isAgent`             |

### Validação do Webhook

| Campo                | Valor                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header de Assinatura | `X-Webchat-Signature` — **digite letra por letra**. Texto colado pode trazer caracteres invisíveis, e aí o DataCrazy recusa a assinatura sem avisar. |
| Algoritmo            | `hmac-sha256`                                                                                                                                        |
| Segredo de Validação | O **segredo do webhook** gerado pelo painel.                                                                                                         |

### Filtros

| Campo                      | Valor             |
| -------------------------- | ----------------- |
| Campo Obrigatório          | `message.id`      |
| Ignorar Mensagens Próprias | `contact.isAgent` |

Clique em **Finalizar**. Volte ao painel e use **Conferir configuração** (passo 4): o painel lê o que foi salvo no DataCrazy, compara campo por campo e preenche sozinho a **URL de Webhook**.

---

## Contratos (para quem quer entender ou depurar)

### O que o webchat envia para a URL de Webhook (mensagem do visitante)

Header `X-Webchat-Signature: sha256=<HMAC-SHA256 do corpo com o segredo do webhook>`.

```json
{
  "event": "message",
  "message": {
    "id": "msg_<uuid>",
    "text": "Olá, quero um orçamento",
    "timestamp": 1793448010,
    "attachment": { "url": "https://<seu-webchat>/files/<id>?sig=<assinatura>", "mimeType": "image/png" }
  },
  "contact": { "id": "<visitorId>", "name": "Maria Silva", "isAgent": false },
  "lead": {
    "contactId": "<visitorId>",
    "nome": "Maria Silva",
    "email": "maria@exemplo.com",
    "telefone": "+55 (11) 91234-5678",
    "telefoneNumeros": "5511912345678",
    "origem": "Webchat",
    "paginaOrigem": "https://www.seusite.com.br/precos",
    "referrer": "https://www.google.com/",
    "utm_source": "google",
    "utm_medium": "",
    "utm_campaign": "",
    "utm_content": "",
    "utm_term": "",
    "consentimentoVersao": "1",
    "consentimentoEm": "2026-10-31T12:00:00.000Z",
    "criadoEm": "2026-10-31T12:00:00.000Z"
  }
}
```

- `attachment` só aparece quando há arquivo. Mensagem **só com anexo** leva o **nome do arquivo** em `text`.
- O bloco `lead` não é mapeado pela conexão, mas chega inteiro às automações com gatilho **Mensagem Recebida**.
- O link do anexo é permanente (o DataCrazy não copia arquivos, só guarda o link) e para de funcionar quando os dados do visitante são apagados.

### O que o webchat envia para o webhook da automação de lead (formulário enviado)

Disparado na hora em que o visitante envia o formulário, antes de qualquer mensagem. Mesma assinatura no header.

```json
{
  "evento": "webchat_formulario",
  "contactId": "<visitorId>",
  "nome": "Maria Silva",
  "email": "maria@exemplo.com",
  "telefone": "+55 (11) 91234-5678",
  "telefoneNumeros": "5511912345678",
  "origem": "Webchat",
  "paginaOrigem": "https://www.seusite.com.br/precos",
  "referrer": "",
  "utm_source": "",
  "utm_medium": "",
  "utm_campaign": "",
  "utm_content": "",
  "utm_term": "",
  "consentimentoVersao": "1",
  "consentimentoEm": "2026-10-31T12:00:00.000Z",
  "criadoEm": "2026-10-31T12:00:00.000Z"
}
```

> Um fluxo com gatilho **Webhook** roda fora de qualquer conversa (no registro de execução do DataCrazy, `contactId` aparece vazio). Para ligar o lead à conversa do Multiatendimento, use também uma automação com gatilho **Mensagem Recebida**, que roda dentro da conversa e recebe os mesmos dados em `lead.*`.

### O que o DataCrazy envia para `/api/datacrazy/outbound` (resposta do atendente)

`Authorization: Bearer <token de envio>`.

Texto:

```json
{ "type": "text", "visitorId": "<visitorId>", "text": "Oi! Como posso ajudar?", "dcMessageId": "<id no DataCrazy>" }
```

Anexo:

```json
{
  "type": "attachment",
  "visitorId": "<visitorId>",
  "text": "",
  "dcMessageId": "<id>",
  "attachment": { "url": "https://...", "mimeType": "image/jpeg", "filename": "foto.jpg" }
}
```

Respostas do webchat:

| Situação                                                     | HTTP | Corpo                                         |
| ------------------------------------------------------------ | ---- | --------------------------------------------- |
| Mensagem salva e entregue ao visitante                       | 200  | `{"ok":true,"id":"<id>"}`                     |
| Mesmo `dcMessageId` de novo (reenvio)                        | 200  | `{"ok":true,"id":"<mesmo id>"}` (não duplica) |
| Contato desconhecido (ex.: “Testar Conexão”, sessão apagada) | 200  | `{"ok":true,"id":"ignored_..."}`              |
| Token errado                                                 | 401  | `{"ok":false,"error":"unauthorized"}`         |
| Corpo inválido                                               | 400  | `{"ok":false,"error":"..."}`                  |

Detalhes de robustez:

- `${attachment.*}` não é escapado pelo DataCrazy; se um nome de arquivo com aspas quebrar o JSON, o webchat recupera os campos mesmo assim.
- Se `${message.id}` chegar vazio ou sem substituição, o webchat gera um ID a partir do contato, do texto e de uma janela de 2 minutos: reenvios imediatos não duplicam e respostas diferentes não se perdem.
- O log de integração guarda só a **estrutura** do pedido (ex.: `"text":"<texto:13>"`), nunca o conteúdo.
