using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using BizGrow.Connectors.Domain.Interfaces;
using BizGrow.Connectors.Domain.Models;

namespace BizGrow.Connectors.Providers.Mock;

public class MockConnectorProvider : IConnectorProvider
{
    public string ProviderName => "mock";

    public Task<ConnectorHealth> CheckHealthAsync(ConnectionAuthContext auth, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        sw.Stop();
        return Task.FromResult(new ConnectorHealth
        {
            Status = HealthStatus.Healthy,
            Provider = ProviderName,
            Message = "Deterministic Mock Provider is healthy and operational (offline)",
            LatencyMs = sw.ElapsedMilliseconds,
            CheckedAtUtc = DateTime.UtcNow
        });
    }

    public Task<ExternalAccount> ValidateAndConnectAsync(ConnectionAuthContext auth, CancellationToken ct = default)
    {
        var tenantId = string.IsNullOrWhiteSpace(auth.TenantId) ? "tenant-default" : auth.TenantId;
        return Task.FromResult(new ExternalAccount
        {
            AccountId = $"acc-mock-{tenantId}",
            TenantId = tenantId,
            Provider = ProviderName,
            Email = $"integration@{tenantId}.bizgrow.local",
            DisplayName = $"Mock Integration ({tenantId})",
            ConnectedAtUtc = DateTime.UtcNow,
            Scopes = new List<string> { "Files.Read.All", "Sites.Read.All", "offline_access" },
            Status = "Connected"
        });
    }

    public async Task<SyncRunResult> ExecuteSyncAsync(
        ConnectionAuthContext auth,
        SyncMode mode,
        SyncCheckpoint? currentCheckpoint,
        Func<ExternalDocument, Task> onDocumentDiscoveredAsync,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var tenantId = string.IsNullOrWhiteSpace(auth.TenantId) ? "tenant-default" : auth.TenantId;

        // Check if transient throttling is simulated
        if (auth.CustomParameters.TryGetValue("simulate_throttling", out var throttleVal) && throttleVal == "true")
        {
            await Task.Delay(50, ct); // brief delay
        }

        int added = 0;
        int updated = 0;
        int deleted = 0;

        bool isDelta = mode == SyncMode.Delta && !string.IsNullOrEmpty(currentCheckpoint?.DeltaToken);

        if (!isDelta)
        {
            // Initial full sync: produce 10 deterministic documents across departments
            var initialDocs = GenerateDeterministicDocs(tenantId, 1, 10);
            foreach (var doc in initialDocs)
            {
                ct.ThrowIfCancellationRequested();
                await onDocumentDiscoveredAsync(doc);
                added++;
            }
        }
        else
        {
            // Delta sync: parse current token iteration, produce updates and 1 deletion
            int tokenIteration = 1;
            if (currentCheckpoint?.DeltaToken?.StartsWith("token-v") == true &&
                int.TryParse(currentCheckpoint.DeltaToken.Replace("token-v", string.Empty), out var parsed))
            {
                tokenIteration = parsed + 1;
            }

            var deltaDocs = GenerateDeterministicDocs(tenantId, tokenIteration * 5, 3);
            foreach (var doc in deltaDocs)
            {
                ct.ThrowIfCancellationRequested();
                doc.VersionHash = $"hash-v{tokenIteration}-{doc.RemoteId}";
                doc.LastModifiedUtc = DateTime.UtcNow;
                await onDocumentDiscoveredAsync(doc);
                updated++;
            }

            // Also emit 1 tombstone deletion
            var tombstone = new ExternalDocument
            {
                TenantId = tenantId,
                Provider = ProviderName,
                RemoteId = $"doc-deleted-{tokenIteration}",
                Name = $"Archived-Item-{tokenIteration}.pdf",
                IsDeleted = true,
                LastModifiedUtc = DateTime.UtcNow
            };
            await onDocumentDiscoveredAsync(tombstone);
            deleted++;
        }

        sw.Stop();
        int nextVersion = isDelta ? (int.TryParse(currentCheckpoint?.DeltaToken?.Replace("token-v", "") ?? "1", out var v) ? v + 1 : 2) : 1;

        var nextCheckpoint = new SyncCheckpoint
        {
            Provider = ProviderName,
            TenantId = tenantId,
            DeltaToken = $"token-v{nextVersion}",
            CursorTimestampUtc = DateTime.UtcNow,
            LastSyncStatus = "Success",
            TotalItemsProcessed = (currentCheckpoint?.TotalItemsProcessed ?? 0) + added + updated + deleted
        };

        return new SyncRunResult
        {
            Success = true,
            ItemsAdded = added,
            ItemsUpdated = updated,
            ItemsDeleted = deleted,
            NextCheckpoint = nextCheckpoint,
            Duration = sw.Elapsed
        };
    }

    private static List<ExternalDocument> GenerateDeterministicDocs(string tenantId, int startIndex, int count)
    {
        var docs = new List<ExternalDocument>();
        string[] departments = { "Engineering", "Finance", "Legal", "Operations", "Sales" };
        string[] extensions = { "pdf", "docx", "xlsx", "pptx" };

        for (int i = 0; i < count; i++)
        {
            int idx = startIndex + i;
            var dept = departments[idx % departments.Length];
            var ext = extensions[idx % extensions.Length];
            string remoteId = $"item-{idx:D4}";

            var doc = new ExternalDocument
            {
                TenantId = tenantId,
                Provider = "mock",
                RemoteId = remoteId,
                Name = $"{dept}-Q{((idx % 4) + 1)}-Report.{ext}",
                MimeType = ext switch
                {
                    "pdf" => "application/pdf",
                    "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    _ => "application/octet-stream"
                },
                WebUrl = $"https://sharepoint.bizgrow.local/sites/{dept.ToLowerInvariant()}/Shared%20Documents/{remoteId}.{ext}",
                ParentPath = $"/Shared Documents/{dept}",
                SizeBytes = 1024 * (idx + 1) * 37,
                VersionHash = ComputeHash($"{remoteId}-v1"),
                IsDeleted = false,
                LastModifiedUtc = DateTime.UtcNow.AddDays(-idx),
                Permissions = new List<DocumentPermission>
                {
                    new("Group", $"{dept} Team", "read", Inherited: true),
                    new("User", $"lead@{dept.ToLowerInvariant()}.bizgrow.local", "write", Inherited: false),
                    new("User", "admin@bizgrow.local", "owner", Inherited: true)
                }
            };
            docs.Add(doc);
        }

        return docs;
    }

    private static string ComputeHash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant()[..16];
    }
}
