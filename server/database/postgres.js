import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

const { Pool } = pg;

/**
 * PostgreSQL Database Connection Pool with Health Checks
 * Provides optimized connection management for production scalability
 */
class PostgreSQLDatabase {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
    this.healthCheckInterval = null;
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      totalQueries: 0,
      queryErrors: 0,
      avgQueryTime: 0,
      lastHealthCheck: null
    };
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  async init() {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'bizgrow_ai',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
      
      // Connection Pool Configuration
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 30000,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 600000,
      
      // Connection Settings
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
      statement_timeout: 30000,
      
      // SSL Configuration: Production enforces valid certificate verification
      ssl: process.env.NODE_ENV === 'production' ? (
        process.env.DB_SSL === 'false' ? false : {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ca: process.env.DB_SSL_CA ? process.env.DB_SSL_CA : undefined
        }
      ) : (process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false),
      
      // Application name for monitoring
      application_name: 'bizgrow_ai_server'
    };

    try {
      this.pool = new Pool(config);
      
      // Set up pool event handlers
      this.setupPoolEventHandlers();
      
      // Test connection
      await this.testConnection();
      
      // Start health check monitoring
      this.startHealthChecks();
      
      console.log('✅ PostgreSQL connection pool initialized successfully');
      console.log(`📊 Pool config: min=${config.min}, max=${config.max}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize PostgreSQL pool:', error);
      throw error;
    }
  }

  /**
   * Set up pool event handlers for monitoring
   */
  setupPoolEventHandlers() {
    this.pool.on('connect', (client) => {
      this.metrics.totalConnections++;
      console.log('🔗 New PostgreSQL client connected');
    });

    this.pool.on('acquire', (client) => {
      this.metrics.activeConnections++;
      console.log('📤 PostgreSQL client acquired from pool');
    });

    this.pool.on('release', (client) => {
      this.metrics.activeConnections--;
      console.log('📥 PostgreSQL client released back to pool');
    });

    this.pool.on('remove', (client) => {
      this.metrics.totalConnections--;
      console.log('🗑️ PostgreSQL client removed from pool');
    });

    this.pool.on('error', (err, client) => {
      console.error('❌ PostgreSQL pool error:', err);
      this.metrics.queryErrors++;
    });
  }

  /**
   * Test database connection
   */
  async testConnection() {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT NOW() as current_time, version() as version');
      this.isConnected = true;
      console.log('✅ PostgreSQL connection test successful');
      console.log(`🕐 Server time: ${result.rows[0].current_time}`);
      console.log(`📋 Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
      return true;
    } catch (error) {
      this.isConnected = false;
      console.error('❌ PostgreSQL connection test failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    const interval = parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000; // 30 seconds
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('❌ Health check failed:', error);
        this.isConnected = false;
        
        // Attempt reconnection if health check fails
        if (this.connectionAttempts < this.maxRetries) {
          this.connectionAttempts++;
          console.log(`🔄 Attempting reconnection (${this.connectionAttempts}/${this.maxRetries})...`);
          
          setTimeout(async () => {
            try {
              await this.testConnection();
              this.connectionAttempts = 0;
            } catch (reconnectError) {
              console.error('❌ Reconnection failed:', reconnectError);
            }
          }, this.retryDelay);
        }
      }
    }, interval);
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    const client = await this.pool.connect();
    
    try {
      // Test basic connectivity
      await client.query('SELECT 1');
      
      // Get pool statistics
      const poolStats = {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      };
      
      // Update metrics
      this.metrics.activeConnections = poolStats.totalCount - poolStats.idleCount;
      this.metrics.idleConnections = poolStats.idleCount;
      this.metrics.waitingClients = poolStats.waitingCount;
      this.metrics.lastHealthCheck = new Date().toISOString();
      
      const responseTime = Date.now() - startTime;
      this.metrics.avgQueryTime = (this.metrics.avgQueryTime + responseTime) / 2;
      
      this.isConnected = true;
      
      console.log(`💚 Health check passed (${responseTime}ms) - Pool: ${poolStats.totalCount} total, ${poolStats.idleCount} idle, ${poolStats.waitingCount} waiting`);
      
      return {
        healthy: true,
        responseTime,
        poolStats,
        metrics: this.metrics
      };
    } catch (error) {
      this.isConnected = false;
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute query with performance monitoring
   */
  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('Database not connected. Please check connection status.');
    }

    const startTime = Date.now();
    const client = await this.pool.connect();
    
    try {
      this.metrics.totalQueries++;
      
      const result = await client.query(text, params);
      
      const queryTime = Date.now() - startTime;
      this.metrics.avgQueryTime = (this.metrics.avgQueryTime + queryTime) / 2;
      
      // Log slow queries (>100ms)
      if (queryTime > 100) {
        console.warn(`🐌 Slow query detected (${queryTime}ms):`, text.substring(0, 100) + '...');
      }
      
      return result;
    } catch (error) {
      this.metrics.queryErrors++;
      console.error('❌ Query error:', error);
      console.error('📝 Query:', text);
      console.error('📋 Params:', params);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute transaction with automatic rollback on error
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get database and pool metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      poolStats: this.pool ? {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      } : null,
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts
    };
  }

  /**
   * Get database statistics for monitoring
   */
  async getDatabaseStats() {
    try {
      const stats = await this.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC;
      `);

      const indexStats = await this.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes
        ORDER BY idx_tup_read DESC;
      `);

      return {
        tableStats: stats.rows,
        indexStats: indexStats.rows,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      return null;
    }
  }

  /**
   * Optimize database performance
   */
  async optimizeDatabase() {
    try {
      console.log('🔧 Starting database optimization...');
      
      // Update table statistics
      await this.query('ANALYZE;');
      console.log('✅ Table statistics updated');
      
      // Get table sizes for optimization decisions
      const tableSizes = await this.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
      `);
      
      console.log('📊 Table sizes:', tableSizes.rows);
      
      // Vacuum large tables if needed
      for (const table of tableSizes.rows) {
        if (table.size_bytes > 1000000) { // 1MB threshold
          console.log(`🧹 Vacuuming large table: ${table.tablename}`);
          await this.query(`VACUUM ANALYZE ${table.tablename};`);
        }
      }
      
      console.log('✅ Database optimization completed');
      return true;
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
      return false;
    }
  }

  /**
   * Close database connection pool
   */
  async close() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.pool) {
      await this.pool.end();
      console.log('🔒 PostgreSQL connection pool closed');
    }
  }

  /**
   * Reconnect database pool
   */
  async reconnect() {
    console.log('🔄 Reconnecting PostgreSQL pool...');
    
    try {
      // Close existing pool
      if (this.pool) {
        await this.pool.end();
      }
      
      // Reset connection state
      this.isConnected = false;
      this.connectionAttempts = 0;
      
      // Reinitialize pool
      await this.init();
      
      console.log('✅ PostgreSQL pool reconnected successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to reconnect PostgreSQL pool:', error);
      throw error;
    }
  }

  /**
   * Get connection pool status
   */
  getPoolStatus() {
    if (!this.pool) {
      return { status: 'not_initialized' };
    }

    return {
      status: this.isConnected ? 'connected' : 'disconnected',
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      metrics: this.metrics
    };
  }
}

// Singleton instance
const postgresDb = new PostgreSQLDatabase();

export default postgresDb;