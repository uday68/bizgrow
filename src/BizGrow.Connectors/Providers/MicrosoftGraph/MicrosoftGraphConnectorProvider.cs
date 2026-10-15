using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using BizGrow.Connectors.Domain.Interfaces;
using BizGrow.Connectors.Domain.Models;
using Microsoft.Extensions.Logging;

namespace BizGrow.Connectors.Providers.MicrosoftGraph;

public class MicrosoftGraphConnectorProvider : IConnectorProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<MicrosoftGraphConnectorProvider>? _logger;

    public string ProviderName => "microsoft-graph";

    public MicrosoftGraphConnectorProvider(HttpClient httpClient, ILogger<MicrosoftGraphConnectorProvider>? logger = null)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<ConnectorHealth> CheckHealthAsync(ConnectionAuthContext auth, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/organization");
            ApplyAuthorization(request, auth);

            var response = await SendWithThrottlingRetryAsync(request, ct);
            sw.Stop();

            if (response.IsSuccessStatusCode)
            {
                return new ConnectorHealth
                {
                    Status = HealthStatus.Healthy,
                    Provider = ProviderName,
                    Message = "Microsoft Graph API reachable and authenticated",
                    LatencyMs = sw.ElapsedMilliseconds,
                    CheckedAtUtc = DateTime.UtcNow
                };
            }

            return new ConnectorHealth
            {
                Status = response.StatusCode == HttpStatusCode.Unauthorized ? HealthStatus.Unhealthy : HealthStatus.Degraded,
                Provider = ProviderName,
                Message = $"Graph API responded with HTTP {(int)response.StatusCode}: {response.ReasonPhrase}",
                LatencyMs = sw.ElapsedMilliseconds,
                CheckedAtUtc = DateTime.UtcNow
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new ConnectorHealth
            {
                Status = HealthStatus.Unhealthy,
                Provider = ProviderName,
                Message = $"Connection failed: {ex.Message}",
                LatencyMs = sw.ElapsedMilliseconds,
                CheckedAtUtc = DateTime.UtcNow
            };
        }
    }

    public async Task<ExternalAccount> ValidateAndConnectAsync(ConnectionAuthContext auth, CancellationToken ct = default)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/me");
        ApplyAuthorization(request, auth);

        var response = await SendWithThrottlingRetryAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            // If /me fails (e.g. app-only daemon token), query /organization
            request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/organization");
            ApplyAuthorization(request, auth);
            response = await SendWithThrottlingRetryAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Failed to validate Microsoft Graph connection: HTTP {(int)response.StatusCode}");
            }
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        string id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? Guid.NewGuid().ToString() : "unknown-id";
        string displayName = root.TryGetProperty("displayName", out var nameProp) ? nameProp.GetString() ?? "Microsoft 365 Tenant" : "Microsoft 365 Tenant";
        string mail = root.TryGetProperty("userPrincipalName", out var mailProp) ? mailProp.GetString() ?? $"{auth.TenantId}@bizgrow.onmicrosoft.com" : $"{auth.TenantId}@bizgrow.onmicrosoft.com";

        return new ExternalAccount
        {
            AccountId = id,
            TenantId = auth.TenantId,
            Provider = ProviderName,
            Email = mail,
            DisplayName = displayName,
            ConnectedAtUtc = DateTime.UtcNow,
            Scopes = new List<string> { "Files.Read.All", "Sites.Read.All", "User.Read" },
            Status = "Connected"
        };
    }

    public async Task<SyncRunResult> ExecuteSyncAsync(
        ConnectionAuthContext auth,
        SyncMode mode,
        SyncCheckpoint? currentCheckpoint,
        Func<ExternalDocument, Task> onDocumentDiscoveredAsync,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        int added = 0;
        int updated = 0;
        int deleted = 0;

        string? currentUrl;
        if (mode == SyncMode.Delta && !string.IsNullOrEmpty(currentCheckpoint?.DeltaToken))
        {
            // DeltaToken stores the full delta link or the delta token query param
            currentUrl = currentCheckpoint.DeltaToken.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? currentCheckpoint.DeltaToken
                : $"https://graph.microsoft.com/v1.0/me/drive/root/delta?token={Uri.EscapeDataString(currentCheckpoint.DeltaToken)}";
        }
        else
        {
            currentUrl = "https://graph.microsoft.com/v1.0/me/drive/root/delta";
        }

        string? newDeltaLink = null;

        while (!string.IsNullOrEmpty(currentUrl))
        {
            ct.ThrowIfCancellationRequested();

            var request = new HttpRequestMessage(HttpMethod.Get, currentUrl);
            ApplyAuthorization(request, auth);

            var response = await SendWithThrottlingRetryAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(ct);
                throw new HttpRequestException($"Microsoft Graph delta request failed with HTTP {(int)response.StatusCode}: {errorBody}");
            }

            var contentStream = await response.Content.ReadAsStreamAsync(ct);
            using var jsonDoc = await JsonDocument.ParseAsync(contentStream, cancellationToken: ct);
            var root = jsonDoc.RootElement;

            if (root.TryGetProperty("value", out var itemsArray) && itemsArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in itemsArray.EnumerateArray())
                {
                    ct.ThrowIfCancellationRequested();
                    var doc = ParseDriveItem(item, auth.TenantId);
                    await onDocumentDiscoveredAsync(doc);

                    if (doc.IsDeleted)
                        deleted++;
                    else if (mode == SyncMode.Delta && currentCheckpoint?.DeltaToken != null)
                        updated++;
                    else
                        added++;
                }
            }

            // Check for nextLink (pagination) or deltaLink (end of current sync cycle)
            if (root.TryGetProperty("@odata.nextLink", out var nextLinkProp))
            {
                currentUrl = nextLinkProp.GetString();
            }
            else
            {
                currentUrl = null;
            }

            if (root.TryGetProperty("@odata.deltaLink", out var deltaLinkProp))
            {
                newDeltaLink = deltaLinkProp.GetString();
            }
        }

        sw.Stop();

        var nextCheckpoint = new SyncCheckpoint
        {
            Provider = ProviderName,
            TenantId = auth.TenantId,
            DeltaToken = newDeltaLink ?? currentCheckpoint?.DeltaToken,
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

    public async Task<HttpResponseMessage> SendWithThrottlingRetryAsync(HttpRequestMessage request, CancellationToken ct = default, int maxRetries = 4)
    {
        int attempt = 0;
        while (true)
        {
            attempt++;
            ct.ThrowIfCancellationRequested();

            // Clone request for retries if needed
            HttpRequestMessage requestToSend = request;
            if (attempt > 1)
            {
                requestToSend = CloneHttpRequest(request);
            }

            var response = await _httpClient.SendAsync(requestToSend, ct);

            // Check if throttled (HTTP 429) or transient server errors (HTTP 503, 504)
            if ((response.StatusCode == HttpStatusCode.TooManyRequests ||
                 response.StatusCode == HttpStatusCode.ServiceUnavailable ||
                 response.StatusCode == HttpStatusCode.GatewayTimeout) && attempt <= maxRetries)
            {
                TimeSpan delay = TimeSpan.FromMilliseconds(200 * Math.Pow(2, attempt - 1));

                if (response.Headers.RetryAfter != null)
                {
                    if (response.Headers.RetryAfter.Delta.HasValue)
                    {
                        delay = response.Headers.RetryAfter.Delta.Value;
                    }
                    else if (response.Headers.RetryAfter.Date.HasValue)
                    {
                        var diff = response.Headers.RetryAfter.Date.Value - DateTimeOffset.UtcNow;
                        if (diff > TimeSpan.Zero) delay = diff;
                    }
                }

                _logger?.LogWarning("HTTP {StatusCode} encountered on attempt {Attempt}. Backing off for {DelayMs} ms", 
                    (int)response.StatusCode, attempt, delay.TotalMilliseconds);

                // Add jitter
                var jitter = TimeSpan.FromMilliseconds(Random.Shared.Next(10, 80));
                await Task.Delay(delay + jitter, ct);
                continue;
            }

            return response;
        }
    }

    private ExternalDocument ParseDriveItem(JsonElement item, string tenantId)
    {
        string remoteId = item.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
        string name = item.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "" : "";
        string webUrl = item.TryGetProperty("webUrl", out var urlProp) ? urlProp.GetString() ?? "" : "";
        long size = item.TryGetProperty("size", out var sizeProp) ? sizeProp.GetInt64() : 0;
        string versionHash = item.TryGetProperty("eTag", out var etagProp) ? etagProp.GetString() ?? "" : "";
        bool isDeleted = item.TryGetProperty("deleted", out _);

        string parentPath = "/";
        if (item.TryGetProperty("parentReference", out var parentRef) && parentRef.TryGetProperty("path", out var pathProp))
        {
            parentPath = pathProp.GetString() ?? "/";
        }

        string mimeType = "application/octet-stream";
        if (item.TryGetProperty("file", out var fileProp) && fileProp.TryGetProperty("mimeType", out var mimeProp))
        {
            mimeType = mimeProp.GetString() ?? "application/octet-stream";
        }

        DateTime lastModified = DateTime.UtcNow;
        if (item.TryGetProperty("lastModifiedDateTime", out var modProp) && modProp.TryGetDateTime(out var dt))
        {
            lastModified = dt.ToUniversalTime();
        }

        var permissions = new List<DocumentPermission>();
        if (item.TryGetProperty("permissions", out var permsArray) && permsArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var perm in permsArray.EnumerateArray())
            {
                string role = "read";
                if (perm.TryGetProperty("roles", out var rolesArr) && rolesArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var r in rolesArr.EnumerateArray())
                    {
                        var roleStr = r.GetString();
                        if (roleStr == "write" || roleStr == "owner") { role = roleStr; break; }
                    }
                }

                string subjectType = "User";
                string subjectName = "Everyone";

                if (perm.TryGetProperty("grantedToV2", out var g2) && g2.TryGetProperty("user", out var usr))
                {
                    subjectType = "User";
                    subjectName = usr.TryGetProperty("displayName", out var dn) ? dn.GetString() ?? "User" : "User";
                }
                else if (perm.TryGetProperty("grantedToV2", out var gGroup) && gGroup.TryGetProperty("group", out var grp))
                {
                    subjectType = "Group";
                    subjectName = grp.TryGetProperty("displayName", out var dn) ? dn.GetString() ?? "Group" : "Group";
                }

                permissions.Add(new DocumentPermission(subjectType, subjectName, role, Inherited: perm.TryGetProperty("inheritedFrom", out _)));
            }
        }

        if (permissions.Count == 0)
        {
            permissions.Add(new DocumentPermission("User", "Domain Users", "read", Inherited: true));
        }

        return new ExternalDocument
        {
            TenantId = tenantId,
            Provider = ProviderName,
            RemoteId = remoteId,
            Name = name,
            MimeType = mimeType,
            WebUrl = webUrl,
            ParentPath = parentPath,
            SizeBytes = size,
            VersionHash = versionHash,
            IsDeleted = isDeleted,
            LastModifiedUtc = lastModified,
            Permissions = permissions
        };
    }

    private static void ApplyAuthorization(HttpRequestMessage request, ConnectionAuthContext auth)
    {
        if (!string.IsNullOrEmpty(auth.AccessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        }
    }

    private static HttpRequestMessage CloneHttpRequest(HttpRequestMessage req)
    {
        var clone = new HttpRequestMessage(req.Method, req.RequestUri);
        foreach (var header in req.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }
        return clone;
    }
}
