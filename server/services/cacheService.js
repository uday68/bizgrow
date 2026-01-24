import { createClient } from 'redis';
import { createHash } from 'crypto';

/**
 * Comprehensive Redis Caching Service
 * Implements multi-level caching with intelligent invalidation strategies
 * Supports application, session, and query result caching
 */
class CacheService {
  constructor() {
    this.redisClient = null;
    this.clusterClient = null;
    this.isConnected = false;
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalRequests: 0
    };
    
    // Cache strategies configuration
    this.strategies = {
      businesses: { ttl: 3600, strategy: 'write-through' }, // 1 hour
      proposals: { ttl: 1800, strategy: 'write-behind' },   // 30 minutes
      analytics: { ttl: 300, strategy: 'cache-aside' },     // 5 minutes
      sessions: { ttl: 86400, strategy: 'write-through' },  // 24 hours
      queries: { ttl: 600, strategy: 'cache-aside' },       // 10 minutes
      users: { ttl: 1800, strategy: 'write-through' },      // 30 minutes
      agents: { ttl: 120, strategy: 'cache-aside' }         // 2 minutes
    };

    this.initRedis();
  }

  /**
   * Initialize Redis connection with clustering support
   */
  async initRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redisClusterNodes = process.env.REDIS_CLUSTER_NODES;

      if (redisClusterNodes) {
        // Cluster mode
        const nodes = redisClusterNodes.split(',').map(node => {
          const [host, port] = node.trim().split(':');
          return { host, port: parseInt(port) || 6379 };
        });

        this.clusterClient = createClient({
          cluster: {
            enableAutoPipelining: true,
            rootNodes: nodes
          },
          socket: {
            reconnectStrategy: (retries) => Math.min(retries * 50, 500)
          }
        });

        await this.clusterClient.connect();
        this.redisClient = this.clusterClient;
        console.log('✅ Redis Cluster connected for caching');
      } else {
        // Single instance mode
        this.redisClient = createClient({
          url: redisUrl,
          socket: {
            reconnectStrategy: (retries) => Math.min(retries * 50, 500)
          }
        });

        await this.redisClient.connect();
        console.log('✅ Redis connected for caching');
      }

      this.isConnected = true;
      this.setupEventHandlers();
      
      // Start metrics collection
      this.startMetricsCollection();
      
    } catch (error) {
      console.warn('⚠️ Redis not available for caching:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * Setup Redis event handlers
   */
  setupEventHandlers() {
    if (!this.redisClient) return;

    this.redisClient.on('error', (error) => {
      console.error('Redis cache error:', error);
      this.metrics.errors++;
      this.isConnected = false;
    });

    this.redisClient.on('connect', () => {
      console.log('Redis cache connected');
      this.isConnected = true;
    });

    this.redisClient.on('disconnect', () => {
      console.log('Redis cache disconnected');
      this.isConnected = false;
    });
  }

  /**
   * Generate cache key with namespace
   */
  generateKey(namespace, key, params = {}) {
    const baseKey = `cache:bizgrow:${namespace}:${key}`;
    
    if (Object.keys(params).length === 0) {
      return baseKey;
    }

    // Create deterministic hash for parameters
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    const paramHash = createHash('md5').update(paramString).digest('hex').substring(0, 8);
    
    return `${baseKey}:${paramHash}`;
  }

  /**
   * Get value from cache
   */
  async get(namespace, key, params = {}) {
    if (!this.isConnected || !this.redisClient) {
      this.metrics.misses++;
      this.metrics.totalRequests++;
      return null;
    }

    try {
      const cacheKey = this.generateKey(namespace, key, params);
      const value = await this.redisClient.get(cacheKey);
      
      this.metrics.totalRequests++;
      
      if (value) {
        this.metrics.hits++;
        const parsed = JSON.parse(value);
        
        // Check if data has metadata (timestamp, version, etc.)
        if (parsed.metadata) {
          return parsed.data;
        }
        
        return parsed;
      } else {
        this.metrics.misses++;
        return null;
      }
    } catch (error) {
      console.error('Cache get error:', error);
      this.metrics.errors++;
      this.metrics.misses++;
      this.metrics.totalRequests++;
      return null;
    }
  }

  /**
   * Set value in cache with TTL and strategy
   */
  async set(namespace, key, value, params = {}, customTtl = null) {
    if (!this.isConnected || !this.redisClient) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(namespace, key, params);
      const strategy = this.strategies[namespace] || this.strategies.queries;
      const ttl = customTtl || strategy.ttl;

      // Wrap data with metadata
      const cacheData = {
        data: value,
        metadata: {
          timestamp: Date.now(),
          ttl: ttl,
          strategy: strategy.strategy,
          namespace: namespace,
          version: 1
        }
      };

      await this.redisClient.setEx(cacheKey, ttl, JSON.stringify(cacheData));
      this.metrics.sets++;
      
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Delete specific cache entry
   */
  async delete(namespace, key, params = {}) {
    if (!this.isConnected || !this.redisClient) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(namespace, key, params);
      const result = await this.redisClient.del(cacheKey);
      
      if (result > 0) {
        this.metrics.deletes++;
      }
      
      return result > 0;
    } catch (error) {
      console.error('Cache delete error:', error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(namespace, pattern = '*') {
    if (!this.isConnected || !this.redisClient) {
      return 0;
    }

    try {
      const searchPattern = `cache:bizgrow:${namespace}:${pattern}`;
      const keys = await this.redisClient.keys(searchPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redisClient.del(keys);
      this.metrics.deletes += result;
      
      return result;
    } catch (error) {
      console.error('Cache invalidate pattern error:', error);
      this.metrics.errors++;
      return 0;
    }
  }

  /**
   * Invalidate all cache for a namespace
   */
  async invalidateNamespace(namespace) {
    return await this.invalidatePattern(namespace, '*');
  }

  /**
   * Cache-aside pattern implementation
   */
  async getOrSet(namespace, key, fetchFunction, params = {}, customTtl = null) {
    // Try to get from cache first
    const cached = await this.get(namespace, key, params);
    
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch data
    try {
      const data = await fetchFunction();
      
      if (data !== null && data !== undefined) {
        await this.set(namespace, key, data, params, customTtl);
      }
      
      return data;
    } catch (error) {
      console.error('Cache getOrSet fetch error:', error);
      throw error;
    }
  }

  /**
   * Write-through pattern implementation
   */
  async writeThrough(namespace, key, value, writeFunction, params = {}, customTtl = null) {
    try {
      // Write to primary storage first
      const result = await writeFunction(value);
      
      // If write successful, update cache
      if (result) {
        await this.set(namespace, key, value, params, customTtl);
      }
      
      return result;
    } catch (error) {
      console.error('Cache write-through error:', error);
      throw error;
    }
  }

  /**
   * Write-behind pattern implementation
   */
  async writeBehind(namespace, key, value, writeFunction, params = {}, customTtl = null) {
    try {
      // Update cache immediately
      await this.set(namespace, key, value, params, customTtl);
      
      // Schedule write to primary storage (async)
      setImmediate(async () => {
        try {
          await writeFunction(value);
        } catch (error) {
          console.error('Cache write-behind storage error:', error);
          // Could implement retry logic here
        }
      });
      
      return true;
    } catch (error) {
      console.error('Cache write-behind error:', error);
      throw error;
    }
  }

  /**
   * Multi-get operation for batch retrieval
   */
  async mget(namespace, keys, params = {}) {
    if (!this.isConnected || !this.redisClient || keys.length === 0) {
      return {};
    }

    try {
      const cacheKeys = keys.map(key => this.generateKey(namespace, key, params));
      const values = await this.redisClient.mGet(cacheKeys);
      
      const result = {};
      keys.forEach((key, index) => {
        const value = values[index];
        if (value) {
          try {
            const parsed = JSON.parse(value);
            result[key] = parsed.metadata ? parsed.data : parsed;
            this.metrics.hits++;
          } catch (error) {
            console.error('Cache mget parse error:', error);
            this.metrics.errors++;
          }
        } else {
          this.metrics.misses++;
        }
        this.metrics.totalRequests++;
      });
      
      return result;
    } catch (error) {
      console.error('Cache mget error:', error);
      this.metrics.errors++;
      return {};
    }
  }

  /**
   * Multi-set operation for batch storage
   */
  async mset(namespace, keyValuePairs, params = {}, customTtl = null) {
    if (!this.isConnected || !this.redisClient || Object.keys(keyValuePairs).length === 0) {
      return false;
    }

    try {
      const strategy = this.strategies[namespace] || this.strategies.queries;
      const ttl = customTtl || strategy.ttl;
      
      const pipeline = this.redisClient.multi();
      
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        const cacheKey = this.generateKey(namespace, key, params);
        const cacheData = {
          data: value,
          metadata: {
            timestamp: Date.now(),
            ttl: ttl,
            strategy: strategy.strategy,
            namespace: namespace,
            version: 1
          }
        };
        
        pipeline.setEx(cacheKey, ttl, JSON.stringify(cacheData));
      });
      
      await pipeline.exec();
      this.metrics.sets += Object.keys(keyValuePairs).length;
      
      return true;
    } catch (error) {
      console.error('Cache mset error:', error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Get cache statistics and metrics
   */
  getMetrics() {
    const hitRate = this.metrics.totalRequests > 0 
      ? (this.metrics.hits / this.metrics.totalRequests * 100).toFixed(2)
      : 0;

    return {
      ...this.metrics,
      hitRate: parseFloat(hitRate),
      isConnected: this.isConnected,
      strategies: this.strategies,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalRequests: 0
    };
  }

  /**
   * Get cache size and memory usage
   */
  async getCacheInfo() {
    if (!this.isConnected || !this.redisClient) {
      return null;
    }

    try {
      const info = await this.redisClient.info('memory');
      const keyCount = await this.redisClient.dbSize();
      
      // Parse memory info
      const memoryInfo = {};
      info.split('\r\n').forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          memoryInfo[key] = value;
        }
      });

      return {
        keyCount,
        memoryUsed: memoryInfo.used_memory_human || 'N/A',
        memoryPeak: memoryInfo.used_memory_peak_human || 'N/A',
        memoryRss: memoryInfo.used_memory_rss_human || 'N/A',
        fragmentation: memoryInfo.mem_fragmentation_ratio || 'N/A'
      };
    } catch (error) {
      console.error('Cache info error:', error);
      return null;
    }
  }

  /**
   * Health check for cache service
   */
  async healthCheck() {
    const health = {
      redis: false,
      cluster: false,
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    };

    if (this.redisClient) {
      try {
        await this.redisClient.ping();
        health.redis = true;
        
        if (this.clusterClient) {
          health.cluster = true;
        }
      } catch (error) {
        health.redis = false;
        health.error = error.message;
      }
    }

    return health;
  }

  /**
   * Start periodic metrics collection
   */
  startMetricsCollection() {
    // Collect metrics every 5 minutes
    setInterval(async () => {
      try {
        const metrics = this.getMetrics();
        const cacheInfo = await this.getCacheInfo();
        
        // Log metrics for monitoring
        console.log('Cache Metrics:', {
          hitRate: metrics.hitRate,
          totalRequests: metrics.totalRequests,
          keyCount: cacheInfo?.keyCount || 0,
          memoryUsed: cacheInfo?.memoryUsed || 'N/A'
        });
        
        // Could send to monitoring service here
        
      } catch (error) {
        console.error('Metrics collection error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Cleanup expired keys and optimize cache
   */
  async cleanup() {
    if (!this.isConnected || !this.redisClient) {
      return { success: false, message: 'Redis not available' };
    }

    try {
      let cleanedCount = 0;
      
      // Get all cache keys
      const keys = await this.redisClient.keys('cache:bizgrow:*');
      
      for (const key of keys) {
        try {
          const value = await this.redisClient.get(key);
          if (value) {
            const parsed = JSON.parse(value);
            if (parsed.metadata) {
              const now = Date.now();
              const created = parsed.metadata.timestamp;
              const ttl = parsed.metadata.ttl * 1000; // Convert to milliseconds
              
              // If expired, delete
              if (now - created > ttl) {
                await this.redisClient.del(key);
                cleanedCount++;
              }
            }
          }
        } catch (error) {
          // If we can't parse the key, it might be corrupted - delete it
          await this.redisClient.del(key);
          cleanedCount++;
        }
      }

      return {
        success: true,
        message: `Cleaned up ${cleanedCount} expired cache keys`,
        cleanedCount
      };
    } catch (error) {
      console.error('Cache cleanup error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.isConnected = false;
      console.log('Redis cache connection closed');
    }
  }
}

// Singleton instance
const cacheService = new CacheService();

export default cacheService;