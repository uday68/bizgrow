using BizGrow.Connectors.Domain.Models;
using BizGrow.Connectors.Providers.Mock;
using Xunit;

namespace BizGrow.Connectors.Tests.Providers;

public class MockConnectorTests
{
    [Fact]
    public async Task FullSync_GeneratesDeterministicDocumentsWithAcls()
    {
        // Arrange
        var provider = new MockConnectorProvider();
        var auth = new ConnectionAuthContext { TenantId = "tenant-gamma", Provider = "mock" };
        var discovered = new List<ExternalDocument>();

        // Act
        var result = await provider.ExecuteSyncAsync(auth, SyncMode.Full, null, doc =>
        {
            discovered.Add(doc);
            return Task.CompletedTask;
        });

        // Assert
        Assert.True(result.Success);
        Assert.Equal(10, result.ItemsAdded);
        Assert.Equal(0, result.ItemsDeleted);
        Assert.Equal(10, discovered.Count);
        Assert.NotNull(result.NextCheckpoint);
        Assert.Equal("token-v1", result.NextCheckpoint.DeltaToken);

        // Verify ACLs
        var firstDoc = discovered.First();
        Assert.NotEmpty(firstDoc.Permissions);
        Assert.Contains(firstDoc.Permissions, p => p.Role == "owner");
        Assert.Contains(firstDoc.Permissions, p => p.Role == "read");
    }

    [Fact]
    public async Task DeltaSync_WithExistingCheckpoint_ProducesUpdatesAndDeletions()
    {
        // Arrange
        var provider = new MockConnectorProvider();
        var auth = new ConnectionAuthContext { TenantId = "tenant-gamma", Provider = "mock" };
        var currentCheckpoint = new SyncCheckpoint
        {
            TenantId = "tenant-gamma",
            Provider = "mock",
            DeltaToken = "token-v1",
            TotalItemsProcessed = 10
        };

        var discovered = new List<ExternalDocument>();

        // Act
        var result = await provider.ExecuteSyncAsync(auth, SyncMode.Delta, currentCheckpoint, doc =>
        {
            discovered.Add(doc);
            return Task.CompletedTask;
        });

        // Assert
        Assert.True(result.Success);
        Assert.Equal(3, result.ItemsUpdated);
        Assert.Equal(1, result.ItemsDeleted);
        Assert.Contains(discovered, d => d.IsDeleted);
        Assert.NotNull(result.NextCheckpoint);
        Assert.Equal("token-v2", result.NextCheckpoint.DeltaToken);
        Assert.Equal(14, result.NextCheckpoint.TotalItemsProcessed);
    }
}
