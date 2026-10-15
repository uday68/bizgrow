using BizGrow.Connectors.Domain.Interfaces;
using BizGrow.Connectors.Engine;
using BizGrow.Connectors.Middleware;
using BizGrow.Connectors.Providers.MicrosoftGraph;
using BizGrow.Connectors.Providers.Mock;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers();
builder.Services.AddHttpClient();

// Register repositories & queue with SQLite persistence
builder.Services.AddSingleton<IDocumentRepository, SqliteDocumentRepository>();
builder.Services.AddSingleton<ISyncJobQueue, SqliteSyncJobQueue>();

// Register Connector Providers
builder.Services.AddSingleton<IConnectorProvider, MockConnectorProvider>();
builder.Services.AddSingleton<IConnectorProvider, MicrosoftGraphConnectorProvider>();

// Register Durable Background Worker
builder.Services.AddHostedService<SyncWorkerService>();

var app = builder.Build();

// Middleware pipeline
app.UseMiddleware<ApiKeyAuthMiddleware>();

app.MapControllers();

app.Run();
