using System.Text.Json;
using BizGrow.Connectors.Domain.Interfaces;
using BizGrow.Connectors.Domain.Models;
using Microsoft.Data.Sqlite;

namespace BizGrow.Connectors.Engine;

public class SqliteSyncJobQueue : ISyncJobQueue
{
    private readonly string _connectionString;
    private readonly object _lock = new();

    public SqliteSyncJobQueue(string dbPath = "connector_data.db")
    {
        _connectionString = $"Data Source={dbPath}";
        InitializeDatabase();
    }

    private void InitializeDatabase()
    {
        using var conn = new SqliteConnection(_connectionString);
        conn.Open();

        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS connector_sync_jobs (
                job_id TEXT PRIMARY KEY,
                deduplication_key TEXT,
                tenant_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                max_retries INTEGER NOT NULL DEFAULT 3,
                enqueued_at_utc TEXT NOT NULL,
                started_at_utc TEXT,
                completed_at_utc TEXT,
                lease_expiry_utc TEXT,
                worker_id TEXT,
                error_message TEXT,
                result_json TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_status_enqueued ON connector_sync_jobs(status, enqueued_at_utc);
            CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON connector_sync_jobs(tenant_id, enqueued_at_utc);
            CREATE INDEX IF NOT EXISTS idx_jobs_dedup ON connector_sync_jobs(deduplication_key);
        ";
        cmd.ExecuteNonQuery();
    }

    public async Task<SyncJob> EnqueueAsync(string tenantId, string provider, SyncMode mode, string? deduplicationKey = null, CancellationToken ct = default)
    {
        deduplicationKey ??= $"{tenantId}:{provider}:{mode}:{DateTime.UtcNow:yyyyMMddHH}";

        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        // Check for existing active job with same deduplication key (Idempotency guarantee)
        await using var checkCmd = conn.CreateCommand();
        checkCmd.CommandText = @"
            SELECT * FROM connector_sync_jobs 
            WHERE deduplication_key = @dedup 
              AND status IN ('Queued', 'Running', 'Retrying')
            LIMIT 1";
        checkCmd.Parameters.AddWithValue("@dedup", deduplicationKey);

        await using var reader = await checkCmd.ExecuteReaderAsync(ct);
        if (await reader.ReadAsync(ct))
        {
            return MapJob(reader);
        }
        await reader.CloseAsync();

        var job = new SyncJob
        {
            JobId = Guid.NewGuid().ToString("N"),
            DeduplicationKey = deduplicationKey,
            TenantId = tenantId,
            Provider = provider,
            Mode = mode,
            Status = SyncStatus.Queued,
            AttemptCount = 0,
            MaxRetries = 3,
            EnqueuedAtUtc = DateTime.UtcNow
        };

        await using var insertCmd = conn.CreateCommand();
        insertCmd.CommandText = @"
            INSERT INTO connector_sync_jobs (
                job_id, deduplication_key, tenant_id, provider, mode, status,
                attempt_count, max_retries, enqueued_at_utc
            ) VALUES (
                @job_id, @dedup, @tenant_id, @provider, @mode, @status,
                @attempt_count, @max_retries, @enqueued_at_utc
            )";

        insertCmd.Parameters.AddWithValue("@job_id", job.JobId);
        insertCmd.Parameters.AddWithValue("@dedup", job.DeduplicationKey);
        insertCmd.Parameters.AddWithValue("@tenant_id", job.TenantId);
        insertCmd.Parameters.AddWithValue("@provider", job.Provider);
        insertCmd.Parameters.AddWithValue("@mode", job.Mode.ToString());
        insertCmd.Parameters.AddWithValue("@status", job.Status.ToString());
        insertCmd.Parameters.AddWithValue("@attempt_count", job.AttemptCount);
        insertCmd.Parameters.AddWithValue("@max_retries", job.MaxRetries);
        insertCmd.Parameters.AddWithValue("@enqueued_at_utc", job.EnqueuedAtUtc.ToString("o"));

        await insertCmd.ExecuteNonQueryAsync(ct);
        return job;
    }

    public async Task<SyncJob?> DequeueAsync(string workerId, TimeSpan leaseDuration, CancellationToken ct = default)
    {
        await Task.Yield();
        lock (_lock)
        {
            // Atomically select and lease the oldest runnable job
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();

            using var selectCmd = conn.CreateCommand();
            selectCmd.CommandText = @"
                SELECT job_id FROM connector_sync_jobs
                WHERE status IN ('Queued', 'Retrying')
                ORDER BY enqueued_at_utc ASC
                LIMIT 1";

            var candidateJobId = (string?)selectCmd.ExecuteScalar();
            if (candidateJobId == null) return null;

            var leaseExpiry = DateTime.UtcNow.Add(leaseDuration);
            using var updateCmd = conn.CreateCommand();
            updateCmd.CommandText = @"
                UPDATE connector_sync_jobs
                SET status = 'Running',
                    worker_id = @worker_id,
                    started_at_utc = @now,
                    lease_expiry_utc = @lease_expiry,
                    attempt_count = attempt_count + 1
                WHERE job_id = @job_id AND status IN ('Queued', 'Retrying')";

            updateCmd.Parameters.AddWithValue("@worker_id", workerId);
            updateCmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
            updateCmd.Parameters.AddWithValue("@lease_expiry", leaseExpiry.ToString("o"));
            updateCmd.Parameters.AddWithValue("@job_id", candidateJobId);

            int rows = updateCmd.ExecuteNonQuery();
            if (rows == 0) return null; // Another worker claimed it

            using var fetchCmd = conn.CreateCommand();
            fetchCmd.CommandText = "SELECT * FROM connector_sync_jobs WHERE job_id = @job_id";
            fetchCmd.Parameters.AddWithValue("@job_id", candidateJobId);

            using var reader = fetchCmd.ExecuteReader();
            if (reader.Read())
            {
                return MapJob(reader);
            }

            return null;
        }
    }

    public async Task<bool> RenewLeaseAsync(string jobId, string workerId, TimeSpan leaseDuration, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        var newExpiry = DateTime.UtcNow.Add(leaseDuration);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE connector_sync_jobs
            SET lease_expiry_utc = @new_expiry
            WHERE job_id = @job_id AND worker_id = @worker_id AND status = 'Running'";

        cmd.Parameters.AddWithValue("@new_expiry", newExpiry.ToString("o"));
        cmd.Parameters.AddWithValue("@job_id", jobId);
        cmd.Parameters.AddWithValue("@worker_id", workerId);

        int affected = await cmd.ExecuteNonQueryAsync(ct);
        return affected > 0;
    }

    public async Task CompleteJobAsync(string jobId, string workerId, SyncRunResult result, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE connector_sync_jobs
            SET status = 'Succeeded',
                completed_at_utc = @completed_at,
                result_json = @result_json,
                lease_expiry_utc = NULL
            WHERE job_id = @job_id";

        cmd.Parameters.AddWithValue("@completed_at", DateTime.UtcNow.ToString("o"));
        cmd.Parameters.AddWithValue("@result_json", JsonSerializer.Serialize(result));
        cmd.Parameters.AddWithValue("@job_id", jobId);

        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task FailJobAsync(string jobId, string workerId, string error, bool canRetry, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        // Fetch current attempt count and max retries
        await using var selectCmd = conn.CreateCommand();
        selectCmd.CommandText = "SELECT attempt_count, max_retries FROM connector_sync_jobs WHERE job_id = @job_id";
        selectCmd.Parameters.AddWithValue("@job_id", jobId);

        int attempts = 1;
        int maxRetries = 3;
        await using (var reader = await selectCmd.ExecuteReaderAsync(ct))
        {
            if (await reader.ReadAsync(ct))
            {
                attempts = reader.GetInt32(0);
                maxRetries = reader.GetInt32(1);
            }
        }

        bool retryEligible = canRetry && attempts < maxRetries;
        string newStatus = retryEligible ? "Retrying" : "Failed";

        await using var updateCmd = conn.CreateCommand();
        updateCmd.CommandText = @"
            UPDATE connector_sync_jobs
            SET status = @status,
                error_message = @error,
                completed_at_utc = CASE WHEN @status = 'Failed' THEN @now ELSE NULL END,
                lease_expiry_utc = NULL
            WHERE job_id = @job_id";

        updateCmd.Parameters.AddWithValue("@status", newStatus);
        updateCmd.Parameters.AddWithValue("@error", error);
        updateCmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
        updateCmd.Parameters.AddWithValue("@job_id", jobId);

        await updateCmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<SyncJob?> GetJobAsync(string jobId, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT * FROM connector_sync_jobs WHERE job_id = @job_id";
        cmd.Parameters.AddWithValue("@job_id", jobId);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (await reader.ReadAsync(ct))
        {
            return MapJob(reader);
        }

        return null;
    }

    public async Task<IReadOnlyList<SyncJob>> GetTenantJobsAsync(string tenantId, int limit = 20, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT * FROM connector_sync_jobs WHERE tenant_id = @tenant_id ORDER BY enqueued_at_utc DESC LIMIT @limit";
        cmd.Parameters.AddWithValue("@tenant_id", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<SyncJob>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            list.Add(MapJob(reader));
        }

        return list;
    }

    public async Task<int> ReclaimAbandonedJobsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        // Find jobs in 'Running' state where lease_expiry_utc < now
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE connector_sync_jobs
            SET status = CASE WHEN attempt_count >= max_retries THEN 'Failed' ELSE 'Retrying' END,
                error_message = 'Lease expired without worker heartbeat (crash recovery)',
                lease_expiry_utc = NULL
            WHERE status = 'Running'
              AND lease_expiry_utc IS NOT NULL
              AND lease_expiry_utc < @now";

        cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    private static SyncJob MapJob(SqliteDataReader reader)
    {
        var resultJson = reader.IsDBNull(reader.GetOrdinal("result_json")) ? null : reader.GetString(reader.GetOrdinal("result_json"));
        var result = string.IsNullOrEmpty(resultJson) ? null : JsonSerializer.Deserialize<SyncRunResult>(resultJson);

        return new SyncJob
        {
            JobId = reader.GetString(reader.GetOrdinal("job_id")),
            DeduplicationKey = reader.IsDBNull(reader.GetOrdinal("deduplication_key")) ? "" : reader.GetString(reader.GetOrdinal("deduplication_key")),
            TenantId = reader.GetString(reader.GetOrdinal("tenant_id")),
            Provider = reader.GetString(reader.GetOrdinal("provider")),
            Mode = Enum.Parse<SyncMode>(reader.GetString(reader.GetOrdinal("mode"))),
            Status = Enum.Parse<SyncStatus>(reader.GetString(reader.GetOrdinal("status"))),
            AttemptCount = reader.GetInt32(reader.GetOrdinal("attempt_count")),
            MaxRetries = reader.GetInt32(reader.GetOrdinal("max_retries")),
            EnqueuedAtUtc = DateTime.Parse(reader.GetString(reader.GetOrdinal("enqueued_at_utc"))),
            StartedAtUtc = reader.IsDBNull(reader.GetOrdinal("started_at_utc")) ? null : DateTime.Parse(reader.GetString(reader.GetOrdinal("started_at_utc"))),
            CompletedAtUtc = reader.IsDBNull(reader.GetOrdinal("completed_at_utc")) ? null : DateTime.Parse(reader.GetString(reader.GetOrdinal("completed_at_utc"))),
            LeaseExpiryUtc = reader.IsDBNull(reader.GetOrdinal("lease_expiry_utc")) ? null : DateTime.Parse(reader.GetString(reader.GetOrdinal("lease_expiry_utc"))),
            WorkerId = reader.IsDBNull(reader.GetOrdinal("worker_id")) ? null : reader.GetString(reader.GetOrdinal("worker_id")),
            ErrorMessage = reader.IsDBNull(reader.GetOrdinal("error_message")) ? null : reader.GetString(reader.GetOrdinal("error_message")),
            Result = result
        };
    }
}
