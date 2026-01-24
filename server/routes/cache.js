import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import cacheService from '../services/cacheService.js';
import cachedDb from '../services/cachedDatabase.js';
import {
  getCacheHealth,
  getCacheMetrics,
  getCacheInfo,
  cleanupCache
} from '../middleware/cache.js';

const router = express.Router();

/**
 * Cache Management Routes
 * Provides endpoints for cache monitoring, administration, and optimization
 */

/**
 * Get cache health status
 * GET /api/cache/health
 */
router.get('/health', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const health = await getCacheHealth();
    const dbHealth = await cachedDb.healthCheck();
    
    res.json({
      cache: health,
      database: dbHealth,
      overall: health.redis && dbHealth.database ? 'healthy' : 'degraded'
    });
  } catch (error) {
    console.error('Cache health check error:', error);
    res.status(500).json({ error: 'Failed to check cache health' });
  }
});

/**
 * Get cache metrics and statistics
 * GET /api/cache/metrics
 */
router.get('/metrics', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = getCacheMetrics();
    const info = await getCacheInfo();
    
    res.json({
      metrics,
      info,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache metrics error:', error);
    res.status(500).json({ error: 'Failed to get cache metrics' });
  }
});

/**
 * Get detailed cache information
 * GET /api/cache/info
 */
router.get('/info', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const info = await getCacheInfo();
    const metrics = getCacheMetrics();
    const health = await getCacheHealth();
    
    res.json({
      info,
      metrics,
      health,
      strategies: cacheService.strategies,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache info error:', error);
    res.status(500).json({ error: 'Failed to get cache info' });
  }
});

/**
 * Reset cache metrics
 * POST /api/cache/metrics/reset
 */
router.post('/metrics/reset', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    cacheService.resetMetrics();
    res.json({ 
      success: true, 
      message: 'Cache metrics reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache metrics reset error:', error);
    res.status(500).json({ error: 'Failed to reset cache metrics' });
  }
});

/**
 * Invalidate cache by namespace
 * DELETE /api/cache/namespace/:namespace
 */
router.delete('/namespace/:namespace', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { namespace } = req.params;
    const count = await cacheService.invalidateNamespace(namespace);
    
    res.json({
      success: true,
      message: `Invalidated ${count} keys in namespace '${namespace}'`,
      namespace,
      keysInvalidated: count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache namespace invalidation error:', error);
    res.status(500).json({ error: 'Failed to invalidate cache namespace' });
  }
});

/**
 * Invalidate cache by pattern
 * DELETE /api/cache/pattern
 */
router.delete('/pattern', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { namespace, pattern } = req.body;
    
    if (!namespace || !pattern) {
      return res.status(400).json({ error: 'Namespace and pattern are required' });
    }
    
    const count = await cacheService.invalidatePattern(namespace, pattern);
    
    res.json({
      success: true,
      message: `Invalidated ${count} keys matching pattern '${pattern}' in namespace '${namespace}'`,
      namespace,
      pattern,
      keysInvalidated: count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache pattern invalidation error:', error);
    res.status(500).json({ error: 'Failed to invalidate cache pattern' });
  }
});

/**
 * Get cache entry
 * GET /api/cache/entry/:namespace/:key
 */
router.get('/entry/:namespace/:key', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const { params: queryParams } = req.query;
    
    const params = queryParams ? JSON.parse(queryParams) : {};
    const value = await cacheService.get(namespace, key, params);
    
    if (value === null) {
      return res.status(404).json({ error: 'Cache entry not found' });
    }
    
    res.json({
      namespace,
      key,
      params,
      value,
      found: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache entry get error:', error);
    res.status(500).json({ error: 'Failed to get cache entry' });
  }
});

/**
 * Set cache entry
 * POST /api/cache/entry/:namespace/:key
 */
router.post('/entry/:namespace/:key', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const { value, params = {}, ttl } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }
    
    const success = await cacheService.set(namespace, key, value, params, ttl);
    
    if (success) {
      res.json({
        success: true,
        message: 'Cache entry set successfully',
        namespace,
        key,
        params,
        ttl,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ error: 'Failed to set cache entry' });
    }
  } catch (error) {
    console.error('Cache entry set error:', error);
    res.status(500).json({ error: 'Failed to set cache entry' });
  }
});

/**
 * Delete cache entry
 * DELETE /api/cache/entry/:namespace/:key
 */
router.delete('/entry/:namespace/:key', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const { params: queryParams } = req.query;
    
    const params = queryParams ? JSON.parse(queryParams) : {};
    const success = await cacheService.delete(namespace, key, params);
    
    res.json({
      success,
      message: success ? 'Cache entry deleted successfully' : 'Cache entry not found',
      namespace,
      key,
      params,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache entry delete error:', error);
    res.status(500).json({ error: 'Failed to delete cache entry' });
  }
});

/**
 * Cleanup expired cache entries
 * POST /api/cache/cleanup
 */
router.post('/cleanup', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await cleanupCache();
    res.json(result);
  } catch (error) {
    console.error('Cache cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup cache' });
  }
});

/**
 * Warm cache with frequently accessed data
 * POST /api/cache/warm
 */
router.post('/warm', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { namespaces = ['businesses', 'users', 'agents'] } = req.body;
    let warmedCount = 0;
    
    // Warm up businesses cache
    if (namespaces.includes('businesses')) {
      const businesses = await cachedDb.getBusinesses({ limit: 100 });
      warmedCount += businesses.length;
    }
    
    // Warm up agents cache
    if (namespaces.includes('agents')) {
      await cachedDb.getAgentStatus();
      warmedCount += 1;
    }
    
    // Warm up analytics cache
    if (namespaces.includes('analytics')) {
      await cachedDb.getAnalytics();
      await cachedDb.getRecentActivity();
      warmedCount += 2;
    }
    
    res.json({
      success: true,
      message: `Cache warmed successfully`,
      namespacesWarmed: namespaces,
      entriesWarmed: warmedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache warm error:', error);
    res.status(500).json({ error: 'Failed to warm cache' });
  }
});

/**
 * Get cache hit/miss ratio by namespace
 * GET /api/cache/analytics
 */
router.get('/analytics', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    
    // This would typically come from a time-series database
    // For now, return current metrics with mock historical data
    const currentMetrics = getCacheMetrics();
    
    const analytics = {
      current: currentMetrics,
      historical: {
        timeRange,
        hitRateHistory: [
          { timestamp: new Date(Date.now() - 3600000).toISOString(), hitRate: 85.2 },
          { timestamp: new Date(Date.now() - 1800000).toISOString(), hitRate: 87.1 },
          { timestamp: new Date().toISOString(), hitRate: currentMetrics.hitRate }
        ],
        requestVolumeHistory: [
          { timestamp: new Date(Date.now() - 3600000).toISOString(), requests: 1250 },
          { timestamp: new Date(Date.now() - 1800000).toISOString(), requests: 1890 },
          { timestamp: new Date().toISOString(), requests: currentMetrics.totalRequests }
        ]
      },
      recommendations: []
    };
    
    // Add recommendations based on metrics
    if (currentMetrics.hitRate < 70) {
      analytics.recommendations.push({
        type: 'low_hit_rate',
        message: 'Consider increasing TTL values or warming cache more frequently',
        priority: 'high'
      });
    }
    
    if (currentMetrics.errors > currentMetrics.totalRequests * 0.01) {
      analytics.recommendations.push({
        type: 'high_error_rate',
        message: 'High cache error rate detected, check Redis connection',
        priority: 'critical'
      });
    }
    
    res.json(analytics);
  } catch (error) {
    console.error('Cache analytics error:', error);
    res.status(500).json({ error: 'Failed to get cache analytics' });
  }
});

/**
 * Test cache performance
 * POST /api/cache/test
 */
router.post('/test', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { operations = 100, dataSize = 'small' } = req.body;
    
    const testData = {
      small: { test: 'data', timestamp: Date.now() },
      medium: { test: 'data'.repeat(100), array: new Array(50).fill('test'), timestamp: Date.now() },
      large: { test: 'data'.repeat(1000), array: new Array(500).fill('test'), timestamp: Date.now() }
    };
    
    const data = testData[dataSize] || testData.small;
    const results = {
      operations,
      dataSize,
      setOperations: { success: 0, failed: 0, totalTime: 0 },
      getOperations: { success: 0, failed: 0, totalTime: 0, hits: 0, misses: 0 }
    };
    
    // Test SET operations
    const setStartTime = Date.now();
    for (let i = 0; i < operations; i++) {
      try {
        const success = await cacheService.set('test', `perf_test_${i}`, data);
        if (success) {
          results.setOperations.success++;
        } else {
          results.setOperations.failed++;
        }
      } catch (error) {
        results.setOperations.failed++;
      }
    }
    results.setOperations.totalTime = Date.now() - setStartTime;
    
    // Test GET operations
    const getStartTime = Date.now();
    for (let i = 0; i < operations; i++) {
      try {
        const value = await cacheService.get('test', `perf_test_${i}`);
        if (value !== null) {
          results.getOperations.success++;
          results.getOperations.hits++;
        } else {
          results.getOperations.misses++;
        }
      } catch (error) {
        results.getOperations.failed++;
      }
    }
    results.getOperations.totalTime = Date.now() - getStartTime;
    
    // Calculate performance metrics
    results.performance = {
      setOpsPerSecond: (results.setOperations.success / (results.setOperations.totalTime / 1000)).toFixed(2),
      getOpsPerSecond: (results.getOperations.success / (results.getOperations.totalTime / 1000)).toFixed(2),
      avgSetTime: (results.setOperations.totalTime / operations).toFixed(2),
      avgGetTime: (results.getOperations.totalTime / operations).toFixed(2),
      hitRate: ((results.getOperations.hits / operations) * 100).toFixed(2)
    };
    
    // Cleanup test data
    await cacheService.invalidatePattern('test', 'perf_test_*');
    
    res.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache performance test error:', error);
    res.status(500).json({ error: 'Failed to run cache performance test' });
  }
});

export default router;