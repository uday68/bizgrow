using BizGrow.Connectors.Domain.Models;
using BizGrow.Connectors.Engine;
using Xunit;

namespace BizGrow.Connectors.Tests.Engine;

public class SyncWorkerEngineTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteSyncJobQueue _queue;
    private readonly SqliteDocumentRepository _repo;

    public SyncWorkerEngineTests()
    {
        _dbPath = $"test_queue_{Guid.NewGuid():N}.db";
        _queue = new SqliteSyncJobQueue(_dbPath);
        _repo = new SqliteDocumentRepository(_dbPath);
    }

    public void Dispose()
    {
        try
        {
            if (File.Exists(_dbPath))
            {
                File.Delete(_dbPath);
            }
        }
        catch
        {
            // Ignore file lock during test cleanup
        }
    }

    [Fact]
    public async Task Enqueue_WithSameDeduplicationKey_IsIdempotent()
    {
        // Arrange
        string dedupKey = "tenant-1:mock:Delta:20261015";

        // Act
        var job1 = await _queue.EnqueueAsync("tenant-1", "mock", SyncMode.Delta, dedupKey);
        var job2 = await _queue.EnqueueAsync("tenant-1", "mock", SyncMode.Delta, dedupKey);

        // Assert
        Assert.NotNull(job1);
        Assert.NotNull(job2);
        Assert.Equal(job1.JobId, job2.JobId); // Same job returned, not duplicated
    }

    [Fact]
    public async Task Dequeue_AcquiresLease_AndTransitionsStatusToRunning()
    {
        // Arrange
        var enqueued = await _queue.EnqueueAsync("tenant-2", "mock", SyncMode.Full);

        // Act
        var dequeued = await _queue.DequeueAsync("worker-alpha", TimeSpan.FromSeconds(60));

        // Assert
        Assert.NotNull(dequeued);
        Assert.Equal(enqueued.JobId, dequeued.JobId);
        Assert.Equal(SyncStatus.Running, dequeued.Status);
        Assert.Equal("worker-alpha", dequeued.WorkerId);
        Assert.NotNull(dequeued.LeaseExpiryUtc);
        Assert.True(dequeued.LeaseExpiryUtc > DateTime.UtcNow);
    }

    [Fact]
    public async Task CrashRecovery_ReclaimsJobsWithExpiredLeases()
    {
        // Arrange: enqueue and dequeue with very short lease (10ms)
        var enqueued = await _queue.EnqueueAsync("tenant-crash", "mock", SyncMode.Delta);
        var dequeued = await _queue.DequeueAsync("worker-crashed", TimeSpan.FromMilliseconds(20));
        Assert.NotNull(dequeued);

        // Wait for lease to expire
        await Task.Delay(50);

        // Act: run crash recovery
        int reclaimed = await _queue.ReclaimAbandonedJobsAsync();

        // Assert
        Assert.True(reclaimed >= 1);
        var jobAfterCrash = await _queue.GetJobAsync(enqueued.JobId);
        Assert.NotNull(jobAfterCrash);
        Assert.Equal(SyncStatus.Retrying, jobAfterCrash.Status);
        Assert.Contains("Lease expired", jobAfterCrash.ErrorMessage);
    }

    [Fact]
    public async Task CompleteJob_SetsStatusSucceededAndPersistsResult()
    {
        // Arrange
        var enqueued = await _queue.EnqueueAsync("tenant-comp", "mock", SyncMode.Full);
        var dequeued = await _queue.DequeueAsync("worker-beta", TimeSpan.FromSeconds(30));
        Assert.NotNull(dequeued);

        var syncResult = new SyncRunResult
        {
            Success = true,
            ItemsAdded = 15,
            ItemsUpdated = 2,
            ItemsDeleted = 0,
            Duration = TimeSpan.FromSeconds(1.2)
        };

        // Act
        await _queue.CompleteJobAsync(dequeued.JobId, "worker-beta", syncResult);

        // Assert
        var completed = await _queue.GetJobAsync(dequeued.JobId);
        Assert.NotNull(completed);
        Assert.Equal(SyncStatus.Succeeded, completed.Status);
        Assert.NotNull(completed.Result);
        Assert.Equal(15, completed.Result.ItemsAdded);
    }

    [Fact]
    public async Task DocumentRepository_UpsertsAndRetrievesDocumentsWithAcls()
    {
        // Arrange
        var doc = new ExternalDocument
        {
            TenantId = "tenant-repo",
            Provider = "mock",
            RemoteId = "remote-100",
            Name = "Strategic_Plan.pdf",
            MimeType = "application/pdf",
            WebUrl = "https://sharepoint/plan.pdf",
            SizeBytes = 1048576,
            VersionHash = "v1-hash",
            IsDeleted = false,
            Permissions = new List<DocumentPermission>
            {
                new("User", "ceo@bizgrow.local", "owner"),
                new("Group", "Board of Directors", "read")
            }
        };

        // Act
        await _repo.UpsertDocumentAsync(doc);
        var fetched = await _repo.GetDocumentAsync("tenant-repo", "mock", "remote-100");

        // Assert
        Assert.NotNull(fetched);
        Assert.Equal("Strategic_Plan.pdf", fetched.Name);
        Assert.Equal(2, fetched.Permissions.Count);
        Assert.Contains(fetched.Permissions, p => p.SubjectName == "ceo@bizgrow.local" && p.Role == "owner");
    }
}
