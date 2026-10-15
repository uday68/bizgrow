namespace BizGrow.Connectors.Domain.Models;

public record DocumentPermission(
    string SubjectType, // "User", "Group", "Anyone"
    string SubjectName,
    string Role,        // "read", "write", "owner"
    bool Inherited = false
);

public class ExternalDocument
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string TenantId { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string RemoteId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string MimeType { get; set; } = "application/octet-stream";
    public string WebUrl { get; set; } = string.Empty;
    public string ParentPath { get; set; } = "/";
    public long SizeBytes { get; set; }
    public string VersionHash { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
    public DateTime LastModifiedUtc { get; set; } = DateTime.UtcNow;
    public DateTime SyncedAtUtc { get; set; } = DateTime.UtcNow;
    public List<DocumentPermission> Permissions { get; set; } = new();
}
