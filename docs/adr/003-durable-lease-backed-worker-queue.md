# ADR 003: Durable Lease-Backed Background Processing & Worker Engine

## Status
Accepted

## Context
Background synchronization jobs in distributed SaaS architectures are prone to three primary reliability failures:
1. **Duplicate Execution**: Repetitive UI clicks or scheduled cron jobs can trigger redundant expensive sync operations.
2. **Worker Crashes & Zombie Jobs**: If a worker node crashes mid-sync, the job remains stuck in a `Running` state indefinitely.
3. **Thundering Herd / Unbounded Concurrency**: Launching unbounded parallel sync jobs exhausts downstream API quotas and system memory.

## Decision
1. **Database-Backed State Machine**:
   - Implemented `SqliteSyncJobQueue` (`connector_sync_jobs` table) with formal status transitions: `Queued -> Running -> Succeeded / Retrying / Failed / Cancelled`.
2. **Idempotent Deduplication Keys**:
   - `EnqueueAsync` accepts a deterministic `deduplicationKey` (e.g. `{tenantId}:{provider}:{mode}:{timestampHour}`). If an active job already exists in `Queued`, `Running`, or `Retrying`, the queue returns the existing job without creating a duplicate.
3. **Atomic Leases & Heartbeat Renewal**:
   - `DequeueAsync` claims jobs with a 30-second lease window (`lease_expiry_utc`).
   - `SyncWorkerService` runs a dedicated heartbeat loop renewing the lease every 10 seconds (`leaseDuration / 3`).
4. **Crash Recovery**:
   - On worker startup and periodically, `ReclaimAbandonedJobsAsync` executes an atomic SQL query finding jobs in `Running` state where `lease_expiry_utc < now`.
   - Abandoned jobs have their attempts incremented and are safely transitioned back to `Retrying` (or `Failed` if max retries exceeded).
5. **Bounded Concurrency**:
   - The worker service constrains simultaneous active syncs using a `SemaphoreSlim(maxConcurrency, maxConcurrency)`.

## Consequences
- **Positive**: Absolute crash resilience—any unexpected node termination results in clean job reclamation.
- **Positive**: Strict idempotency prevents duplicate document ingestion.
- **Positive**: Bounded concurrency protects server resources and downstream API limits.
