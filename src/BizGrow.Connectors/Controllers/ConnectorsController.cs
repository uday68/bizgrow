using BizGrow.Connectors.Domain.Interfaces;
using BizGrow.Connectors.Domain.Models;
using Microsoft.AspNetCore.Mvc;

namespace BizGrow.Connectors.Controllers;

[ApiController]
[Route("api/connectors")]
public class ConnectorsController : ControllerBase
{
    private readonly IEnumerable<IConnectorProvider> _providers;
    private readonly ISyncJobQueue _queue;
    private readonly IDocumentRepository _repository;
    private readonly ILogger<ConnectorsController> _logger;

    public ConnectorsController(
        IEnumerable<IConnectorProvider> providers,
        ISyncJobQueue queue,
        IDocumentRepository repository,
        ILogger<ConnectorsController> logger)
    {
        _providers = providers;
        _queue = queue;
        _repository = repository;
        _logger = logger;
    }

    private string GetTenantId()
    {
        if (Request.Headers.TryGetValue("X-Tenant-Id", out var val) && !string.IsNullOrWhiteSpace(val))
            return val.ToString();
        return "tenant-default";
    }

    [HttpGet("providers")]
    public IActionResult GetProviders()
    {
        var list = _providers.Select(p => new
        {
            provider = p.ProviderName,
            supportedModes = new[] { "Full", "Delta" },
            isDeterministicMock = p.ProviderName == "mock"
        });
        return Ok(list);
    }

    [HttpPost("{provider}/test-connection")]
    public async Task<IActionResult> TestConnection(string provider, [FromBody] ConnectionAuthContext? auth, CancellationToken ct)
    {
        var p = _providers.FirstOrDefault(x => string.Equals(x.ProviderName, provider, StringComparison.OrdinalIgnoreCase));
        if (p == null) return NotFound(new { error = $"Provider '{provider}' not found" });

        auth ??= new ConnectionAuthContext();
        auth.TenantId = GetTenantId();
        auth.Provider = provider;

        var health = await p.CheckHealthAsync(auth, ct);
        ExternalAccount? account = null;
        if (health.Status == HealthStatus.Healthy)
        {
            try
            {
                account = await p.ValidateAndConnectAsync(auth, ct);
            }
            catch (Exception ex)
            {
                health.Status = HealthStatus.Degraded;
                health.Message = $"Health check passed but account validation failed: {ex.Message}";
            }
        }

        return Ok(new
        {
            health,
            account
        });
    }

    public record TriggerSyncRequest(string? Provider, string? Mode, string? DeduplicationKey);

    [HttpPost("sync/trigger")]
    public async Task<IActionResult> TriggerSync([FromBody] TriggerSyncRequest request, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        var provider = string.IsNullOrWhiteSpace(request.Provider) ? "mock" : request.Provider;
        var mode = string.Equals(request.Mode, "Full", StringComparison.OrdinalIgnoreCase) ? SyncMode.Full : SyncMode.Delta;

        var p = _providers.FirstOrDefault(x => string.Equals(x.ProviderName, provider, StringComparison.OrdinalIgnoreCase));
        if (p == null) return NotFound(new { error = $"Provider '{provider}' not found" });

        var job = await _queue.EnqueueAsync(tenantId, provider, mode, request.DeduplicationKey, ct);
        return Accepted($"/api/connectors/sync/jobs/{job.JobId}", job);
    }

    [HttpGet("sync/jobs/{jobId}")]
    public async Task<IActionResult> GetJob(string jobId, CancellationToken ct)
    {
        var job = await _queue.GetJobAsync(jobId, ct);
        if (job == null) return NotFound(new { error = "Job not found" });
        return Ok(job);
    }

    [HttpGet("sync/jobs")]
    public async Task<IActionResult> GetJobs([FromQuery] int limit = 20, CancellationToken ct = default)
    {
        var tenantId = GetTenantId();
        var jobs = await _queue.GetTenantJobsAsync(tenantId, limit, ct);
        return Ok(jobs);
    }

    [HttpGet("{provider}/documents")]
    public async Task<IActionResult> GetDocuments(string provider, [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        var tenantId = GetTenantId();
        var docs = await _repository.GetTenantDocumentsAsync(tenantId, provider, limit, ct);
        var checkpoint = await _repository.GetCheckpointAsync(tenantId, provider, ct);
        return Ok(new
        {
            tenantId,
            provider,
            checkpoint,
            totalDocuments = docs.Count,
            documents = docs
        });
    }
}

[ApiController]
[Route("")]
public class HealthController : ControllerBase
{
    private readonly IEnumerable<IConnectorProvider> _providers;

    public HealthController(IEnumerable<IConnectorProvider> providers)
    {
        _providers = providers;
    }

    [HttpGet("health")]
    [HttpGet("")]
    public async Task<IActionResult> GetHealth(CancellationToken ct)
    {
        var checks = new List<ConnectorHealth>();
        foreach (var p in _providers)
        {
            var auth = new ConnectionAuthContext { Provider = p.ProviderName, TenantId = "health-probe" };
            checks.Add(await p.CheckHealthAsync(auth, ct));
        }

        var isAllHealthy = checks.All(c => c.Status == HealthStatus.Healthy);
        return Ok(new
        {
            service = "BizGrow.Connectors",
            version = "1.0.0",
            status = isAllHealthy ? "Healthy" : "Degraded",
            timestamp = DateTime.UtcNow,
            providers = checks
        });
    }
}
