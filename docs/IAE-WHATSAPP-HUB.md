# IAE WhatsApp Hub — Especificação Técnica

Documento para implementação do **hub de roteamento de webhooks** entre o app Meta **IAE Produtos** (WABA) e os serviços consumidores (PostMais, Zazmax, futuros apps).

**Escopo deste documento:** contrato, arquitetura e migração.  
**Fora do escopo:** lógica de negócio, máquina de estados, geração de mídia.

---

## 1. Contexto e problema

A Meta Cloud API permite **uma única URL de callback** por app. O app **IAE Produtos** hospeda múltiplos números WhatsApp (WABA) usados por produtos diferentes.

### Situação atual (legado)

```
Meta (app IAE Produtos)
        │
        ▼
Zazmax  GET/POST /api/webhooks/whatsapp    ← URL registrada na Meta
        │
        ├── phone_number_id = PostMais  ──POST──►  PostMais /api/webhook/whatsapp
        │
        └── phone_number_id = Zazmax    →  processamento local Zazmax
```

**Limitações:**
- Cada novo app exige alteração no **Zazmax** (acoplamento).
- Zazmax mistura produto próprio com infraestrutura compartilhada.
- Debug e deploy ficam interdependentes.

### Situação alvo

```
Meta (app IAE Produtos)
        │
        ▼
IAE WhatsApp Hub   GET/POST /webhooks/whatsapp    ← única URL na Meta
        │
        ├── phone_number_id A  ──POST──►  PostMais /api/webhook/whatsapp
        ├── phone_number_id B  ──POST──►  Zazmax  /api/webhooks/whatsapp
        └── phone_number_id C  ──POST──►  App3    /api/webhook/whatsapp
```

O hub é **stateless**, **sem banco obrigatório** na v1, e **sem regra de negócio**.

---

## 2. Responsabilidades

| Camada | Faz | Não faz |
|--------|-----|---------|
| **Meta** | Entrega eventos WABA | Rotear por produto |
| **Hub** | Verificação GET, roteamento POST, repasse seguro | Processar mensagens, chamar Gemini, etc. |
| **App destino** (PostMais, Zazmax…) | Processar mensagens, responder usuário | Registrar URL na Meta |

---

## 3. Endpoints do hub

Base URL exemplo: `https://iae-whatsapp-hub-production.up.railway.app`

| Método | Path | Origem | Função |
|--------|------|--------|--------|
| `GET` | `/webhooks/whatsapp` | Meta (setup) | Challenge de verificação |
| `POST` | `/webhooks/whatsapp` | Meta (eventos) | Receber e rotear payload |
| `GET` | `/health` | Railway / monitor | Healthcheck simples |
| `GET` | `/routes` | Admin (opcional) | Listar rotas configuradas — **proteger ou omitir em prod** |

---

## 4. Verificação GET (Meta subscription)

A Meta envia:

```
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
```

**Comportamento esperado:**

```javascript
if (hub.mode === 'subscribe' && hub.verify_token === process.env.VERIFY_TOKEN) {
  return res.status(200).send(hub.challenge); // body = challenge puro (texto)
}
return res.sendStatus(403);
```

- `VERIFY_TOKEN` deve ser **idêntico** ao configurado no painel Meta e nos apps destino (PostMais já usa `VERIFY_TOKEN`).
- Resposta: status `200`, body = valor de `hub.challenge` (string), **sem JSON**.

---

## 5. Eventos POST (roteamento)

### 5.1 Formato do payload Meta

Objeto raiz típico:

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "5511999999999",
          "phone_number_id": "123456789012345"
        },
        "messages": [ ... ]
      }
    }]
  }]
}
```

**Chave de roteamento:**

```javascript
const phoneNumberId =
  body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;
```

> Se no futuro houver payloads sem `metadata` no primeiro change, iterar `entry[].changes[].value.metadata.phone_number_id` até encontrar o primeiro ID válido.

### 5.2 Fluxo do hub (ordem obrigatória)

```
1. Receber POST
2. (Opcional) Validar X-Hub-Signature-256
3. Se object !== "whatsapp_business_account" → 200 e encerrar
4. Extrair phone_number_id
5. Responder 200 à Meta IMEDIATAMENTE          ← Meta exige resposta rápida
6. Assincronamente: lookup rota + forward POST ao destino
```

**Nunca** aguardar o app destino processar antes de responder à Meta.

Referência: PostMais já faz `res.sendStatus(200)` antes de processar (`src/routes/webhook.js`).

### 5.3 Lookup de rota

Tabela `phone_number_id → URL destino`:

| phone_number_id | URL destino (POST) |
|-----------------|-------------------|
| `{POSTMAIS_PHONE_NUMBER_ID}` | `https://postmais-production.up.railway.app/api/webhook/whatsapp` |
| `{ZAZMAX_PHONE_NUMBER_ID}` | `https://zazmax-production.up.railway.app/api/webhooks/whatsapp` |

Configurável via variável de ambiente (ver seção 8).

### 5.4 Forward para o app destino

```http
POST {destination_url}
Content-Type: application/json
x-webhook-forward-secret: {WHATSAPP_FORWARD_SECRET}

{body original da Meta, sem alteração}
```

- Repassar o **JSON intacto** (mesmo `req.body`).
- Header `x-webhook-forward-secret` — contrato já implementado no **PostMais**:

```javascript
// PostMais src/routes/webhook.js
function isAuthorizedForward(req) {
  const secret = env.whatsapp.forwardSecret;
  if (!secret) return true;
  return req.get('x-webhook-forward-secret') === secret;
}
```

- **Zazmax** deve aceitar o mesmo header após migração (remover forward interno, manter validação se existir).

### 5.5 Casos especiais

| Situação | Ação do hub |
|----------|-------------|
| `phone_number_id` desconhecido | Log warn + **200** para Meta (não retry infinito) |
| Destino retorna 5xx / timeout | Log error; **não** propagar erro à Meta |
| Payload sem `phone_number_id` | Log warn + 200 |
| Status / read receipts / outros `field` | Rotear igual (destino filtra o que processa) |

Timeout sugerido no forward: **10–15 s** (fire-and-forget após 200 à Meta).

---

## 6. Validação de assinatura Meta (recomendado)

Header: `X-Hub-Signature-256: sha256=...`

```javascript
import crypto from 'crypto';

function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader) return true; // skip se não configurado
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```

- Usar **raw body** no Express (`express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })`).
- `META_APP_SECRET` = App Secret do app IAE Produtos no painel Meta.
- Validar **no hub** uma vez; apps destino podem confiar no forward via secret interno.

---

## 7. Contrato dos apps destino (referência)

### PostMais (implementado)

| Item | Valor |
|------|-------|
| GET verify | `/api/webhook/whatsapp` |
| POST events | `/api/webhook/whatsapp` |
| Variável número | `PHONE_NUMBER_ID` |
| Secret forward | `WHATSAPP_FORWARD_SECRET` |
| Verify token | `VERIFY_TOKEN` |
| Filtra número errado | Sim — ignora se `phone_number_id !== PHONE_NUMBER_ID` |
| Health diagnóstico | `GET /api/health/whatsapp` |

### Zazmax (legado)

| Item | Valor |
|------|-------|
| POST/GET | `/api/webhooks/whatsapp` (note **webhooks** plural) |
| Hoje | Faz forward para PostMais + processa local |
| Após migração | Só processa mensagens do **próprio** `PHONE_NUMBER_ID` |

### Novos apps

Devem expor:

```
GET  /api/webhook/whatsapp   (ou path documentado) — verify Meta se receberem direct (não necessário se só via hub)
POST /api/webhook/whatsapp   — aceitar payload + x-webhook-forward-secret
```

Recomendação: **mesmo padrão PostMais** para consistência.

---

## 8. Variáveis de ambiente (hub)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | Não (default 3000) | Porta HTTP |
| `VERIFY_TOKEN` | Sim | Token de verificação Meta (igual apps destino) |
| `WHATSAPP_FORWARD_SECRET` | Sim | Secret repassado no header aos destinos |
| `META_APP_SECRET` | Recomendado | Validação `X-Hub-Signature-256` |
| `ROUTES_JSON` | Sim* | Mapa JSON `phone_number_id → url` |

\* Alternativa: `ROUTE_{PHONE_NUMBER_ID}=url` por variável, ou Postgres na v2.

**Exemplo `ROUTES_JSON`:**

```json
{
  "123456789012345": "https://postmais-production.up.railway.app/api/webhook/whatsapp",
  "987654321098765": "https://zazmax-production.up.railway.app/api/webhooks/whatsapp"
}
```

No Railway, escapar como string de env ou usar arquivo montado.

---

## 9. Stack sugerida (v1 mínima)

- **Node.js 20+** + Express
- **Sem banco** na v1 (rotas via env)
- Deploy **Railway** (ou qualquer PaaS)
- `railway.toml`:

```toml
[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

**Estimativa:** ~120–180 linhas (routes + forward + verify + health).

---

## 10. Logging mínimo

Cada POST logar (JSON estruturado):

```json
{
  "event": "webhook_received",
  "phoneNumberId": "123...",
  "entries": 1,
  "routedTo": "postmais",
  "forwardStatus": 200,
  "ms": 45
}
```

Não logar corpo completo de mensagens (privacidade).

Opcional: último webhook em memória para `GET /health` (padrão PostMais `health-whatsapp`).

---

## 11. Migração (sem downtime crítico)

### Fase 1 — Deploy hub

1. Criar repo `iae-whatsapp-hub`.
2. Implementar GET/POST + rotas PostMais + Zazmax.
3. Deploy Railway; testar GET verify manualmente:

   ```
   curl "https://HUB/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=teste123"
   → teste123
   ```

4. Testar POST simulado com `phone_number_id` PostMais → confirmar chegada no PostMais (`GET /api/health/whatsapp` → `lastForwarded: true`).

### Fase 2 — Trocar URL na Meta

1. Painel Meta → app IAE Produtos → WhatsApp → Configuration → Webhook.
2. Callback URL: `https://HUB/webhooks/whatsapp`
3. Verify Token: mesmo `VERIFY_TOKEN`
4. Subscribe: **messages** (e demais campos já usados).

### Fase 3 — Limpar Zazmax

1. Remover variáveis `POSTMAIS_PHONE_NUMBER_ID`, `POSTMAIS_RAILWAY_URL`.
2. Remover código de forward para PostMais.
3. Manter processamento apenas do número Zazmax.
4. Garantir que Zazmax valida `x-webhook-forward-secret` (recomendado).

### Rollback

1. Meta Callback URL → voltar para Zazmax.
2. Reativar forward no Zazmax se ainda existir.

---

## 12. Segurança

| Item | Recomendação |
|------|--------------|
| Forward secret | Obrigatório em prod; rotacionar se vazar |
| HTTPS | Obrigatório (Meta exige) |
| `/routes` admin | Desabilitar ou proteger com token |
| IP allowlist Meta | Opcional; Meta IPs mudam — preferir assinatura HMAC |
| Rate limit | Opcional no hub (baixa prioridade v1) |

---

## 13. O que NÃO colocar no hub

- Upload/download de mídia WhatsApp
- Token `WHATSAPP_TOKEN` para enviar mensagens (cada app usa o seu)
- Postgres / sessões de conversa
- Retry complexo (Meta reenvia eventos em falha **do hub**; se hub respondeu 200, responsabilidade do destino)

---

## 14. Evolução futura (v2+)

- Tabela de rotas em Postgres + UI admin
- Fila (Redis/SQS) entre hub e destinos para picos
- Métricas (Prometheus / Datadog): forwards por destino, latência, falhas
- Webhook de **múltiplos apps Meta** (se sair do IAE Produtos) — um hub por app Meta

---

## 15. Checklist de aceite

- [ ] GET verify retorna challenge correto
- [ ] POST responde 200 em < 2 s mesmo se destino lento
- [ ] PostMais recebe eventos com `lastForwarded: true` no health
- [ ] Zazmax processa só seu número
- [ ] `phone_number_id` desconhecido não quebra hub (200 + log)
- [ ] Assinatura Meta validada quando `META_APP_SECRET` setado
- [ ] Healthcheck Railway `/health` OK

---

## 16. Referências no PostMais

| Arquivo | Conteúdo |
|---------|----------|
| `README.md` | Diagrama legado Zazmax → PostMais |
| `src/routes/webhook.js` | Contrato GET/POST + forward secret |
| `src/routes/health-whatsapp.js` | Diagnóstico de recebimento |
| `ROLLBACK-MODO-SERVICO.md` | Exemplo de feature flag / rollback (padrão ops) |
| `RUNBOOK-APPS-E-MIGRACOES.md` | Procedimentos para novos apps e migrações (operacional) |

---

*Documento gerado para implementação do IAE WhatsApp Hub em repositório separado. Versão 1.0.*
