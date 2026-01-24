import { getDatabaseType, getDatabase } from '../database/init.js';
import cacheService from './cacheService.js';

/**
 * Database Performance Monitoring Service
 * Tracks query performance, identifies slow queries, and provides optimization insights
 */
class DatabaseMonitor {
  constructor() {
    this.queryStats = new Map();
    this.slowQueries = [];
    this.alertThresholds = {
      slowQueryMs: 100,
      errorRate: 0.05, // 5%
      connectionPoolUtilization: 0.8 // 80%
    };
    this.monitoringInterval = null;
    this.isMonitoring = false;
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

    // Initial metrics collection
    this.collectMetrics();
  }

  /**
   * Stop database monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
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
}

// Singleton instance
const databaseMonitor = new DatabaseMonitor();

export default databaseMonitor;