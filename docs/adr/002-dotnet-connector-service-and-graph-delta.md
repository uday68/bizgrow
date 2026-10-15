# ADR 002: C#/.NET 8 Connector Service & Microsoft Graph Delta Ingestion

## Status
Accepted

## Context
Enterprise document ingestion across Microsoft 365 (SharePoint and OneDrive) requires robust handling of large datasets, cursor tracking, role-based access control (ACL) preservation, and resiliency against strict rate limits (HTTP 429 Too Many Requests). Building this directly in Node.js would lead to event loop starvation during heavy JSON parsing and lacks the strongly typed domain modeling expected in enterprise integration architectures.

## Decision
1. **Isolated C#/.NET 8 Web API Service**: Scaffolded `src/BizGrow.Connectors/` running on .NET 8 (`net8.0`).
2. **Clean Domain Abstractions**:
   - `IConnectorProvider`: Uniform interface for health checks, connection validation, and sync runs.
   - Domain models: `ExternalDocument`, `DocumentPermission`, `SyncCheckpoint`, `SyncRunResult`, `SyncJob`.
3. **Microsoft Graph Delta Ingestion**:
   - Implemented `MicrosoftGraphConnectorProvider` consuming `/v1.0/me/drive/root/delta`.
   - Cursors are tracked via `@odata.deltaLink`. Upon initial full sync, documents are discovered across paginated `@odata.nextLink` pages. When pagination completes, the final delta link cursor is saved to the tenant checkpoint.
   - Subsequent syncs query only incremental changes (created, modified, or tombstoned deleted files).
4. **Adaptive Backoff on HTTP 429**:
   - `SendWithThrottlingRetryAsync` inspects HTTP 429 responses, parsing `Retry-After` headers (both delta seconds and HTTP-date formats).
   - Retries with exponential backoff and randomized jitter to prevent thundering herd problems.
5. **Deterministic Mock Provider**:
   - Implemented `MockConnectorProvider` generating synthetic enterprise departments, version hashes, and permissions without cloud dependencies. Enables 100% offline testing.
6. **Node.js Gateway Proxy**:
   - Node.js backend routes `/api/connectors/*` proxy to .NET service with shared secret mutual authentication (`X-Connector-Key`) and tenant forwarding (`X-Tenant-Id`). Includes a fail-safe standalone fallback.

## Consequences
- **Positive**: High throughput, strongly typed document ingestion with zero cloud credential lock-in during testing.
- **Positive**: Strict preservation of enterprise ACLs (users, groups, owner roles, inheritance).
- **Positive**: Resilient against Microsoft 365 rate limits and transient connection faults.
- **Trade-off**: Requires .NET 8 runtime alongside Node.js for production execution.
