# ADR 001: Multi-Tenant Request Isolation Using AsyncLocalStorage

## Status
Accepted

## Context
In multi-tenant SaaS platforms, cross-tenant data leakage is a critical vulnerability. Previously, `server/services/tenantDataAccess.js` tracked the active tenant in a shared singleton map. Because Node.js handles multiple asynchronous concurrent requests in a single-threaded event loop, asynchronous operations interleaving across promises led to race conditions where one user's database queries inadvertently ran under another concurrent tenant's context.

Furthermore, client-supplied `x-tenant-id` HTTP headers could override verified JWT claims, enabling tenant spoofing attacks.

## Decision
1. **AsyncLocalStorage Execution Scoping**: Replaced the mutable singleton map in `tenantDataAccess.js` with Node.js built-in `AsyncLocalStorage`. Every incoming request wraps execution in `tenantStorage.run(context, next)`. Any nested function, database query, or logger call reads the immutable context of that specific request pipeline without explicit parameter drilling.
2. **Anti-Spoofing Security Middleware**: Implemented `server/middleware/tenantIsolation.js`. When a user presents a validated JWT token with a tenant ID, any conflicting `x-tenant-id` header is rejected immediately with HTTP 403 Forbidden.
3. **Query Scoping**: Enforced strict parameterization on core resource queries (`WHERE tenant_id = ?`) across SQLite and PostgreSQL. Self-healing database initialization was added in `server/database/init.js` to automatically backfill missing `tenant_id` columns and default tenants.

## Consequences
- **Positive**: Complete asynchronous request isolation without thread/request cross-talk.
- **Positive**: Zero possibility of tenant spoofing via forged request headers.
- **Positive**: Fully testable through automated concurrent Jest property tests (`server/tests/tenant-isolation.test.js`).
- **Trade-off**: Internal background tasks running outside an HTTP request must explicitly initialize an `AsyncLocalStorage` scope or pass context.
