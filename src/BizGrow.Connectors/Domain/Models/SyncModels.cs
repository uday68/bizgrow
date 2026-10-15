namespace BizGrow.Connectors.Domain.Models;

public class ExternalAccount
{
    public string AccountId { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public DateTime ConnectedAtUtc { get; set; } = DateTime.UtcNow;
    public List<string> Scopes { get; set; } = new();
    public string Status { get; set; } = "Connected";
}

public class SyncCheckpoint
{
    public string Provider { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string? DeltaToken { get; set; }
    public string? NextLink { get; set; }
    public DateTime CursorTimestampUtc { get; set; } = DateTime.UtcNow;
    public string LastSyncStatus { get; set; } = "None";
    public long TotalItemsProcessed { get; set; }
}

public class SyncRunResult
{
    public bool Success { get; set; }
    public int ItemsAdded { get; set; }
    public int ItemsUpdated { get; set; }
    public int ItemsDeleted { get; set; }
    public SyncCheckpoint? NextCheckpoint { get; set; }
    public string? ErrorMessage { get; set; }
    public TimeSpan Duration { get; set; }
}

public class ConnectorHealth
{
    public HealthStatus Status { get; set; } = HealthStatus.Healthy;
    public string Provider { get; set; } = string.Empty;
    public string Message { get; set; } = "Operational";
    public long LatencyMs { get; set; }
    public DateTime CheckedAtUtc { get; set; } = DateTime.UtcNow;
}

public class ConnectionAuthContext
{
    public string TenantId { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? TenantDirectoryId { get; set; }
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public Dictionary<string, string> CustomParameters { get; set; } = new();
}

public class SyncJob
{
    public string JobId { get; set; } = Guid.NewGuid().ToString("N");
    public string DeduplicationKey { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public SyncMode Mode { get; set; } = SyncMode.Delta;
    public SyncStatus Status { get; set; } = SyncStatus.Queued;
    public int AttemptCount { get; set; }
    public int MaxRetries { get; set; } = 3;
    public DateTime EnqueuedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? LeaseExpiryUtc { get; set; }
    public string? WorkerId { get; set; }
    public string? ErrorMessage { get; set; }
    public SyncRunResult? Result { get; set; }
}
