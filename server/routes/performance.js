import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { 
  getResponseTimeMetrics, 
  resetResponseTimeMetrics, 
  getPerformanceMetrics 
} from '../middleware/responseOptimization.js';
import { getCacheMetrics } from '../middleware/cache.js';
import cacheService from '../services/cacheService.js';

const router = express.Router();

/**
 * Get comprehensive performance metrics
 * Requires developer role or higher
 */
router.get('/metrics', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const responseTimeMetrics = getResponseTimeMetrics();
    const cacheMetrics = getCacheMetrics();
    const performanceMetrics = getPerformanceMetrics();
    const cacheHealth = await cacheService.healthCheck();

    const metrics = {
      timestamp: new Date().toISOString(),
      responseTime: responseTimeMetrics,
      cache: {
        ...cacheMetrics,
        health: cacheHealth
      },
      performance: performanceMetrics,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch performance metrics',
      details: error.message 
    });
  }
});

/**
 * Get response time metrics only
 */
router.get('/response-time', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const metrics = getResponseTimeMetrics();
    res.json({
      timestamp: new Date().toISOString(),
      ...metrics
    });
  } catch (error) {
    console.error('Error fetching response time metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch response time metrics',
      details: error.message 
    });
  }
});

/**
 * Reset response time metrics
 * Requires admin role
 */
router.post('/response-time/reset', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    resetResponseTimeMetrics();
    res.json({
      success: true,
      message: 'Response time metrics reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resetting response time metrics:', error);
    res.status(500).json({ 
      error: 'Failed to reset response time metrics',
      details: error.message 
    });
  }
});

/**
 * Get cache performance metrics
 */
router.get('/cache', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const cacheMetrics = getCacheMetrics();
    const cacheHealth = await cacheService.healthCheck();
    const cacheInfo = await cacheService.getCacheInfo();

    res.json({
      timestamp: new Date().toISOString(),
      metrics: cacheMetrics,
      health: cacheHealth,
      info: cacheInfo
    });
  } catch (error) {
    console.error('Error fetching cache metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch cache metrics',
      details: error.message 
    });
  }
});

/**
 * Get compression statistics
 */
router.get('/compression', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const performanceMetrics = getPerformanceMetrics();
    
    res.json({
      timestamp: new Date().toISOString(),
      compression: performanceMetrics.compression,
      caching: performanceMetrics.caching
    });
  } catch (error) {
    console.error('Error fetching compression metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch compression metrics',
      details: error.message 
    });
  }
});

/**
 * Get slow requests analysis
 */
router.get('/slow-requests', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const metrics = getResponseTimeMetrics();
    const { limit = 100 } = req.query;
    
    // This would typically come from a more sophisticated logging system
    // For now, we'll return the current metrics with analysis
    const analysis = {
      timestamp: new Date().toISOString(),
      totalRequests: metrics.totalRequests,
      slowRequests: metrics.slowRequests,
      slowRequestPercentage: metrics.slowRequestPercentage,
      averageResponseTime: metrics.averageResponseTime,
      p95ResponseTime: metrics.p95ResponseTime,
      p99ResponseTime: metrics.p99ResponseTime,
      recommendations: generatePerformanceRecommendations(metrics)
    };

    res.json(analysis);
  } catch (error) {
    console.error('Error fetching slow requests analysis:', error);
    res.status(500).json({ 
      error: 'Failed to fetch slow requests analysis',
      details: error.message 
    });
  }
});

/**
 * Generate performance recommendations based on metrics
 */
function generatePerformanceRecommendations(metrics) {
  const recommendations = [];

  if (parseFloat(metrics.slowRequestPercentage) > 10) {
    recommendations.push({
      type: 'warning',
      message: 'High percentage of slow requests detected',
      suggestion: 'Consider optimizing database queries and implementing more aggressive caching'
    });
  }

  if (metrics.averageResponseTime > 500) {
    recommendations.push({
      type: 'warning',
      message: 'Average response time is above 500ms',
      suggestion: 'Review slow endpoints and consider adding response compression'
    });
  }

  if (metrics.p95ResponseTime > 2000) {
    recommendations.push({
      type: 'critical',
      message: '95th percentile response time is above 2 seconds',
      suggestion: 'Immediate optimization required - check for database bottlenecks'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: 'success',
      message: 'Performance metrics are within acceptable ranges',
      suggestion: 'Continue monitoring and maintain current optimization strategies'
    });
  }

  return recommendations;
}

/**
 * Performance health check endpoint
 */
router.get('/health', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const responseTimeMetrics = getResponseTimeMetrics();
    const cacheHealth = await cacheService.healthCheck();
    
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {
        responseTime: {
          status: responseTimeMetrics.averageResponseTime < 1000 ? 'healthy' : 'warning',
          averageMs: responseTimeMetrics.averageResponseTime,
          p95Ms: responseTimeMetrics.p95ResponseTime
        },
        cache: {
          status: cacheHealth.connected ? 'healthy' : 'error',
          connected: cacheHealth.connected,
          hitRate: cacheHealth.hitRate
        },
        compression: {
          status: 'healthy',
          enabled: true
        }
      }
    };

    // Determine overall health status
    const checkStatuses = Object.values(health.checks).map(check => check.status);
    if (checkStatuses.includes('error')) {
      health.status = 'error';
    } else if (checkStatuses.includes('warning')) {
      health.status = 'warning';
    }

    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'warning' ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Error checking performance health:', error);
    res.status(503).json({
      timestamp: new Date().toISOString(),
      status: 'error',
      error: 'Failed to check performance health',
      details: error.message
    });
  }
});

/**
 * Get performance optimization suggestions
 */
router.get('/optimize', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const responseTimeMetrics = getResponseTimeMetrics();
    const cacheMetrics = getCacheMetrics();
    
    const suggestions = [];

    // Response time optimizations
    if (responseTimeMetrics.averageResponseTime > 200) {
      suggestions.push({
        category: 'response-time',
        priority: 'high',
        title: 'Optimize Response Times',
        description: 'Average response time is above optimal threshold',
        actions: [
          'Enable database query optimization',
          'Implement more aggressive caching',
          'Consider adding CDN for static assets',
          'Review and optimize slow database queries'
        ]
      });
    }

    // Cache optimizations
    if (cacheMetrics.hitRate < 80) {
      suggestions.push({
        category: 'caching',
        priority: 'medium',
        title: 'Improve Cache Hit Rate',
        description: 'Cache hit rate is below optimal threshold',
        actions: [
          'Increase cache TTL for stable data',
          'Implement cache warming strategies',
          'Review cache invalidation policies',
          'Add more cacheable endpoints'
        ]
      });
    }

    // Compression optimizations
    suggestions.push({
      category: 'compression',
      priority: 'low',
      title: 'Compression Optimization',
      description: 'Ensure optimal compression settings',
      actions: [
        'Monitor compression ratios',
        'Adjust compression levels based on CPU usage',
        'Consider Brotli compression for modern browsers',
        'Implement dynamic compression thresholds'
      ]
    });

    res.json({
      timestamp: new Date().toISOString(),
      suggestions,
      metrics: {
        responseTime: responseTimeMetrics.averageResponseTime,
        cacheHitRate: cacheMetrics.hitRate,
        totalRequests: responseTimeMetrics.totalRequests
      }
    });
  } catch (error) {
    console.error('Error generating optimization suggestions:', error);
    res.status(500).json({ 
      error: 'Failed to generate optimization suggestions',
      details: error.message 
    });
  }
});

export default router;