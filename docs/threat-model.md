# Enterprise Threat Model (STRIDE Methodology)

This document outlines the security architecture and threat defenses implemented across the BizGrow platform.

## 1. Threat Analysis Summary (STRIDE)

| Threat Category | Potential Attack Vector | Severity | Implemented Defense Mechanism | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | Attacker injects `X-Tenant-Id: victim-tenant` header while authenticated with valid JWT token | Critical | `server/middleware/tenantIsolation.js` checks token tenant against header. Rejects mismatch with HTTP 403 Forbidden. | `server/tests/tenant-isolation.test.js` |
| **Tampering** | SQL injection in URL parameters, query parameters, or request bodies (`' OR 1=1--`) | High | `server/middleware/auth.js` (`sqlInjectionProtection`) with deep recursive AST/regex detection + parameterized queries. | `server/tests/security.property.test.js` |
| **Repudiation** | Unauthorized actions taken without auditable proof | Medium | `server/middleware/logging.js` and `securityEventLogger` record correlation IDs, IP addresses, user IDs, and timestamps. | Automated security logging tests |
| **Information Disclosure** | AI API keys compiled into public client JavaScript bundles | Critical | Scrubbed all client-side Gemini invocations from Vite bundle. Replaced with server-side proxy `/api/ai/*`. | Bundle audit (`npm run build`) |
| **Information Disclosure** | Cross-Site Scripting (XSS) injecting `<script>` or event handlers (`onerror=`) | High | Strict Content-Security-Policy (CSP) via Helmet + recursive payload sanitization in `inputSanitization`. | `server/tests/security.property.test.js` |
| **Denial of Service** | Oversized HTTP payloads exhausting server memory | High | `requestSizeLimiter` enforces strict body caps (1MB/10MB) and cleanly drains sockets to prevent TCP connection reset. | `server/tests/security.property.test.js` |
| **Denial of Service** | External Microsoft Graph API rate limiting (HTTP 429) causing service failure | High | `MicrosoftGraphConnectorProvider` parses `Retry-After` header and performs exponential backoff with randomized jitter. | `tests/BizGrow.Connectors.Tests/Providers/MicrosoftGraphConnectorTests.cs` |
| **Elevation of Privilege** | Standard tenant accessing another tenant's businesses or proposals | Critical | `tenantDataAccess.js` uses `AsyncLocalStorage` to enforce `WHERE tenant_id = ?` on all database operations. | `server/tests/tenant-isolation.test.js` |

---

## 2. Security Architecture Details

### 2.1 Multi-Tenant Request Isolation
Each incoming HTTP request is intercepted by `tenantIsolation` middleware:
1. Validates the JWT Bearer token and extracts `req.user.tenantId`.
2. Validates that any optional `X-Tenant-Id` header exactly matches `req.user.tenantId`.
3. Wraps the remaining middleware chain and route handler inside `tenantDataAccess.runWithTenant(tenantId, next)` using Node.js `AsyncLocalStorage`.
4. All database queries query within the active async execution context.

### 2.2 Server-Side AI Secret Protection
- **Vite Configuration**: All `process.env.GEMINI_API_KEY` defines have been completely eliminated from `vite.config.ts`.
- **Backend AI Proxy**: The frontend interacts exclusively with `POST /api/ai/leads` and `POST /api/ai/proposals`.
- **Credential Storage**: Secrets reside purely in server environment variables and are masked in logging output.

### 2.3 Connector Mutual Authentication
Communication between the Node.js API Gateway and the .NET 8 Connector Service is protected by:
- Shared secret API key transmitted via `X-Connector-Key`.
- Scoped tenant forwarding via `X-Tenant-Id`.
- Local loopback network binding (`127.0.0.1`) by default.
