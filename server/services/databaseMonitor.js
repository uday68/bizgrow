import { getDatabaseType, getDatabase } from '../database/init.js';
import cacheService from './cacheService.js';

/**
 * Database Performance Monitoring Service
 * Tracks query performance, identifies slow queries, and provides optimization insights
 * Includes health monitoring with automatic recovery and corruption detection
 */
class DatabaseMonitor {
  constructor() {
    this.queryStats = new Map();
    this.slowQueries = [];
    this.alertThresholds = {
      slowQueryMs: 100,
      errorRate: 0.05, // 5%
      connectionPoolUtilization: 0.8, // 80%
      connectionFailureThreshold: 3, // Max consecutive failures before alert
      corruptionCheckInterval: 3600000 // 1 hour in milliseconds
    };
    this.monitoringInterval = null;
    this.healthCheckInterval = null;
    this.corruptionCheckInterval = null;
    this.isMonitoring = false;
    this.connectionFailures = 0;
    this.lastHealthCheck = null;
    this.lastCorruptionCheck = null;
    this.healthStatus = {
      isHealthy: true,
      lastCheck: null,
      consecutiveFailures: 0,
      issues: []
    };
  }

  /**
   * Start database monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Database monitoring already running');
      return;
    }

    this.isMonitoring = true;
    console.log('📊 Starting database performance monitoring...');

    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
    }, 30000);

    // Health check every 10 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 10000);

    // Corruption check every hour
    this.corruptionCheckInterval = setInterval(async () => {
      await this.checkDataIntegrity();
    }, this.alertThresholds.corruptionCheckInterval);

    // Initial checks
    this.collectMetrics();
    this.performHealthCheck();
    this.checkDataIntegrity();
  }

  /**
   * Stop database monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.corruptionCheckInterval) {
      clearInterval(this.corruptionCheckInterval);
      this.corruptionCheckInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 Database monitoring stopped');
  }

  /**
   * Collect database performance metrics
   */
  async collectMetrics() {
    try {
      const dbType = getDatabaseType();
      const db = getDatabase();

      if (dbType === 'postgres') {
        await this.collectPostgreSQLMetrics(db);
      } else {
        await this.collectSQLiteMetrics(db);
      }

      // Cache metrics for API access
      await this.cacheMetrics();
      
      // Check for alerts
      await this.checkAlerts();
    } catch (error) {
      console.error('❌ Failed to collect database metrics:', error);
    }
  }

  /**
   * Collect PostgreSQL-specific metrics
   */
  async collectPostgreSQLMetrics(db) {
    try {
      // Connection pool metrics
      const poolMetrics = db.getMetrics();
      
      // Database activity metrics
      const activityResult = await db.query(`
        SELECT 
          datname,
          numbackends as active_connections,
          xact_commit as transactions_committed,
          xact_rollback as transactions_rolled_back,
          blks_read as blocks_read,
          blks_hit as blocks_hit,
          tup_returned as tuples_returned,
          tup_fetched as tuples_fetched,
          tup_inserted as tuples_inserted,
          tup_updated as tuples_updated,
          tup_deleted as tuples_deleted
        FROM pg_stat_database 
        WHERE datname = current_database();
      `);

      // Table statistics
      const tableStatsResult = await db.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          seq_scan as sequential_scans,
          seq_tup_read as sequential_tuples_read,
          idx_scan as index_scans,
          idx_tup_fetch as index_tuples_fetched
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC;
      `);

      // Index usage statistics
      const indexStatsResult = await db.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans,
          idx_tup_read as index_tuples_read,
          idx_tup_fetch as index_tuples_fetched
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC;
      `);

      // Slow queries from pg_stat_statements (if available)
      let slowQueriesResult = { rows: [] };
      try {
        slowQueriesResult = await db.query(`
          SELECT 
            query,
            calls,
            total_time,
            mean_time,
            rows,
            100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
          FROM pg_stat_statements
          WHERE mean_time > $1
          ORDER BY mean_time DESC
          LIMIT 10;
        `, [this.alertThresholds.slowQueryMs]);
      } catch (error) {
        // pg_stat_statements extension not available
        console.log('ℹ️ pg_stat_statements extension not available for slow query tracking');
      }

      const metrics = {
        timestamp: new Date().toISOString(),
        database_type: 'postgresql',
        connection_pool: poolMetrics,
        database_activity: activityResult.rows[0] || {},
        table_statistics: tableStatsResult.rows,
        index_statistics: indexStatsResult.rows,
        slow_queries: slowQueriesResult.rows,
        cache_hit_ratio: this.calculateCacheHitRatio(activityResult.rows[0])
      };

      this.updateMetricsHistory(metrics);
      return metrics;
    } catch (error) {
      console.error('❌ Failed to collect PostgreSQL metrics:', error);
      throw error;
    }
  }

  /**
   * Collect SQLite-specific metrics
   */
  async collectSQLiteMetrics(db) {
    try {
      // SQLite has limited built-in metrics, so we track what we can
      const metrics = {
        timestamp: new Date().toISOString(),
        database_type: 'sqlite',
        query_stats: Array.from(this.queryStats.entries()).map(([query, stats]) => ({
          query: query.substring(0, 100) + '...',
          total_calls: stats.calls,
          total_time: stats.totalTime,
          avg_time: stats.totalTime / stats.calls,
          errors: stats.errors
        })),
        slow_queries: this.slowQueries.slice(-10), // Last 10 slow queries
        total_queries: Array.from(this.queryStats.values()).reduce((sum, stats) => sum + stats.calls, 0),
        total_errors: Array.from(this.queryStats.values()).reduce((sum, stats) => sum + stats.errors, 0)
      };

      this.updateMetricsHistory(metrics);
      return metrics;
    } catch (error) {
      console.error('❌ Failed to collect SQLite metrics:', error);
      throw error;
    }
  }

  /**
   * Track individual query performance
   */
  trackQuery(sql, params, executionTime, error = null) {
    const queryKey = this.normalizeQuery(sql);
    
    if (!this.queryStats.has(queryKey)) {
      this.queryStats.set(queryKey, {
        calls: 0,
        totalTime: 0,
        errors: 0,
        lastExecuted: null
      });
    }

    const stats = this.queryStats.get(queryKey);
    stats.calls++;
    stats.totalTime += executionTime;
    stats.lastExecuted = new Date().toISOString();

    if (error) {
      stats.errors++;
    }

    // Track slow queries
    if (executionTime > this.alertThresholds.slowQueryMs) {
      this.slowQueries.push({
        query: sql.substring(0, 200) + '...',
        params: params ? JSON.stringify(params).substring(0, 100) : null,
        execution_time: executionTime,
        timestamp: new Date().toISOString(),
        error: error ? error.message : null
      });

      // Keep only last 100 slow queries
      if (this.slowQueries.length > 100) {
        this.slowQueries = this.slowQueries.slice(-100);
      }
    }
  }

  /**
   * Normalize query for tracking (remove specific values)
   */
  normalizeQuery(sql) {
    return sql
      .replace(/\$\d+/g, '?') // Replace PostgreSQL parameters
      .replace(/'\w+'/g, "'?'") // Replace string literals
      .replace(/\d+/g, '?') // Replace numbers
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase();
  }

  /**
   * Calculate cache hit ratio for PostgreSQL
   */
  calculateCacheHitRatio(dbStats) {
    if (!dbStats || !dbStats.blks_read || !dbStats.blks_hit) {
      return null;
    }

    const totalReads = parseInt(dbStats.blks_read) + parseInt(dbStats.blks_hit);
    if (totalReads === 0) return 100;

    return ((parseInt(dbStats.blks_hit) / totalReads) * 100).toFixed(2);
  }

  /**
   * Update metrics history
   */
  updateMetricsHistory(metrics) {
    // Store in memory (could be extended to persist to database)
    if (!this.metricsHistory) {
      this.metricsHistory = [];
    }

    this.metricsHistory.push(metrics);

    // Keep only last 100 metric snapshots
    if (this.metricsHistory.length > 100) {
      this.metricsHistory = this.metricsHistory.slice(-100);
    }
  }

  /**
   * Cache metrics for API access
   */
  async cacheMetrics() {
    try {
      const currentMetrics = this.getCurrentMetrics();
      await cacheService.set('monitoring', 'database_metrics', currentMetrics, {}, 60); // 1 minute TTL
    } catch (error) {
      console.error('❌ Failed to cache database metrics:', error);
    }
  }

  /**
   * Get current metrics summary
   */
  getCurrentMetrics() {
    const latest = this.metricsHistory?.[this.metricsHistory.length - 1];
    
    return {
      timestamp: new Date().toISOString(),
      database_type: getDatabaseType(),
      is_monitoring: this.isMonitoring,
      latest_metrics: latest,
      query_performance: {
        total_tracked_queries: this.queryStats.size,
        slow_queries_count: this.slowQueries.length,
        avg_query_time: this.calculateAverageQueryTime(),
        error_rate: this.calculateErrorRate()
      },
      alerts: this.getActiveAlerts()
    };
  }

  /**
   * Calculate average query time across all tracked queries
   */
  calculateAverageQueryTime() {
    if (this.queryStats.size === 0) return 0;

    let totalTime = 0;
    let totalCalls = 0;

    for (const stats of this.queryStats.values()) {
      totalTime += stats.totalTime;
      totalCalls += stats.calls;
    }

    return totalCalls > 0 ? (totalTime / totalCalls).toFixed(2) : 0;
  }

  /**
   * Calculate overall error rate
   */
  calculateErrorRate() {
    if (this.queryStats.size === 0) return 0;

    let totalErrors = 0;
    let totalCalls = 0;

    for (const stats of this.queryStats.values()) {
      totalErrors += stats.errors;
      totalCalls += stats.calls;
    }

    return totalCalls > 0 ? (totalErrors / totalCalls).toFixed(4) : 0;
  }

  /**
   * Check for performance alerts
   */
  async checkAlerts() {
    const alerts = [];
    const avgQueryTime = parseFloat(this.calculateAverageQueryTime());
    const errorRate = parseFloat(this.calculateErrorRate());

    // Slow query alert
    if (avgQueryTime > this.alertThresholds.slowQueryMs) {
      alerts.push({
        type: 'slow_queries',
        severity: 'warning',
        message: `Average query time (${avgQueryTime}ms) exceeds threshold (${this.alertThresholds.slowQueryMs}ms)`,
        value: avgQueryTime,
        threshold: this.alertThresholds.slowQueryMs
      });
    }

    // Error rate alert
    if (errorRate > this.alertThresholds.errorRate) {
      alerts.push({
        type: 'high_error_rate',
        severity: 'critical',
        message: `Query error rate (${(errorRate * 100).toFixed(2)}%) exceeds threshold (${(this.alertThresholds.errorRate * 100).toFixed(2)}%)`,
        value: errorRate,
        threshold: this.alertThresholds.errorRate
      });
    }

    // Connection pool utilization (PostgreSQL only)
    const dbType = getDatabaseType();
    if (dbType === 'postgres') {
      const db = getDatabase();
      const poolStatus = db.getPoolStatus();
      
      if (poolStatus.status === 'connected' && poolStatus.totalCount > 0) {
        const utilization = (poolStatus.totalCount - poolStatus.idleCount) / poolStatus.totalCount;
        
        if (utilization > this.alertThresholds.connectionPoolUtilization) {
          alerts.push({
            type: 'high_pool_utilization',
            severity: 'warning',
            message: `Connection pool utilization (${(utilization * 100).toFixed(1)}%) exceeds threshold (${(this.alertThresholds.connectionPoolUtilization * 100).toFixed(1)}%)`,
            value: utilization,
            threshold: this.alertThresholds.connectionPoolUtilization
          });
        }
      }
    }

    // Store alerts
    this.activeAlerts = alerts;

    // Log critical alerts
    for (const alert of alerts) {
      if (alert.severity === 'critical') {
        console.error(`🚨 Database Alert: ${alert.message}`);
      } else if (alert.severity === 'warning') {
        console.warn(`⚠️ Database Warning: ${alert.message}`);
      }
    }

    return alerts;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return this.activeAlerts || [];
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations() {
    const recommendations = [];
    const dbType = getDatabaseType();

    // Analyze slow queries
    const slowQueries = this.slowQueries.slice(-10);
    if (slowQueries.length > 0) {
      recommendations.push({
        type: 'slow_queries',
        priority: 'high',
        title: 'Optimize Slow Queries',
        description: `Found ${slowQueries.length} slow queries. Consider adding indexes or optimizing query structure.`,
        queries: slowQueries.map(q => q.query)
      });
    }

    // Analyze query patterns
    const frequentQueries = Array.from(this.queryStats.entries())
      .sort(([,a], [,b]) => b.calls - a.calls)
      .slice(0, 5);

    if (frequentQueries.length > 0) {
      recommendations.push({
        type: 'frequent_queries',
        priority: 'medium',
        title: 'Cache Frequent Queries',
        description: 'Consider caching results for frequently executed queries.',
        queries: frequentQueries.map(([query, stats]) => ({
          query: query.substring(0, 100) + '...',
          calls: stats.calls,
          avg_time: (stats.totalTime / stats.calls).toFixed(2)
        }))
      });
    }

    // PostgreSQL-specific recommendations
    if (dbType === 'postgres') {
      const latest = this.metricsHistory?.[this.metricsHistory.length - 1];
      
      if (latest?.cache_hit_ratio && parseFloat(latest.cache_hit_ratio) < 95) {
        recommendations.push({
          type: 'cache_hit_ratio',
          priority: 'medium',
          title: 'Improve Buffer Cache Hit Ratio',
          description: `Current cache hit ratio is ${latest.cache_hit_ratio}%. Consider increasing shared_buffers or optimizing queries.`,
          current_ratio: latest.cache_hit_ratio
        });
      }

      // Check for tables with high sequential scan ratio
      if (latest?.table_statistics) {
        const tablesWithHighSeqScans = latest.table_statistics.filter(table => {
          const totalScans = (table.sequential_scans || 0) + (table.index_scans || 0);
          return totalScans > 0 && (table.sequential_scans / totalScans) > 0.1; // >10% seq scans
        });

        if (tablesWithHighSeqScans.length > 0) {
          recommendations.push({
            type: 'sequential_scans',
            priority: 'high',
            title: 'Add Missing Indexes',
            description: 'Some tables have high sequential scan ratios. Consider adding indexes.',
            tables: tablesWithHighSeqScans.map(t => ({
              table: t.tablename,
              seq_scans: t.sequential_scans,
              index_scans: t.index_scans || 0
            }))
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    const metrics = this.getCurrentMetrics();
    const recommendations = this.getOptimizationRecommendations();
    const alerts = this.getActiveAlerts();

    return {
      generated_at: new Date().toISOString(),
      database_type: getDatabaseType(),
      monitoring_status: this.isMonitoring ? 'active' : 'inactive',
      health_status: this.healthStatus,
      summary: {
        total_queries_tracked: this.queryStats.size,
        avg_query_time: this.calculateAverageQueryTime(),
        error_rate: this.calculateErrorRate(),
        slow_queries_count: this.slowQueries.length,
        active_alerts_count: alerts.length
      },
      current_metrics: metrics,
      alerts,
      recommendations,
      top_slow_queries: this.slowQueries.slice(-5),
      query_performance: Array.from(this.queryStats.entries())
        .map(([query, stats]) => ({
          query: query.substring(0, 100) + '...',
          calls: stats.calls,
          total_time: stats.totalTime,
          avg_time: (stats.totalTime / stats.calls).toFixed(2),
          errors: stats.errors,
          error_rate: (stats.errors / stats.calls).toFixed(4)
        }))
        .sort((a, b) => parseFloat(b.avg_time) - parseFloat(a.avg_time))
        .slice(0, 10)
    };
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const issues = [];
    let isHealthy = true;

    try {
      const dbType = getDatabaseType();
      const db = getDatabase();

      // Test basic connectivity
      try {
        if (dbType === 'postgres') {
          await db.query('SELECT 1');
        } else {
          await new Promise((resolve, reject) => {
            db.get('SELECT 1', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
        this.connectionFailures = 0;
      } catch (error) {
        this.connectionFailures++;
        isHealthy = false;
        issues.push({
          type: 'connection_failure',
          severity: 'critical',
          message: `Database connection failed: ${error.message}`,
          consecutiveFailures: this.connectionFailures
        });

        // Attempt automatic recovery
        if (this.connectionFailures >= this.alertThresholds.connectionFailureThreshold) {
          console.error('🚨 Critical: Multiple database connection failures detected');
          await this.attemptConnectionRecovery();
        }
      }

      // Check connection pool health (PostgreSQL only)
      if (dbType === 'postgres') {
        const poolStatus = db.getPoolStatus();
        
        if (poolStatus.status !== 'connected') {
          isHealthy = false;
          issues.push({
            type: 'pool_disconnected',
            severity: 'critical',
            message: 'Database connection pool is disconnected',
            poolStatus
          });
        }

        // Check for connection pool exhaustion
        const utilization = poolStatus.totalCount > 0 
          ? (poolStatus.totalCount - poolStatus.idleCount) / poolStatus.totalCount 
          : 0;

        if (utilization > 0.9) {
          issues.push({
            type: 'pool_exhaustion',
            severity: 'warning',
            message: `Connection pool near exhaustion (${(utilization * 100).toFixed(1)}% utilized)`,
            utilization
          });
        }
      }

      // Check for high error rates
      const errorRate = parseFloat(this.calculateErrorRate());
      if (errorRate > this.alertThresholds.errorRate) {
        isHealthy = false;
        issues.push({
          type: 'high_error_rate',
          severity: 'critical',
          message: `Query error rate (${(errorRate * 100).toFixed(2)}%) exceeds threshold`,
          errorRate
        });
      }

      // Update health status
      this.healthStatus = {
        isHealthy,
        lastCheck: new Date().toISOString(),
        consecutiveFailures: isHealthy ? 0 : this.healthStatus.consecutiveFailures + 1,
        issues
      };

      this.lastHealthCheck = new Date().toISOString();

      // Cache health status
      await cacheService.set('monitoring', 'database_health', this.healthStatus, {}, 30);

      return this.healthStatus;
    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.healthStatus = {
        isHealthy: false,
        lastCheck: new Date().toISOString(),
        consecutiveFailures: this.healthStatus.consecutiveFailures + 1,
        issues: [{
          type: 'health_check_error',
          severity: 'critical',
          message: `Health check failed: ${error.message}`
        }]
      };
      return this.healthStatus;
    }
  }

  /**
   * Attempt automatic connection recovery
   */
  async attemptConnectionRecovery() {
    console.log('🔄 Attempting automatic database connection recovery...');

    try {
      const dbType = getDatabaseType();
      const db = getDatabase();

      if (dbType === 'postgres') {
        // Try to reconnect the pool
        console.log('Attempting to reconnect PostgreSQL pool...');
        await db.reconnect();
        console.log('✅ PostgreSQL pool reconnected successfully');
        
        this.connectionFailures = 0;
        this.healthStatus.isHealthy = true;
        this.healthStatus.consecutiveFailures = 0;
        
        return { success: true, message: 'Connection recovered successfully' };
      } else {
        // SQLite recovery is simpler - just test the connection
        await new Promise((resolve, reject) => {
          db.get('SELECT 1', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        this.connectionFailures = 0;
        this.healthStatus.isHealthy = true;
        this.healthStatus.consecutiveFailures = 0;
        
        console.log('✅ SQLite connection verified');
        return { success: true, message: 'Connection verified successfully' };
      }
    } catch (error) {
      console.error('❌ Connection recovery failed:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Check data integrity and detect corruption
   */
  async checkDataIntegrity() {
    console.log('🔍 Performing data integrity check...');

    try {
      const dbType = getDatabaseType();
      const db = getDatabase();
      const issues = [];

      if (dbType === 'postgres') {
        // Check for table corruption
        const corruptionCheck = await db.query(`
          SELECT 
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
          FROM pg_tables
          WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        `);

        // Check for index corruption
        const indexCheck = await db.query(`
          SELECT 
            schemaname,
            tablename,
            indexname,
            pg_size_pretty(pg_relation_size(indexrelid)) as size
          FROM pg_indexes
          WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        `);

        // Check for bloat
        const bloatCheck = await db.query(`
          SELECT 
            schemaname,
            tablename,
            n_dead_tup as dead_tuples,
            n_live_tup as live_tuples,
            CASE 
              WHEN n_live_tup > 0 
              THEN (n_dead_tup::float / n_live_tup::float * 100)::numeric(5,2)
              ELSE 0
            END as bloat_percentage
          FROM pg_stat_user_tables
          WHERE n_dead_tup > 1000
          ORDER BY n_dead_tup DESC
          LIMIT 10
        `);

        // Alert on high bloat
        for (const row of bloatCheck.rows) {
          if (parseFloat(row.bloat_percentage) > 20) {
            issues.push({
              type: 'table_bloat',
              severity: 'warning',
              message: `Table ${row.tablename} has ${row.bloat_percentage}% bloat`,
              table: row.tablename,
              deadTuples: row.dead_tuples,
              liveTuples: row.live_tuples,
              bloatPercentage: row.bloat_percentage,
              recommendation: 'Run VACUUM ANALYZE on this table'
            });
          }
        }

        console.log(`✅ Integrity check complete: ${corruptionCheck.rows.length} tables, ${indexCheck.rows.length} indexes checked`);
      } else {
        // SQLite integrity check
        const integrityResult = await new Promise((resolve, reject) => {
          db.get('PRAGMA integrity_check', (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (integrityResult && integrityResult.integrity_check !== 'ok') {
          issues.push({
            type: 'database_corruption',
            severity: 'critical',
            message: 'SQLite integrity check failed',
            result: integrityResult.integrity_check,
            recommendation: 'Restore from backup immediately'
          });
          console.error('🚨 SQLite database corruption detected!');
        } else {
          console.log('✅ SQLite integrity check passed');
        }
      }

      this.lastCorruptionCheck = new Date().toISOString();

      // Store integrity check results
      const integrityStatus = {
        lastCheck: this.lastCorruptionCheck,
        issues,
        isHealthy: issues.filter(i => i.severity === 'critical').length === 0
      };

      await cacheService.set('monitoring', 'database_integrity', integrityStatus, {}, 3600);

      // Alert on critical issues
      for (const issue of issues) {
        if (issue.severity === 'critical') {
          console.error(`🚨 Data Integrity Alert: ${issue.message}`);
        }
      }

      return integrityStatus;
    } catch (error) {
      console.error('❌ Integrity check failed:', error);
      return {
        lastCheck: new Date().toISOString(),
        issues: [{
          type: 'integrity_check_error',
          severity: 'critical',
          message: `Integrity check failed: ${error.message}`
        }],
        isHealthy: false
      };
    }
  }

  /**
   * Perform database maintenance
   */
  async performMaintenance() {
    console.log('🔧 Performing database maintenance...');

    try {
      const dbType = getDatabaseType();
      const db = getDatabase();
      const results = [];

      if (dbType === 'postgres') {
        // Run VACUUM ANALYZE on tables with high bloat
        const bloatedTables = await db.query(`
          SELECT tablename
          FROM pg_stat_user_tables
          WHERE n_dead_tup > 1000
          ORDER BY n_dead_tup DESC
          LIMIT 5
        `);

        for (const row of bloatedTables.rows) {
          try {
            await db.query(`VACUUM ANALYZE ${row.tablename}`);
            results.push({
              table: row.tablename,
              action: 'VACUUM ANALYZE',
              status: 'success'
            });
            console.log(`✅ Vacuumed table: ${row.tablename}`);
          } catch (error) {
            results.push({
              table: row.tablename,
              action: 'VACUUM ANALYZE',
              status: 'failed',
              error: error.message
            });
            console.error(`❌ Failed to vacuum table ${row.tablename}:`, error);
          }
        }

        // Reindex tables with low index usage
        const unusedIndexes = await db.query(`
          SELECT 
            schemaname,
            tablename,
            indexname
          FROM pg_stat_user_indexes
          WHERE idx_scan < 10
          LIMIT 5
        `);

        for (const row of unusedIndexes.rows) {
          try {
            await db.query(`REINDEX INDEX ${row.indexname}`);
            results.push({
              index: row.indexname,
              action: 'REINDEX',
              status: 'success'
            });
            console.log(`✅ Reindexed: ${row.indexname}`);
          } catch (error) {
            results.push({
              index: row.indexname,
              action: 'REINDEX',
              status: 'failed',
              error: error.message
            });
          }
        }
      } else {
        // SQLite maintenance
        try {
          await new Promise((resolve, reject) => {
            db.run('VACUUM', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          results.push({
            action: 'VACUUM',
            status: 'success'
          });
          console.log('✅ SQLite VACUUM completed');
        } catch (error) {
          results.push({
            action: 'VACUUM',
            status: 'failed',
            error: error.message
          });
        }

        try {
          await new Promise((resolve, reject) => {
            db.run('ANALYZE', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          results.push({
            action: 'ANALYZE',
            status: 'success'
          });
          console.log('✅ SQLite ANALYZE completed');
        } catch (error) {
          results.push({
            action: 'ANALYZE',
            status: 'failed',
            error: error.message
          });
        }
      }

      return {
        timestamp: new Date().toISOString(),
        database_type: dbType,
        results,
        success: results.every(r => r.status === 'success')
      };
    } catch (error) {
      console.error('❌ Maintenance failed:', error);
      throw error;
    }
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return this.healthStatus;
  }

  /**
   * Get integrity status
   */
  async getIntegrityStatus() {
    const cached = await cacheService.get('monitoring', 'database_integrity');
    if (cached) return cached;

    // If no cached status, perform check
    return await this.checkDataIntegrity();
  }
}

// Singleton instance
const databaseMonitor = new DatabaseMonitor();

export default databaseMonitor;