# IAE WhatsApp Hub — Runbook: Novos Apps e Migrações

Documento operacional para **adicionar apps**, **migrar apps existentes** e **diagnosticar falhas**.

**Complementa:** [IAE-WHATSAPP-HUB.md](./IAE-WHATSAPP-HUB.md) (especificação técnica e arquitetura).

**Hub em produção:** `https://iae-whatsapp-hub-production.up.railway.app`

---

## 1. Visão geral

```
Meta (app IAE Produtos — uma URL de webhook)
        │
        ▼
IAE WhatsApp Hub   GET/POST /webhooks/whatsapp
        │
        ├── phone_number_id 1177824065415495  ──►  PostMais  /api/webhook/whatsapp
        ├── phone_number_id 1006339629228046  ──►  Zazmax    /api/webhooks/whatsapp
        └── phone_number_id {NOVO_ID}         ──►  AppN      /api/webhook/whatsapp
```

| Camada | Responsabilidade |
|--------|------------------|
| **Meta** | Entrega eventos; exige uma Callback URL por app |
| **Hub** | Verify GET, extrai `phone_number_id`, responde 200, encaminha POST |
| **App destino** | Processa mensagens; valida secret e filtra pelo próprio número |

**Importante:** trocar a URL na Meta é **uma operação única** para todo o WABA. Novos apps **não** exigem nova URL na Meta — basta adicionar rota no Hub.

---

## 2. Referência rápida de variáveis

### 2.1 Hub (Railway — `iae-whatsapp-hub`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `VERIFY_TOKEN` | Sim | Igual ao painel Meta (ex.: `zazmax-wa-2026-xK9mP2`) |
| `WHATSAPP_FORWARD_SECRET` | Sim | Secret repassado no header `x-webhook-forward-secret` |
| `ROUTES_JSON` | Sim | Mapa `phone_number_id → URL destino` |
| `META_APP_SECRET` | Recomendado | App Secret do IAE Produtos; valida assinatura Meta |
| `ROUTES_ADMIN_TOKEN` | Não | Protege `GET /routes` (Bearer token) |
| `FORWARD_TIMEOUT_MS` | Não | Default `12000` (12 s) |

**`ROUTES_JSON` atual (produção):**

```json
{
  "1177824065415495": "https://postmais-production.up.railway.app/api/webhook/whatsapp",
  "1006339629228046": "https://zazmax-production.up.railway.app/api/webhooks/whatsapp"
}
```

**Formato no Railway:** uma linha, sem quebras:

```
{"1177824065415495":"https://postmais-production.up.railway.app/api/webhook/whatsapp","1006339629228046":"https://zazmax-production.up.railway.app/api/webhooks/whatsapp"}
```

**Alternativa por variável:**

```
ROUTE_1177824065415495=https://postmais-production.up.railway.app/api/webhook/whatsapp
ROUTE_1006339629228046=https://zazmax-production.up.railway.app/api/webhooks/whatsapp
```

### 2.2 App destino (PostMais, Zazmax, novos apps)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PHONE_NUMBER_ID` | Sim | ID Meta do número WhatsApp deste app |
| `WHATSAPP_FORWARD_SECRET` | Sim | **Mesmo valor** do Hub |
| `VERIFY_TOKEN` | Legado | Só usado se o app receber GET direto da Meta (não necessário após migração) |

### 2.3 Painel Meta (app IAE Produtos)

| Campo | Valor |
|-------|-------|
| Callback URL | `https://iae-whatsapp-hub-production.up.railway.app/webhooks/whatsapp` |
| Verify Token | Mesmo `VERIFY_TOKEN` do Hub |
| Campos subscribed | `messages` (+ demais já em uso) |

---

## 3. Contrato do app destino

Todo app que recebe webhooks **via Hub** deve implementar:

### Endpoints

| Método | Path recomendado | Função |
|--------|------------------|--------|
| `POST` | `/api/webhook/whatsapp` | Receber payload encaminhado pelo Hub |
| `GET` | `/api/webhook/whatsapp` | Opcional (só se receber Meta direto) |
| `GET` | `/api/health/whatsapp` | Recomendado — diagnóstico de recebimento |

> **PostMais** usa `/api/webhook/whatsapp` (singular).  
> **Zazmax** usa `/api/webhooks/whatsapp` (plural). Novos apps: preferir padrão PostMais.

### Validação no POST

```javascript
// 1. Secret do forward (obrigatório em produção)
function isAuthorizedForward(req) {
  const secret = process.env.WHATSAPP_FORWARD_SECRET;
  if (!secret) return true;
  return req.get('x-webhook-forward-secret') === secret;
}

// 2. Filtrar pelo número deste app
const phoneNumberId =
  body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
if (phoneNumberId !== process.env.PHONE_NUMBER_ID) {
  return; // ignorar silenciosamente ou log warn
}
```

### Resposta HTTP

- Responder **200** rapidamente à requisição do Hub (processamento assíncrono).
- O Hub **não reenvia** se o destino falhar após já ter respondido 200 à Meta.

---

## 4. Procedimento: adicionar app NOVO

Use quando o app **ainda não existe** no ecossistema ou **nunca recebeu** webhooks WhatsApp.

### 4.1 Pré-requisitos

- [ ] Número WhatsApp registrado no WABA **IAE Produtos** (Meta)
- [ ] App deployado com endpoint POST de webhook
- [ ] `PHONE_NUMBER_ID` obtido (Meta Business → WhatsApp → API Setup, ou logs do Hub)

### 4.2 No app novo

1. Implementar `POST /api/webhook/whatsapp` conforme seção 3.
2. Configurar variáveis Railway:
   ```
   PHONE_NUMBER_ID={ID_META_DO_NUMERO}
   WHATSAPP_FORWARD_SECRET={MESMO_VALOR_DO_HUB}
   ```
3. (Recomendado) Implementar `GET /api/health/whatsapp` com campos:
   - `lastForwarded`, `lastPhoneNumberId`, `lastRejectReason`
4. Deploy e confirmar app online.

### 4.3 No Hub

1. Obter `phone_number_id` do novo número (painel Meta ou enviar mensagem de teste e ler logs — ver seção 7).
2. Editar `ROUTES_JSON` no Railway — **adicionar** entrada sem remover as existentes:

   ```json
   {
     "1177824065415495": "https://postmais-production.up.railway.app/api/webhook/whatsapp",
     "1006339629228046": "https://zazmax-production.up.railway.app/api/webhooks/whatsapp",
     "{NOVO_PHONE_NUMBER_ID}": "https://{app}-production.up.railway.app/api/webhook/whatsapp"
   }
   ```

3. Salvar → aguardar redeploy automático (~1 min).

### 4.4 Testes

```bash
# Hub configurado
curl https://iae-whatsapp-hub-production.up.railway.app/health
# → {"ok":true,"configured":true}

# Enviar mensagem WhatsApp para o número do novo app

# Logs Hub (Railway) — esperado:
# event: webhook_received, phoneNumberId: {NOVO_ID}, routedTo: {app}, forwardStatus: 200

# Health do app (se existir)
curl https://{app}-production.up.railway.app/api/health/whatsapp
# → lastForwarded: true, lastRejectReason: null
```

### 4.5 Meta

**Não é necessário** alterar Callback URL na Meta. O Hub já recebe todos os eventos do WABA.

---

## 5. Procedimento: migrar app EXISTENTE

Use quando o app **já processava mensagens** por outro caminho (ex.: forward via Zazmax).

### 5.1 Cenários comuns

| Situação anterior | O que fazer |
|-------------------|-------------|
| App recebia via **forward do Zazmax** | Adicionar rota no Hub + alinhar `WHATSAPP_FORWARD_SECRET` no app |
| App recebia **direto da Meta** (URL própria) | Centralizar URL na Meta para o Hub (uma vez) + rota no Hub |
| App compartilhava URL com outro produto | Idem — Hub passa a rotear por `phone_number_id` |

### 5.2 Checklist de migração (app existente)

#### Fase A — Preparar app (sem downtime)

- [ ] Confirmar `PHONE_NUMBER_ID` correto no Railway do app
- [ ] Confirmar endpoint POST ativo e aceita `x-webhook-forward-secret`
- [ ] Alinhar `WHATSAPP_FORWARD_SECRET` app = Hub
- [ ] Deploy do app

#### Fase B — Configurar Hub

- [ ] Adicionar `phone_number_id → URL` no `ROUTES_JSON`
- [ ] Redeploy Hub
- [ ] Teste manual (seção 6.3) com POST simulado ou mensagem real

#### Fase C — Meta (somente na primeira migração global)

> Já executado em produção. Repetir **apenas** se o WABA ainda aponta para URL legada.

- [ ] Callback URL → Hub
- [ ] Verify Token → confirmar igual ao Hub
- [ ] Re-subscribe campos (`messages`, etc.)

#### Fase D — Limpar legado (após validação)

No **Zazmax** (ou proxy antigo), remover:

- [ ] Variáveis `POSTMAIS_PHONE_NUMBER_ID`, `POSTMAIS_RAILWAY_URL`
- [ ] Código de forward interno para outros apps
- [ ] Manter apenas processamento do **próprio** `PHONE_NUMBER_ID`

#### Fase E — Validar

- [ ] Mensagem de teste em **cada** número (PostMais, Zazmax, app migrado)
- [ ] Logs Hub: `forwardStatus: 200` para todos
- [ ] Nenhum `unknown_route` ou `secret_invalido`

### 5.3 Exemplo real — migração PostMais (referência)

| Item | Valor |
|------|-------|
| `PHONE_NUMBER_ID` PostMais | `1177824065415495` |
| URL destino | `https://postmais-production.up.railway.app/api/webhook/whatsapp` |
| Problema encontrado | `WHATSAPP_FORWARD_SECRET` diferente entre Hub e PostMais |
| Sintoma | Hub log ok; PostMais `lastRejectReason: secret_invalido` |
| Correção | Igualar secret nos três serviços (Hub, PostMais, Zazmax) |

### 5.4 Exemplo real — migração Zazmax (referência)

| Item | Valor |
|------|-------|
| `PHONE_NUMBER_ID` Zazmax | `1006339629228046` |
| URL destino | `https://zazmax-production.up.railway.app/api/webhooks/whatsapp` |
| Observação | Path plural `/api/webhooks/` (diferente do PostMais) |

---

## 6. Procedimentos de teste

### 6.1 Verify Meta (GET)

```bash
curl "https://iae-whatsapp-hub-production.up.railway.app/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=teste123"
```

**Esperado:** body `teste123` (texto puro), status 200.

### 6.2 Health Hub

```bash
curl https://iae-whatsapp-hub-production.up.railway.app/health
```

**Esperado:**

```json
{
  "ok": true,
  "configured": true,
  "lastWebhook": {
    "phoneNumberId": "...",
    "routedTo": "postmais-production",
    "forwardStatus": 200,
    "at": "..."
  }
}
```

### 6.3 Health PostMais

```bash
curl https://postmais-production.up.railway.app/api/health/whatsapp
```

**Esperado:** `lastForwarded: true`, `lastRejectReason: null`.

### 6.4 Descobrir `phone_number_id` desconhecido

1. Adicionar rota temporária fake ou deixar `ROUTES_JSON` sem o ID.
2. Enviar mensagem para o número WhatsApp.
3. Logs Hub → `phoneNumberId: XXXXXXXXX` + `warning: unknown_route`.
4. Usar esse ID no `ROUTES_JSON`.

---

## 7. Troubleshooting

### 7.1 Tabela de sintomas

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Meta verify falha (403) | `VERIFY_TOKEN` errado no Hub | Corrigir variável Railway; redeploy |
| Logs: `invalid_signature` | `META_APP_SECRET` errado | Corrigir com App Secret IAE Produtos ou remover variável temporariamente |
| Logs: `unknown_route` | `phone_number_id` ausente no `ROUTES_JSON` | Adicionar ID correto ao mapa |
| Hub ok, app não processa | `WHATSAPP_FORWARD_SECRET` diferente | Igualar Hub ↔ app destino |
| PostMais: `secret_invalido` | Secret desalinhado | Copiar secret do Hub para PostMais |
| `forwardStatus: 403` no destino | Secret ou auth no app destino | Verificar middleware do app |
| `forward_failed` / timeout | App destino offline ou URL errada | Conferir URL (singular/plural webhook) |
| Nenhum log no Hub | Meta ainda aponta URL antiga | Conferir Callback URL no painel Meta |
| Só um app falha | Rota ou secret **desse** app | Isolar por `phone_number_id` nos logs |

### 7.2 Ordem de diagnóstico

```
1. GET /health Hub          → configured: true?
2. Logs Hub após mensagem   → webhook_received ou webhook_rejected?
3. phoneNumberId nos logs   → bate com ROUTES_JSON?
4. forwardStatus            → 200 no destino?
5. GET /api/health/whatsapp → lastRejectReason?
6. Variáveis Railway        → PHONE_NUMBER_ID, WHATSAPP_FORWARD_SECRET
```

### 7.3 Erros comuns de configuração

**IDs de exemplo no `ROUTES_JSON`**

```
❌ "123456789012345"  (placeholder do .env.example)
✅ "1177824065415495"  (ID real do PostMais)
```

**URL errada (singular vs plural)**

```
PostMais: /api/webhook/whatsapp   (singular)
Zazmax:   /api/webhooks/whatsapp  (plural)
```

**Secrets diferentes por serviço**

Todos devem compartilhar o **mesmo** `WHATSAPP_FORWARD_SECRET`:

```
Hub  WHATSAPP_FORWARD_SECRET = X
PostMais WHATSAPP_FORWARD_SECRET = X
Zazmax   WHATSAPP_FORWARD_SECRET = X
NovoApp  WHATSAPP_FORWARD_SECRET = X
```

---

## 8. Rollback

### 8.1 Rollback total (emergência)

1. Meta → Callback URL → URL legada (ex.: Zazmax)
2. Reativar forward no Zazmax se ainda existir código
3. Validar mensagens nos apps

### 8.2 Rollback parcial (um app com problema)

1. **Não** reverter Meta
2. Corrigir rota/secret do app específico no Hub ou no app
3. Redeploy
4. Testar somente o número afetado

---

## 9. Segurança

| Item | Recomendação |
|------|--------------|
| `WHATSAPP_FORWARD_SECRET` | Obrigatório; rotacionar se vazamento |
| `META_APP_SECRET` | Configurar após estabilizar; App Secret IAE Produtos |
| `VERIFY_TOKEN` | Não commitar; só Railway / Meta |
| `GET /routes` | Desabilitado sem `ROUTES_ADMIN_TOKEN`; ou proteger com Bearer |
| Logs | Hub não loga corpo de mensagens (privacidade) |

---

## 10. Checklist — novo app (resumo)

```
□ Número no WABA IAE Produtos
□ App com POST /api/webhook/whatsapp + validação secret
□ PHONE_NUMBER_ID no Railway do app
□ WHATSAPP_FORWARD_SECRET = Hub
□ phone_number_id adicionado ao ROUTES_JSON do Hub
□ Redeploy Hub
□ Mensagem teste → logs Hub forwardStatus: 200
□ Health app → lastForwarded: true
□ (Opcional) Limpar forward legado em proxies antigos
```

---

## 11. Checklist — migrar app existente (resumo)

```
□ Identificar phone_number_id atual do app
□ Confirmar endpoint POST e PHONE_NUMBER_ID no app
□ Alinhar WHATSAPP_FORWARD_SECRET Hub ↔ app
□ Adicionar rota no ROUTES_JSON (sem remover outras)
□ Testar mensagem no número do app
□ Validar demais apps não regrediram
□ Remover forward legado no Zazmax/proxy
□ (Opcional) Configurar META_APP_SECRET no Hub
```

---

## 12. Referências

| Recurso | URL / local |
|---------|-------------|
| Hub produção | `https://iae-whatsapp-hub-production.up.railway.app` |
| Repositório | `https://github.com/IA-Expertise/iae-whatsapp-hub` |
| Especificação técnica | [IAE-WHATSAPP-HUB.md](./IAE-WHATSAPP-HUB.md) |
| PostMais health | `GET /api/health/whatsapp` |
| Meta Developers | App **IAE Produtos** → WhatsApp → Configuration |

---

*Runbook v1.0 — baseado na migração PostMais + Zazmax (jul/2026).*
