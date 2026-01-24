# Application Performance Monitoring (APM) System

## Overview

The BizGrow AI APM system provides comprehensive real-time monitoring of application performance, system resources, and business metrics. It integrates seamlessly with the chat system and other components to provide a complete observability solution.

## Features

### Core Monitoring Capabilities

- **Response Time Tracking**: Monitors request/response times with percentile calculations (P50, P95, P99)
- **Throughput Monitoring**: Tracks requests per second/minute and total request volume
- **Error Rate Analysis**: Monitors error rates by type with detailed error tracking
- **System Resource Monitoring**: CPU, memory, disk, and network usage tracking
- **Business Metrics**: Chat sessions, user engagement, conversion rates
- **Real-time Alerting**: Configurable thresholds with multi-channel notifications

### Chat System Integration

- **Session Performance**: Track chat session creation, duration, and closure
- **Message Metrics**: Monitor message volume, response times, and delivery
- **Agent Utilization**: Track support agent availability and workload
- **Customer Experience**: Monitor wait times, resolution rates, satisfaction

### Real-time Dashboard

- **Live Metrics**: Real-time updates via WebSocket connections
- **Historical Data**: Time-series data with configurable time ranges
- **Alert Management**: View, acknowledge, and manage performance alerts
- **Performance Insights**: Automated recommendations and optimization suggestions

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   HTTP Requests │    │  WebSocket      │    │  Chat System    │
│                 │    │  Connections    │    │                 │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APM Middleware                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐│
│  │  Request    │ │ Performance │ │    Business Metrics         ││
│  │  Tracking   │ │ Monitoring  │ │    Tracking                 ││
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘│
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APM Service                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐│
│  │  Metrics    │ │   Alert     │ │    Data Storage             ││
│  │ Collection  │ │ Management  │ │    & History                ││
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘│
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                WebSocket Integration                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐│
│  │ Real-time   │ │   Client    │ │    Event Broadcasting       ││
│  │ Updates     │ │ Management  │ │                             ││
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘│
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Dashboard                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐│
│  │   Metrics   │ │   Charts    │ │       Alerts                ││
│  │   Display   │ │ & Graphs    │ │    Management               ││
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Installation & Setup

### 1. Import APM Components

```javascript
// In your server/index.js
import apmService from './services/apmService.js';
import apmWebSocketIntegration from './services/apmWebSocketIntegration.js';
import chatAPMIntegration from './services/chatAPMIntegration.js';
import { apmMiddleware } from './middleware/apmMiddleware.js';
import apmRoutes from './routes/apm.js';
```

### 2. Apply APM Middleware

```javascript
// Apply APM middleware early in the middleware stack
app.use(apmMiddleware());

// Add APM routes
app.use('/api/apm', authenticateToken, apmRoutes);
```

### 3. Frontend Integration

```typescript
import { APMDashboard } from './components/APMDashboard';

// Use in your React application
<APMDashboard 
  refreshInterval={5000}
  showAlerts={true}
  showCharts={true}
/>
```

## API Endpoints

### Metrics Endpoints

#### GET /api/apm/metrics
Get current APM metrics

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "responseTime": {
      "current": 245,
      "average": 189,
      "p50": 156,
      "p95": 423,
      "p99": 678
    },
    "throughput": {
      "requestsPerSecond": 12,
      "requestsPerMinute": 720,
      "totalRequests": 15420
    },
    "errorRate": {
      "current": 0.023,
      "total": 15420,
      "errors": 354,
      "errorsByType": {
        "HTTP_404": 123,
        "HTTP_500": 45,
        "ValidationError": 186
      }
    },
    "systemResources": {
      "cpu": {
        "usage": 34.5,
        "loadAverage": [1.2, 1.1, 0.9],
        "cores": 4
      },
      "memory": {
        "used": 2147483648,
        "free": 1073741824,
        "total": 3221225472,
        "usage": 66.7,
        "heapUsed": 134217728,
        "heapTotal": 268435456
      }
    },
    "business": {
      "activeUsers": 45,
      "chatSessions": 12,
      "agentUtilization": 78.5,
      "conversionRate": 3.2
    }
  }
}
```

#### GET /api/apm/metrics/history
Get historical metrics data

**Query Parameters:**
- `timeRange`: Time range for data (5m, 15m, 1h, 6h, 24h)

#### GET /api/apm/dashboard
Get comprehensive dashboard data

**Query Parameters:**
- `timeRange`: Time range for historical data

### Alert Endpoints

#### GET /api/apm/alerts
Get active alerts

#### POST /api/apm/alerts/:alertId/acknowledge
Acknowledge an alert

#### GET /api/apm/alerts/history
Get alert history

### Report Endpoints

#### POST /api/apm/reports/performance
Generate performance report

**Request Body:**
```json
{
  "timeRange": "24h"
}
```

## Configuration

### APM Service Configuration

```javascript
// Configure thresholds
apmService.thresholds = {
  responseTime: {
    warning: 1000,  // 1 second
    critical: 3000  // 3 seconds
  },
  errorRate: {
    warning: 0.05,  // 5%
    critical: 0.10  // 10%
  },
  cpu: {
    warning: 70,    // 70%
    critical: 90    // 90%
  },
  memory: {
    warning: 80,    // 80%
    critical: 95    // 95%
  }
};
```

### WebSocket Configuration

```javascript
// Configure real-time updates
apmWebSocketIntegration.setupAPMEventListeners();
```

## Usage Examples

### Basic Monitoring

```javascript
// The APM middleware automatically tracks all HTTP requests
app.use(apmMiddleware());

// Manual business metric tracking
app.post('/api/orders', (req, res) => {
  // Process order...
  
  // Track business metric
  req.trackBusinessMetric('order_created', {
    orderId: order.id,
    value: order.total,
    customerId: order.customerId
  });
  
  res.json({ success: true, order });
});
```

### Chat System Integration

```javascript
// Chat metrics are automatically tracked when using chat routes
app.use('/api/chat', chatRoutes);

// Manual chat metric tracking
app.post('/api/chat/sessions', (req, res) => {
  const session = chatService.createSession(customerId, customerInfo);
  
  // This is automatically tracked by chatAPMIntegration
  req.trackChatMetric('session_created', {
    sessionId: session.id,
    customerId
  });
  
  res.json({ success: true, data: session });
});
```

### Real-time Dashboard

```typescript
// React component with real-time updates
const MyDashboard = () => {
  const [metrics, setMetrics] = useState(null);
  
  useEffect(() => {
    // Connect to WebSocket for real-time updates
    websocketService.connect();
    
    websocketService.on('apmMetricsUpdate', (data) => {
      setMetrics(data);
    });
    
    return () => websocketService.disconnect();
  }, []);
  
  return <APMDashboard metrics={metrics} />;
};
```

### Custom Alerts

```javascript
// Create custom alert conditions
apmService.on('metricsUpdated', (metrics) => {
  // Custom business logic alert
  if (metrics.business.chatSessions > 50 && metrics.business.agentUtilization > 95) {
    apmService.createAlert('chat_overload', 'critical', 
      'Chat system overloaded: too many sessions with insufficient agents');
  }
});
```

## Performance Considerations

### Monitoring Overhead

The APM system is designed to have minimal performance impact:

- **Request Tracking**: < 1ms overhead per request
- **Metrics Collection**: Runs every 5 seconds in background
- **Memory Usage**: Bounded history with automatic cleanup
- **WebSocket Updates**: Throttled to prevent flooding

### Scalability

- **Horizontal Scaling**: APM data can be aggregated across multiple instances
- **Data Retention**: Configurable history limits to manage memory usage
- **Alert Throttling**: Prevents alert spam with cooldown periods

### Production Optimizations

```javascript
// Production configuration
if (process.env.NODE_ENV === 'production') {
  // Reduce sampling for high-traffic applications
  apmService.samplingRate = 0.1; // Sample 10% of requests
  
  // Increase cleanup frequency
  apmService.cleanupInterval = 60000; // 1 minute
  
  // Reduce history size
  apmService.maxHistorySize = 500;
}
```

## Troubleshooting

### Common Issues

#### High Memory Usage
```javascript
// Reduce history size
apmService.maxHistorySize = 100;

// Increase cleanup frequency
apmService.cleanupInterval = 30000; // 30 seconds
```

#### Missing Metrics
```javascript
// Ensure APM middleware is applied before routes
app.use(apmMiddleware());
app.use('/api', routes);
```

#### WebSocket Connection Issues
```javascript
// Check WebSocket server setup
websocketServer.setup(httpServer);

// Verify authentication
websocketService.connect(token);
```

### Debug Mode

```javascript
// Enable debug logging
process.env.LOG_LEVEL = 'debug';

// Check APM service status
console.log('APM Status:', apmService.getCurrentMetrics());
```

## Best Practices

### 1. Metric Naming
- Use consistent naming conventions
- Include context in metric names
- Avoid high-cardinality dimensions

### 2. Alert Configuration
- Set appropriate thresholds based on your SLA
- Use different severity levels
- Implement alert escalation

### 3. Dashboard Design
- Focus on key metrics
- Use appropriate time ranges
- Include business context

### 4. Performance Optimization
- Monitor the monitor (APM overhead)
- Use sampling for high-traffic endpoints
- Regular cleanup of old data

## Integration with Other Systems

### Logging Integration
```javascript
// APM automatically integrates with the logging system
logger.performance('Slow request detected', {
  path: req.path,
  responseTime: 2500,
  threshold: 1000
});
```

### Cache Integration
```javascript
// Track cache performance
req.cacheLogger.hit('user_profile', 300);
req.cacheLogger.miss('user_profile');
```

### Database Integration
```javascript
// Database performance is automatically tracked
// via databaseMonitor integration
```

## Demo

Run the interactive demo to see the APM system in action:

```bash
node examples/apm-chat-integration-demo.js
```

Visit `http://localhost:3002` to see:
- Real-time metrics updates
- Chat system monitoring
- Performance tracking
- Alert management

## Contributing

When adding new metrics or features:

1. Update the APM service with new metric types
2. Add corresponding middleware if needed
3. Update the dashboard components
4. Add tests for new functionality
5. Update this documentation

## License

This APM system is part of the BizGrow AI project and follows the same license terms.