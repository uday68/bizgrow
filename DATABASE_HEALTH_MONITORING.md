# Database Health Monitoring System

## Overview

The Database Health Monitoring System provides comprehensive monitoring, automatic recovery, data integrity checking, and maintenance automation for both PostgreSQL and SQLite databases. This system ensures database reliability and performance in production environments.

## Features

### 1. Connection Health Checks
- **Automatic health checks** every 10 seconds
- **Connection failure detection** with configurable thresholds
- **Automatic recovery** attempts when failures are detected
- **Connection pool monitoring** (PostgreSQL only)
- **Real-time health status** tracking

### 2. Data Integrity Monitoring
- **Corruption detection** for both PostgreSQL and SQLite
- **Automatic integrity checks** every hour
- **Table bloat detection** (PostgreSQL)
- **Index health monitoring** (PostgreSQL)
- **SQLite PRAGMA integrity_check** support

### 3. Automatic Recovery
- **Connection recovery** with automatic reconnection
- **Pool reconnection** for PostgreSQL
- **Configurable failure thresholds** before recovery attempts
- **Recovery status tracking** and logging

### 4. Database Maintenance
- **Automated VACUUM ANALYZE** for bloated tables (PostgreSQL)
- **Index reindexing** for low-usage indexes (PostgreSQL)
- **SQLite VACUUM and ANALYZE** support
- **Maintenance scheduling** and execution tracking

### 5. Performance Monitoring
- **Query performance tracking** with slow query detection
- **Error rate monitoring** with alerting
- **Connection pool utilization** tracking (PostgreSQL)
- **Cache hit ratio** monitoring (PostgreSQL)
- **Optimization recommendations** based on metrics

## Architecture

### Components

1. **DatabaseMonitor Service** (`server/services/databaseMonitor.js`)
   - Core monitoring logic
   - Health check execution
   - Integrity checking
   - Maintenance automation
   - Metrics collection

2. **Database Health Routes** (`server/routes/databaseHealth.js`)
   - REST API endpoints for health monitoring
   - Authentication and authorization
   - Comprehensive logging

3. **PostgreSQL Database** (`server/database/postgres.js`)
   - Connection pool management
   - Reconnection support
   - Health check integration

## API Endpoints

All endpoints require authentication. Developer role required for read operations, admin role for write operations.

### Health Status

#### GET `/api/database-health/status`
Get current health status without performing a new check.

**Response:**
```json
{
  "success": true,
  "health": {
    "isHealthy": true,
    "lastCheck": "2026-01-25T10:30:00.000Z",
    "consecutiveFailures": 0,
    "issues": []
  },
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

#### POST `/api/database-health/check`
Perform a new health check immediately.

**Response:**
```json
{
  "success": true,
  "health": {
    "isHealthy": true,
    "lastCheck": "2026-01-25T10:30:15.000Z",
    "consecutiveFailures": 0,
    "issues": [
      {
        "type": "pool_exhaustion",
        "severity": "warning",
        "message": "Connection pool near exhaustion (92.5% utilized)",
        "utilization": 0.925
      }
    ]
  },
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

### Data Integrity

#### GET `/api/database-health/integrity`
Get cached integrity status.

**Response:**
```json
{
  "success": true,
  "integrity": {
    "lastCheck": "2026-01-25T09:00:00.000Z",
    "issues": [],
    "isHealthy": true
  },
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

#### POST `/api/database-health/integrity/check`
Perform a new integrity check immediately.

**Response:**
```json
{
  "success": true,
  "integrity": {
    "lastCheck": "2026-01-25T10:30:15.000Z",
    "issues": [
      {
        "type": "table_bloat",
        "severity": "warning",
        "message": "Table users has 25.50% bloat",
        "table": "users",
        "deadTuples": 5000,
        "liveTuples": 20000,
        "bloatPercentage": "25.50",
        "recommendation": "Run VACUUM ANALYZE on this table"
      }
    ],
    "isHealthy": true
  },
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

### Recovery

#### POST `/api/database-health/recover`
Attempt automatic connection recovery (admin only).

**Response:**
```json
{
  "success": true,
  "message": "Connection recovered successfully",
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

### Maintenance

#### POST `/api/database-health/maintenance`
Perform database maintenance operations (admin only).

**Response:**
```json
{
  "success": true,
  "maintenance": {
    "timestamp": "2026-01-25T10:30:15.000Z",
    "database_type": "postgresql",
    "results": [
      {
        "table": "users",
        "action": "VACUUM ANALYZE",
        "status": "success"
      },
      {
        "index": "idx_users_email",
        "action": "REINDEX",
        "status": "success"
      }
    ],
    "success": true
  },
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

### Comprehensive Report

#### GET `/api/database-health/report`
Get comprehensive health and performance report.

**Response:**
```json
{
  "success": true,
  "report": {
    "generated_at": "2026-01-25T10:30:15.000Z",
    "database_type": "postgresql",
    "monitoring_status": "active",
    "health_status": {
      "isHealthy": true,
      "lastCheck": "2026-01-25T10:30:00.000Z",
      "consecutiveFailures": 0,
      "issues": []
    },
    "summary": {
      "total_queries_tracked": 1250,
      "avg_query_time": "45.23",
      "error_rate": "0.0012",
      "slow_queries_count": 15,
      "active_alerts_count": 1
    },
    "alerts": [
      {
        "type": "slow_queries",
        "severity": "warning",
        "message": "Average query time (105ms) exceeds threshold (100ms)",
        "value": 105,
        "threshold": 100
      }
    ],
    "recommendations": [
      {
        "type": "slow_queries",
        "priority": "high",
        "title": "Optimize Slow Queries",
        "description": "Found 15 slow queries. Consider adding indexes or optimizing query structure.",
        "queries": ["SELECT * FROM users WHERE..."]
      }
    ],
    "integrity": {
      "lastCheck": "2026-01-25T09:00:00.000Z",
      "issues": [],
      "isHealthy": true
    }
  },
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

### Monitoring Control

#### POST `/api/database-health/monitoring/start`
Start database monitoring (admin only).

**Response:**
```json
{
  "success": true,
  "message": "Database monitoring started",
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

#### POST `/api/database-health/monitoring/stop`
Stop database monitoring (admin only).

**Response:**
```json
{
  "success": true,
  "message": "Database monitoring stopped",
  "timestamp": "2026-01-25T10:30:15.000Z"
}
```

## Configuration

### Environment Variables

```bash
# Database Health Monitoring
DB_MONITORING=true                    # Enable monitoring on startup
DB_HEALTH_CHECK_INTERVAL=30000        # Health check interval (ms)
DB_CORRUPTION_CHECK_INTERVAL=3600000  # Integrity check interval (ms)

# Alert Thresholds
DB_SLOW_QUERY_MS=100                  # Slow query threshold (ms)
DB_ERROR_RATE_THRESHOLD=0.05          # Error rate threshold (5%)
DB_POOL_UTILIZATION_THRESHOLD=0.8     # Pool utilization threshold (80%)
DB_CONNECTION_FAILURE_THRESHOLD=3     # Max consecutive failures
```

### Alert Thresholds

Configure thresholds in `server/services/databaseMonitor.js`:

```javascript
this.alertThresholds = {
  slowQueryMs: 100,                    // Slow query threshold
  errorRate: 0.05,                     // 5% error rate
  connectionPoolUtilization: 0.8,      // 80% pool utilization
  connectionFailureThreshold: 3,       // Max consecutive failures
  corruptionCheckInterval: 3600000     // 1 hour
};
```

## Health Check Types

### 1. Connection Health
- Tests basic database connectivity
- Monitors connection pool status (PostgreSQL)
- Tracks consecutive failures
- Triggers automatic recovery when threshold exceeded

### 2. Performance Health
- Monitors average query time
- Tracks error rates
- Detects slow queries
- Monitors connection pool utilization

### 3. Data Integrity
- PostgreSQL: Checks for table corruption, index health, and bloat
- SQLite: Runs PRAGMA integrity_check
- Detects data corruption issues
- Provides maintenance recommendations

## Automatic Recovery

### Recovery Process

1. **Detection**: Health check detects connection failure
2. **Threshold Check**: Verifies consecutive failures exceed threshold
3. **Recovery Attempt**: 
   - PostgreSQL: Closes and reinitializes connection pool
   - SQLite: Verifies connection with test query
4. **Verification**: Tests connection after recovery
5. **Status Update**: Updates health status and resets failure counter

### Recovery Triggers

- **Connection failures**: 3 consecutive failures (configurable)
- **Pool disconnection**: Immediate recovery attempt
- **High error rates**: Manual recovery via API endpoint

## Maintenance Operations

### PostgreSQL Maintenance

1. **VACUUM ANALYZE**: Removes dead tuples and updates statistics
   - Triggered for tables with >1000 dead tuples
   - Reduces table bloat
   - Improves query performance

2. **REINDEX**: Rebuilds indexes
   - Triggered for indexes with low usage (<10 scans)
   - Improves index efficiency
   - Reduces index bloat

### SQLite Maintenance

1. **VACUUM**: Reclaims unused space
   - Reduces database file size
   - Improves performance

2. **ANALYZE**: Updates query optimizer statistics
   - Improves query planning
   - Optimizes query execution

## Monitoring Integration

### Server Startup

Database monitoring starts automatically in production:

```javascript
// In server/index.js
if (process.env.NODE_ENV === 'production' || process.env.DB_MONITORING === 'true') {
  databaseMonitor.startMonitoring();
  logger.info('Database monitoring started', { type: 'startup' });
}
```

### Health Check Endpoint

The main health endpoint includes database health status:

```javascript
// GET /api/health
{
  "monitoring": {
    "database": true,  // Monitoring active
    "alerts": 1        // Active alerts count
  }
}
```

## Best Practices

### 1. Production Deployment
- Enable monitoring on startup with `DB_MONITORING=true`
- Configure appropriate alert thresholds for your workload
- Set up alerting for critical health issues
- Schedule regular maintenance during low-traffic periods

### 2. Performance Optimization
- Monitor slow queries and add indexes as needed
- Keep table bloat under 20% with regular VACUUM
- Maintain connection pool utilization below 80%
- Review optimization recommendations regularly

### 3. Data Integrity
- Run integrity checks at least daily
- Investigate any corruption issues immediately
- Maintain regular backups for recovery
- Test backup restoration procedures

### 4. Monitoring and Alerting
- Check health status dashboard regularly
- Set up automated alerts for critical issues
- Review performance reports weekly
- Track trends over time for capacity planning

## Troubleshooting

### Connection Failures

**Symptom**: Health checks report connection failures

**Solutions**:
1. Check database server status
2. Verify network connectivity
3. Review connection pool configuration
4. Attempt manual recovery via API
5. Check database logs for errors

### High Error Rates

**Symptom**: Query error rate exceeds threshold

**Solutions**:
1. Review error logs for patterns
2. Check for schema issues
3. Verify data integrity
4. Review recent code changes
5. Check database resource utilization

### Table Bloat

**Symptom**: Integrity check reports high bloat percentage

**Solutions**:
1. Run VACUUM ANALYZE on affected tables
2. Schedule regular maintenance
3. Review delete/update patterns
4. Consider autovacuum tuning (PostgreSQL)

### Pool Exhaustion

**Symptom**: Connection pool utilization >90%

**Solutions**:
1. Increase pool size (`DB_POOL_MAX`)
2. Review long-running queries
3. Check for connection leaks
4. Optimize query performance
5. Consider horizontal scaling

## Integration with Other Systems

### APM Integration
Health metrics are available through the APM dashboard for comprehensive monitoring.

### Backup Integration
Health checks verify database integrity before backups to ensure backup quality.

### Error Tracking
Database errors are automatically tracked and correlated with health status.

### Logging
All health checks, recovery attempts, and maintenance operations are logged with correlation IDs.

## Future Enhancements

- [ ] Predictive failure detection using ML
- [ ] Automated query optimization suggestions
- [ ] Integration with external monitoring tools (Datadog, New Relic)
- [ ] Custom health check plugins
- [ ] Advanced anomaly detection
- [ ] Automated capacity planning recommendations

## Support

For issues or questions about database health monitoring:
1. Check the comprehensive health report: `GET /api/database-health/report`
2. Review server logs for detailed error messages
3. Consult the troubleshooting section above
4. Contact the development team with correlation IDs from logs

---

**Last Updated**: January 25, 2026
**Version**: 1.0.0
**Status**: Production Ready
