using System.Text.Json;
using BizGrow.Connectors.Domain.Interfaces;
using BizGrow.Connectors.Domain.Models;
using Microsoft.Data.Sqlite;

namespace BizGrow.Connectors.Engine;

public class SqliteDocumentRepository : IDocumentRepository
{
    private readonly string _connectionString;

    public SqliteDocumentRepository(string dbPath = "connector_data.db")
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
            CREATE TABLE IF NOT EXISTS connector_documents (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                remote_id TEXT NOT NULL,
                name TEXT NOT NULL,
                mime_type TEXT,
                web_url TEXT,
                parent_path TEXT,
                size_bytes INTEGER,
                version_hash TEXT,
                is_deleted INTEGER,
                last_modified_utc TEXT,
                synced_at_utc TEXT,
                permissions_json TEXT,
                UNIQUE(tenant_id, provider, remote_id)
            );

            CREATE TABLE IF NOT EXISTS connector_checkpoints (
                tenant_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                delta_token TEXT,
                next_link TEXT,
                cursor_timestamp_utc TEXT,
                last_sync_status TEXT,
                total_items_processed INTEGER,
                PRIMARY KEY (tenant_id, provider)
            );

            CREATE INDEX IF NOT EXISTS idx_docs_tenant_provider ON connector_documents(tenant_id, provider);
        ";
        cmd.ExecuteNonQuery();
    }

    public async Task UpsertDocumentAsync(ExternalDocument document, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO connector_documents (
                id, tenant_id, provider, remote_id, name, mime_type, web_url,
                parent_path, size_bytes, version_hash, is_deleted, last_modified_utc,
                synced_at_utc, permissions_json
            ) VALUES (
                @id, @tenant_id, @provider, @remote_id, @name, @mime_type, @web_url,
                @parent_path, @size_bytes, @version_hash, @is_deleted, @last_modified_utc,
                @synced_at_utc, @permissions_json
            )
            ON CONFLICT(tenant_id, provider, remote_id) DO UPDATE SET
                name = excluded.name,
                mime_type = excluded.mime_type,
                web_url = excluded.web_url,
                parent_path = excluded.parent_path,
                size_bytes = excluded.size_bytes,
                version_hash = excluded.version_hash,
                is_deleted = excluded.is_deleted,
                last_modified_utc = excluded.last_modified_utc,
                synced_at_utc = excluded.synced_at_utc,
                permissions_json = excluded.permissions_json;
        ";

        cmd.Parameters.AddWithValue("@id", document.Id);
        cmd.Parameters.AddWithValue("@tenant_id", document.TenantId);
        cmd.Parameters.AddWithValue("@provider", document.Provider);
        cmd.Parameters.AddWithValue("@remote_id", document.RemoteId);
        cmd.Parameters.AddWithValue("@name", document.Name);
        cmd.Parameters.AddWithValue("@mime_type", document.MimeType);
        cmd.Parameters.AddWithValue("@web_url", document.WebUrl);
        cmd.Parameters.AddWithValue("@parent_path", document.ParentPath);
        cmd.Parameters.AddWithValue("@size_bytes", document.SizeBytes);
        cmd.Parameters.AddWithValue("@version_hash", document.VersionHash);
        cmd.Parameters.AddWithValue("@is_deleted", document.IsDeleted ? 1 : 0);
        cmd.Parameters.AddWithValue("@last_modified_utc", document.LastModifiedUtc.ToString("o"));
        cmd.Parameters.AddWithValue("@synced_at_utc", document.SyncedAtUtc.ToString("o"));
        cmd.Parameters.AddWithValue("@permissions_json", JsonSerializer.Serialize(document.Permissions));

        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<ExternalDocument?> GetDocumentAsync(string tenantId, string provider, string remoteId, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT * FROM connector_documents WHERE tenant_id = @tenant_id AND provider = @provider AND remote_id = @remote_id LIMIT 1";
        cmd.Parameters.AddWithValue("@tenant_id", tenantId);
        cmd.Parameters.AddWithValue("@provider", provider);
        cmd.Parameters.AddWithValue("@remote_id", remoteId);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (await reader.ReadAsync(ct))
        {
            return MapDocument(reader);
        }

        return null;
    }

    public async Task<IReadOnlyList<ExternalDocument>> GetTenantDocumentsAsync(string tenantId, string? provider = null, int limit = 100, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        if (string.IsNullOrEmpty(provider))
        {
            cmd.CommandText = "SELECT * FROM connector_documents WHERE tenant_id = @tenant_id ORDER BY last_modified_utc DESC LIMIT @limit";
        }
        else
        {
            cmd.CommandText = "SELECT * FROM connector_documents WHERE tenant_id = @tenant_id AND provider = @provider ORDER BY last_modified_utc DESC LIMIT @limit";
            cmd.Parameters.AddWithValue("@provider", provider);
        }
        cmd.Parameters.AddWithValue("@tenant_id", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<ExternalDocument>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            list.Add(MapDocument(reader));
        }

        return list;
    }

    public async Task<SyncCheckpoint?> GetCheckpointAsync(string tenantId, string provider, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT * FROM connector_checkpoints WHERE tenant_id = @tenant_id AND provider = @provider LIMIT 1";
        cmd.Parameters.AddWithValue("@tenant_id", tenantId);
        cmd.Parameters.AddWithValue("@provider", provider);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (await reader.ReadAsync(ct))
        {
            return new SyncCheckpoint
            {
                TenantId = reader.GetString(reader.GetOrdinal("tenant_id")),
                Provider = reader.GetString(reader.GetOrdinal("provider")),
                DeltaToken = reader.IsDBNull(reader.GetOrdinal("delta_token")) ? null : reader.GetString(reader.GetOrdinal("delta_token")),
                NextLink = reader.IsDBNull(reader.GetOrdinal("next_link")) ? null : reader.GetString(reader.GetOrdinal("next_link")),
                CursorTimestampUtc = DateTime.Parse(reader.GetString(reader.GetOrdinal("cursor_timestamp_utc"))),
                LastSyncStatus = reader.GetString(reader.GetOrdinal("last_sync_status")),
                TotalItemsProcessed = reader.GetInt64(reader.GetOrdinal("total_items_processed"))
            };
        }

        return null;
    }

    public async Task SaveCheckpointAsync(SyncCheckpoint checkpoint, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO connector_checkpoints (
                tenant_id, provider, delta_token, next_link, cursor_timestamp_utc,
                last_sync_status, total_items_processed
            ) VALUES (
                @tenant_id, @provider, @delta_token, @next_link, @cursor_timestamp_utc,
                @last_sync_status, @total_items_processed
            )
            ON CONFLICT(tenant_id, provider) DO UPDATE SET
                delta_token = excluded.delta_token,
                next_link = excluded.next_link,
                cursor_timestamp_utc = excluded.cursor_timestamp_utc,
                last_sync_status = excluded.last_sync_status,
                total_items_processed = excluded.total_items_processed;
        ";

        cmd.Parameters.AddWithValue("@tenant_id", checkpoint.TenantId);
        cmd.Parameters.AddWithValue("@provider", checkpoint.Provider);
        cmd.Parameters.AddWithValue("@delta_token", (object?)checkpoint.DeltaToken ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@next_link", (object?)checkpoint.NextLink ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cursor_timestamp_utc", checkpoint.CursorTimestampUtc.ToString("o"));
        cmd.Parameters.AddWithValue("@last_sync_status", checkpoint.LastSyncStatus);
        cmd.Parameters.AddWithValue("@total_items_processed", checkpoint.TotalItemsProcessed);

        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static ExternalDocument MapDocument(SqliteDataReader reader)
    {
        var permsJson = reader.GetString(reader.GetOrdinal("permissions_json"));
        var permissions = string.IsNullOrEmpty(permsJson)
            ? new List<DocumentPermission>()
            : JsonSerializer.Deserialize<List<DocumentPermission>>(permsJson) ?? new List<DocumentPermission>();

        return new ExternalDocument
        {
            Id = reader.GetString(reader.GetOrdinal("id")),
            TenantId = reader.GetString(reader.GetOrdinal("tenant_id")),
            Provider = reader.GetString(reader.GetOrdinal("provider")),
            RemoteId = reader.GetString(reader.GetOrdinal("remote_id")),
            Name = reader.GetString(reader.GetOrdinal("name")),
            MimeType = reader.GetString(reader.GetOrdinal("mime_type")),
            WebUrl = reader.GetString(reader.GetOrdinal("web_url")),
            ParentPath = reader.GetString(reader.GetOrdinal("parent_path")),
            SizeBytes = reader.GetInt64(reader.GetOrdinal("size_bytes")),
            VersionHash = reader.GetString(reader.GetOrdinal("version_hash")),
            IsDeleted = reader.GetInt32(reader.GetOrdinal("is_deleted")) == 1,
            LastModifiedUtc = DateTime.Parse(reader.GetString(reader.GetOrdinal("last_modified_utc"))),
            SyncedAtUtc = DateTime.Parse(reader.GetString(reader.GetOrdinal("synced_at_utc"))),
            Permissions = permissions
        };
    }
}
