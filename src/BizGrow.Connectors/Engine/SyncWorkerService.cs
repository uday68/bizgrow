using BizGrow.Connectors.Domain.Interfaces;
using BizGrow.Connectors.Domain.Models;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BizGrow.Connectors.Engine;

public class SyncWorkerService : BackgroundService
{
    private readonly ISyncJobQueue _queue;
    private readonly IDocumentRepository _repository;
    private readonly IEnumerable<IConnectorProvider> _providers;
    private readonly ILogger<SyncWorkerService> _logger;
    private readonly SemaphoreSlim _concurrencyLimiter;
    private readonly string _workerId = $"worker-{Guid.NewGuid().ToString("N")[..8]}";
    private readonly TimeSpan _leaseDuration = TimeSpan.FromSeconds(30);

    public SyncWorkerService(
        ISyncJobQueue queue,
        IDocumentRepository repository,
        IEnumerable<IConnectorProvider> providers,
        ILogger<SyncWorkerService> logger,
        int maxConcurrency = 2)
    {
        _queue = queue;
        _repository = repository;
        _providers = providers;
        _logger = logger;
        _concurrencyLimiter = new SemaphoreSlim(maxConcurrency, maxConcurrency);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("SyncWorkerService {WorkerId} starting...", _workerId);

        // Crash recovery on startup: reclaim any abandoned jobs from previous crashes
        try
        {
            int reclaimed = await _queue.ReclaimAbandonedJobsAsync(stoppingToken);
            if (reclaimed > 0)
            {
                _logger.LogWarning("Crash recovery: reclaimed {Count} abandoned sync jobs", reclaimed);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to run initial crash recovery");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _concurrencyLimiter.WaitAsync(stoppingToken);

                var job = await _queue.DequeueAsync(_workerId, _leaseDuration, stoppingToken);
                if (job == null)
                {
                    _concurrencyLimiter.Release();
                    await Task.Delay(500, stoppingToken); // idle backoff
                    continue;
                }

                _ = ProcessJobAsync(job, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SyncWorkerService main loop");
                await Task.Delay(1000, stoppingToken);
            }
        }

        _logger.LogInformation("SyncWorkerService {WorkerId} stopped.", _workerId);
    }

    public async Task ProcessJobAsync(SyncJob job, CancellationToken ct)
    {
        using var heartbeatCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var heartbeatTask = StartHeartbeatAsync(job.JobId, heartbeatCts.Token);

        try
        {
            _logger.LogInformation("Processing job {JobId} for tenant {TenantId}, provider {Provider}, mode {Mode}",
                job.JobId, job.TenantId, job.Provider, job.Mode);

            var provider = _providers.FirstOrDefault(p =>
                string.Equals(p.ProviderName, job.Provider, StringComparison.OrdinalIgnoreCase));

            if (provider == null)
            {
                throw new NotSupportedException($"Connector provider '{job.Provider}' is not registered");
            }

            var authContext = new ConnectionAuthContext
            {
                TenantId = job.TenantId,
                Provider = job.Provider
            };

            var checkpoint = await _repository.GetCheckpointAsync(job.TenantId, job.Provider, ct);

            var syncResult = await provider.ExecuteSyncAsync(
                authContext,
                job.Mode,
                checkpoint,
                async (doc) =>
                {
                    await _repository.UpsertDocumentAsync(doc, ct);
                },
                ct);

            if (syncResult.NextCheckpoint != null)
            {
                await _repository.SaveCheckpointAsync(syncResult.NextCheckpoint, ct);
            }

            await _queue.CompleteJobAsync(job.JobId, _workerId, syncResult, ct);
            _logger.LogInformation("Job {JobId} completed successfully. Added: {Added}, Updated: {Updated}, Deleted: {Deleted}",
                job.JobId, syncResult.ItemsAdded, syncResult.ItemsUpdated, syncResult.ItemsDeleted);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job {JobId} failed on attempt {Attempt}", job.JobId, job.AttemptCount);
            bool isTransient = ex is HttpRequestException or TimeoutException;
            await _queue.FailJobAsync(job.JobId, _workerId, ex.Message, isTransient, ct);
        }
        finally
        {
            heartbeatCts.Cancel();
            try { await heartbeatTask; } catch { /* ignore heartbeat cancellation */ }
            _concurrencyLimiter.Release();
        }
    }

    private async Task StartHeartbeatAsync(string jobId, CancellationToken ct)
    {
        var interval = TimeSpan.FromSeconds(_leaseDuration.TotalSeconds / 3.0);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(interval, ct);
                bool renewed = await _queue.RenewLeaseAsync(jobId, _workerId, _leaseDuration, ct);
                if (!renewed)
                {
                    _logger.LogWarning("Heartbeat: failed to renew lease for job {JobId}", jobId);
                    break;
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Heartbeat exception for job {JobId}", jobId);
            }
        }
    }
}
