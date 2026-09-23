# Bank Payment Gateway — Developer Integration Guide

> **Phase 2 change:** EasyPaisa has been fully removed. The platform now uses a
> **generic Bank Payment Gateway** abstraction. Everything (frontend, backend,
> database) is already wired — **going live only requires adding the bank's API
> credentials.** No code changes are required.

---

## 1. Overview

The gateway supports two fee types:

| Fee | Endpoint | Purpose string |
|-----|----------|----------------|
| **Application Processing Fee** | `POST /api/payments/gateway/processing-fee` | `Application Processing Fee` |
| **Semester / Admission Fee** | `POST /api/payments/gateway/admission-fee` | `Semester Fee` |

Both legacy paths (`/api/payments/easypaisa/*`) are kept as **aliases** that route
to the same bank-gateway handlers, so any old client keeps working.

Modes (`PAYMENT_GATEWAY_MODE` / `PaymentGatewayConfig.mode`):

- **`sandbox`** (default) — deterministic mock; payments are recorded instantly.
- **`live`** — real calls to the bank's API (requires all credentials).
- **`manual`** — no online gateway; students use Bank Deposit + receipt upload.

---

## 2. Configuration

Configuration is resolved with **DB values overriding environment variables**.

### 2.1 Environment variables (`backend/.env`)

```env
PAYMENT_GATEWAY_MODE="sandbox"          # sandbox | live | manual
BANK_GATEWAY_NAME="Bank Payment Gateway"
BANK_GATEWAY_API_URL=""                 # e.g. https://api.yourbank.com/v1/payments
BANK_GATEWAY_API_KEY=""                 # public/API key (Bearer token)
BANK_GATEWAY_SECRET_KEY=""              # secret used to sign requests (HMAC-SHA256)
BANK_GATEWAY_MERCHANT_ID=""             # your merchant/terminal id
BANK_GATEWAY_CALLBACK_URL="https://<your-domain>/api/payments/gateway/callback"
BANK_GATEWAY_WEBHOOK_SECRET=""          # secret used to verify inbound webhooks
BANK_GATEWAY_RETURN_URL="https://<your-frontend>/payment/result"
```

### 2.2 Database (`PaymentGatewayConfig` — single row)

The Super Admin UI can persist the same fields. DB values win over env:

| Field | Meaning |
|-------|---------|
| `gatewayName` | Display name shown to students |
| `mode` | `sandbox` / `live` / `manual` |
| `enabled` | Master on/off toggle |
| `apiUrl`, `apiKey`, `secretKey`, `merchantId` | Bank credentials |
| `callbackUrl`, `webhookSecret`, `returnUrl` | Redirect + webhook config |
| `supportedFees` | CSV: `PROCESSING_FEE,SEMESTER_FEE` |

> The gateway is considered **LIVE** only when `mode === 'live'` **and**
> `apiUrl`, `apiKey`, `merchantId` are all present. Otherwise it runs in sandbox.

---

## 3. Payment Flows

### 3.1 Direct (server-to-server) — sandbox / simple banks

1. Student submits the fee form.
2. Backend calls `initiatePayment()` → bank returns `success + transactionId`.
3. Backend records a `Transaction`, creates/updates `FeePayment`, sets the
   application to `FEE_PAID` (pending admin review).

### 3.2 Hosted Checkout (redirect) — most banks

1. Backend calls `initiatePayment()` → bank returns a `redirectUrl`.
2. Backend responds `{ checkoutUrl }`; the frontend redirects the browser there.
3. Student pays on the bank's secure page.
4. Bank calls back:
   - **Browser redirect** → `GET /api/payments/gateway/callback?orderId=...&transactionId=...&status=...`
   - **Server webhook** → `POST /api/payments/gateway/webhook` (signature-verified)
5. `finalizeGatewayPayment()` marks the `Transaction` COMPLETED, upserts
   `FeePayment`, and advances the application status.

---

## 4. Request / Response Contract (adapt to your bank)

The **LIVE branch** in `backend/src/utils/bankGateway.js → initiatePayment()`
is a clearly-marked template. Adjust the request payload and response parsing to
match your bank's API. Current template:

**Request** (`POST BANK_GATEWAY_API_URL`)
```json
{
  "merchantId": "...",
  "orderId": "ADMIT-12-34-1699999999999",
  "amount": "25000.00",
  "currency": "PKR",
  "description": "Semester Fee",
  "customerEmail": "student@example.com",
  "customerName": "Ali Khan",
  "customerPhone": "03001234567",
  "callbackUrl": "https://.../api/payments/gateway/callback",
  "returnUrl": "https://.../payment/result"
}
```
Headers: `Authorization: Bearer <apiKey>`, `X-Signature: <HMAC-SHA256 of body using secretKey>`

**Expected response**
```json
{ "status": "success", "transactionId": "BANK-TXN-123", "redirectUrl": "https://bank/checkout/xyz", "message": "OK" }
```

---

## 5. Webhook Verification

`verifyWebhookSignature(rawBody, signature, secret)` computes
`HMAC-SHA256(rawBody, BANK_GATEWAY_WEBHOOK_SECRET)` and compares it (constant-time)
against the `X-Signature` / `X-Webhook-Signature` header. If no secret is set
(sandbox) it accepts everything.

Expected webhook body:
```json
{ "orderId": "ADMIT-12-34-...", "transactionId": "BANK-TXN-123", "status": "success" }
```

---

## 6. Testing

### Sandbox (default, no credentials)
```bash
# Processing fee
curl -X POST http://localhost:5000/api/payments/gateway/processing-fee \
  -H "Authorization: Bearer <student-jwt>" -H "Content-Type: application/json" \
  -d '{"applicationId": 1, "payerName": "Test", "payerPhone": "03001234567"}'
# → { "success": true, "mock": true, "txnId": "SBX-...", "method": "BANK_GATEWAY" }
```

### Simulate a webhook (sandbox)
```bash
curl -X POST http://localhost:5000/api/payments/gateway/webhook \
  -H "Content-Type: application/json" \
  -d '{"orderId":"ADMIT-1-1-...","transactionId":"SBX-...","status":"success"}'
```

### Going live checklist
1. Set `PAYMENT_GATEWAY_MODE=live` and fill all `BANK_GATEWAY_*` values.
2. Register `BANK_GATEWAY_CALLBACK_URL` + webhook URL in the bank portal.
3. Adjust the request/response mapping in `bankGateway.js` if needed.
4. Verify one sandbox transaction on the bank's own sandbox before production.
5. Confirm the webhook signature secret matches the bank portal.

---

## 7. Files Touched

| File | Role |
|------|------|
| `backend/src/utils/bankGateway.js` | Gateway abstraction (config, initiate, verify, record) |
| `backend/src/routes/payments.js` | Endpoints: config, processing-fee, admission-fee, callback, webhook |
| `backend/src/routes/paymentMethods.js` | Exposes `BANK_GATEWAY` method to students |
| `backend/prisma/schema.prisma` | `PaymentGatewayConfig` model + `bankGatewayEnabled` toggle |
| `frontend/.../FeeSection.jsx` | Online payment UI (redirect-aware) |
| `frontend/.../ApplicationSection.jsx` | Processing-fee method UI |

---

## 8. Security Notes

- **Never** expose `apiKey` / `secretKey` / `webhookSecret` to the frontend.
  `/api/payments/config` returns only non-secret fields.
- Secrets live in `.env` (git-ignored) or the `PaymentGatewayConfig` DB row.
- All webhooks are HMAC-verified in `live` mode.
- Amounts are always computed **server-side** from `FeeStructure` /
  `FeeAnnouncement` / cycle config — never trusted from the client.
