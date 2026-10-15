namespace BizGrow.Connectors.Domain.Models;

public enum SyncMode
{
    Full,
    Delta
}

public enum SyncStatus
{
    Queued,
    Running,
    Retrying,
    Succeeded,
    Failed,
    Cancelled
}

public enum HealthStatus
{
    Healthy,
    Degraded,
    Unhealthy
}
