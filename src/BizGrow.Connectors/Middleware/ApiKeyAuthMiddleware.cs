using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace BizGrow.Connectors.Middleware;

public class ApiKeyAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _expectedApiKey;
    private const string ApiKeyHeaderName = "X-Connector-Key";

    public ApiKeyAuthMiddleware(RequestDelegate next, IConfiguration configuration)
    {
        _next = next;
        _expectedApiKey = configuration["ConnectorService:ApiKey"] ?? "bizgrow-connector-secret-key-2026";
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Allow health check and root without authentication for cluster probes
        if (context.Request.Path.StartsWithSegments("/health") || context.Request.Path == "/")
        {
            await _next(context);
            return;
        }

        if (!context.Request.Headers.TryGetValue(ApiKeyHeaderName, out var extractedApiKey) ||
            !string.Equals(extractedApiKey, _expectedApiKey))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"error\":\"Unauthorized\",\"message\":\"Invalid or missing X-Connector-Key header\"}");
            return;
        }

        await _next(context);
    }
}
