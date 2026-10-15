using BizGrow.Connectors.Domain.Models;

namespace BizGrow.Connectors.Domain.Interfaces;

public interface IConnectorProvider
{
    string ProviderName { get; }
    
    Task<ConnectorHealth> CheckHealthAsync(ConnectionAuthContext auth, CancellationToken ct = default);
    
    Task<ExternalAccount> ValidateAndConnectAsync(ConnectionAuthContext auth, CancellationToken ct = default);
    
    Task<SyncRunResult> ExecuteSyncAsync(
        ConnectionAuthContext auth, 
        SyncMode mode, 
        SyncCheckpoint? currentCheckpoint,
        Func<ExternalDocument, Task> onDocumentDiscoveredAsync,
        CancellationToken ct = default);
}

public interface ISyncJobQueue
{
    Task<SyncJob> EnqueueAsync(string tenantId, string provider, SyncMode mode, string? deduplicationKey = null, CancellationToken ct = default);
    Task<SyncJob?> DequeueAsync(string workerId, TimeSpan leaseDuration, CancellationToken ct = default);
    Task<bool> RenewLeaseAsync(string jobId, string workerId, TimeSpan leaseDuration, CancellationToken ct = default);
    Task CompleteJobAsync(string jobId, string workerId, SyncRunResult result, CancellationToken ct = default);
    Task FailJobAsync(string jobId, string workerId, string error, bool canRetry, CancellationToken ct = default);
    Task<SyncJob?> GetJobAsync(string jobId, CancellationToken ct = default);
    Task<IReadOnlyList<SyncJob>> GetTenantJobsAsync(string tenantId, int limit = 20, CancellationToken ct = default);
    Task<int> ReclaimAbandonedJobsAsync(CancellationToken ct = default);
}

public interface IDocumentRepository
{
    Task UpsertDocumentAsync(ExternalDocument document, CancellationToken ct = default);
    Task<ExternalDocument?> GetDocumentAsync(string tenantId, string provider, string remoteId, CancellationToken ct = default);
    Task<IReadOnlyList<ExternalDocument>> GetTenantDocumentsAsync(string tenantId, string? provider = null, int limit = 100, CancellationToken ct = default);
    Task<SyncCheckpoint?> GetCheckpointAsync(string tenantId, string provider, CancellationToken ct = default);
    Task SaveCheckpointAsync(SyncCheckpoint checkpoint, CancellationToken ct = default);
}
