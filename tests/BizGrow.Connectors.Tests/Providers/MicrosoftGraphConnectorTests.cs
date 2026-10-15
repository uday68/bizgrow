using System.Net;
using System.Text;
using BizGrow.Connectors.Domain.Models;
using BizGrow.Connectors.Providers.MicrosoftGraph;
using Xunit;

namespace BizGrow.Connectors.Tests.Providers;

public class MicrosoftGraphConnectorTests
{
    private class MockHttpMessageHandler : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> _responses = new();
        public List<HttpRequestMessage> CapturedRequests { get; } = new();

        public void EnqueueResponse(HttpResponseMessage response) => _responses.Enqueue(response);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CapturedRequests.Add(request);
            if (_responses.Count > 0)
            {
                return Task.FromResult(_responses.Dequeue());
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }

    [Fact]
    public async Task DeltaSync_FollowsNextLink_AndSavesDeltaLinkCheckpoint()
    {
        // Arrange
        var mockHandler = new MockHttpMessageHandler();

        // Page 1: returns 1 item and @odata.nextLink
        var page1Json = @"{
            ""@odata.nextLink"": ""https://graph.microsoft.com/v1.0/me/drive/root/delta?token=page2"",
            ""value"": [
                {
                    ""id"": ""item-001"",
                    ""name"": ""Contract-2026.docx"",
                    ""webUrl"": ""https://contoso.sharepoint.com/doc1"",
                    ""size"": 2048,
                    ""eTag"": ""etag-001"",
                    ""file"": { ""mimeType"": ""application/vnd.openxmlformats-officedocument.wordprocessingml.document"" },
                    ""lastModifiedDateTime"": ""2026-01-15T10:00:00Z"",
                    ""permissions"": [
                        {
                            ""roles"": [""read""],
                            ""grantedToV2"": { ""user"": { ""displayName"": ""Alice Smith"" } }
                        }
                    ]
                }
            ]
        }";

        // Page 2: returns 1 item and final @odata.deltaLink
        var page2Json = @"{
            ""@odata.deltaLink"": ""https://graph.microsoft.com/v1.0/me/drive/root/delta?token=final-delta-cursor"",
            ""value"": [
                {
                    ""id"": ""item-002"",
                    ""name"": ""Summary.pdf"",
                    ""webUrl"": ""https://contoso.sharepoint.com/doc2"",
                    ""size"": 4096,
                    ""eTag"": ""etag-002"",
                    ""file"": { ""mimeType"": ""application/pdf"" },
                    ""lastModifiedDateTime"": ""2026-01-16T10:00:00Z"",
                    ""permissions"": [
                        {
                            ""roles"": [""write""],
                            ""grantedToV2"": { ""group"": { ""displayName"": ""Finance Group"" } }
                        }
                    ]
                }
            ]
        }";

        mockHandler.EnqueueResponse(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(page1Json, Encoding.UTF8, "application/json")
        });

        mockHandler.EnqueueResponse(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(page2Json, Encoding.UTF8, "application/json")
        });

        var client = new HttpClient(mockHandler);
        var provider = new MicrosoftGraphConnectorProvider(client);
        var auth = new ConnectionAuthContext { TenantId = "tenant-delta", AccessToken = "valid-test-token" };
        var discovered = new List<ExternalDocument>();

        // Act
        var result = await provider.ExecuteSyncAsync(auth, SyncMode.Full, null, doc =>
        {
            discovered.Add(doc);
            return Task.CompletedTask;
        });

        // Assert
        Assert.True(result.Success);
        Assert.Equal(2, result.ItemsAdded);
        Assert.Equal(2, discovered.Count);
        Assert.Equal(2, mockHandler.CapturedRequests.Count);

        // Checkpoint should capture final deltaLink
        Assert.NotNull(result.NextCheckpoint);
        Assert.Equal("https://graph.microsoft.com/v1.0/me/drive/root/delta?token=final-delta-cursor", result.NextCheckpoint.DeltaToken);

        // Verify ACLs
        var doc1 = discovered.First(d => d.RemoteId == "item-001");
        Assert.Equal("Contract-2026.docx", doc1.Name);
        Assert.Contains(doc1.Permissions, p => p.SubjectName == "Alice Smith" && p.Role == "read");

        var doc2 = discovered.First(d => d.RemoteId == "item-002");
        Assert.Equal("Summary.pdf", doc2.Name);
        Assert.Contains(doc2.Permissions, p => p.SubjectName == "Finance Group" && p.Role == "write" && p.SubjectType == "Group");
    }

    [Fact]
    public async Task SendWithThrottlingRetry_When429Returned_BacksOffAndRetriesSuccessfully()
    {
        // Arrange
        var mockHandler = new MockHttpMessageHandler();

        // 1st request returns HTTP 429 Too Many Requests with Retry-After: 0
        var throttleResponse = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
        throttleResponse.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromMilliseconds(50));
        mockHandler.EnqueueResponse(throttleResponse);

        // 2nd request succeeds with HTTP 200 OK
        var successResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(@"{""id"":""org-1"",""displayName"":""Contoso Corp""}", Encoding.UTF8, "application/json")
        };
        mockHandler.EnqueueResponse(successResponse);

        var client = new HttpClient(mockHandler);
        var provider = new MicrosoftGraphConnectorProvider(client);
        var auth = new ConnectionAuthContext { TenantId = "tenant-retry", AccessToken = "test-token" };

        // Act
        var health = await provider.CheckHealthAsync(auth);

        // Assert
        Assert.Equal(HealthStatus.Healthy, health.Status);
        Assert.Equal(2, mockHandler.CapturedRequests.Count); // Verified that it retried after 429
    }
}
