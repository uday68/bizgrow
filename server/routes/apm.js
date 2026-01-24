import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import apmService from '../services/apmService.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * Get current APM metrics
 * Provides real-time performance metrics
 */
router.get('/metrics', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = apmService.getCurrentMetrics();
    
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get APM metrics', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve APM metrics'
    });
  }
});

/**
 * Get APM metrics history
 * Provides historical performance data for charts and analysis
 */
router.get('/metrics/history', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    const history = apmService.getMetricsHistory(timeRange);
    
    res.json({
      success: true,
      data: {
        history,
        timeRange,
        count: history.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get APM metrics history', {
      error: error.message,
      timeRange: req.query.timeRange,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve APM metrics history'
    });
  }
});

/**
 * Get APM dashboard data
 * Comprehensive data for performance dashboard
 */
router.get('/dashboard', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    const dashboardData = apmService.getDashboardData(timeRange);
    
    res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get APM dashboard data', {
      error: error.message,
      timeRange: req.query.timeRange,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve APM dashboard data'
    });
  }
});

/**
 * Get active alerts
 * Returns current performance alerts
 */
router.get('/alerts', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const alerts = apmService.getActiveAlerts();
    
    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get APM alerts', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve APM alerts'
    });
  }
});

/**
 * Get alert history
 * Returns historical alert data
 */
router.get('/alerts/history', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const alertHistory = apmService.getAlertHistory(parseInt(limit));
    
    res.json({
      success: true,
      data: {
        alerts: alertHistory,
        count: alertHistory.length,
        limit: parseInt(limit)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get APM alert history', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve APM alert history'
    });
  }
});

/**
 * Acknowledge alert
 * Marks an alert as acknowledged by a user
 */
router.post('/alerts/:alertId/acknowledge', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;
    
    const acknowledged = apmService.acknowledgeAlert(alertId, userId);
    
    if (acknowledged) {
      logger.info('APM alert acknowledged', {
        alertId,
        userId,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        message: 'Alert acknowledged successfully',
        data: { alertId, acknowledgedBy: userId }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }
  } catch (error) {
    logger.error('Failed to acknowledge APM alert', {
      error: error.message,
      alertId: req.params.alertId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge alert'
    });
  }
});

/**
 * Generate performance report
 * Creates comprehensive performance analysis report
 */
router.post('/reports/performance', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { timeRange = '24h' } = req.body;
    const report = apmService.generatePerformanceReport(timeRange);
    
    logger.info('APM performance report generated', {
      timeRange,
      userId: req.user.id,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Failed to generate APM performance report', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate performance report'
    });
  }
});

/**
 * Get response time metrics
 * Detailed response time analysis
 */
router.get('/metrics/response-time', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = apmService.getCurrentMetrics();
    const responseTimeData = {
      current: metrics.responseTime.current,
      average: metrics.responseTime.average,
      p50: metrics.responseTime.p50,
      p95: metrics.responseTime.p95,
      p99: metrics.responseTime.p99,
      samples: metrics.responseTime.samples.length,
      distribution: calculateResponseTimeDistribution(metrics.responseTime.samples)
    };
    
    res.json({
      success: true,
      data: responseTimeData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get response time metrics', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve response time metrics'
    });
  }
});

/**
 * Get throughput metrics
 * Request throughput and volume analysis
 */
router.get('/metrics/throughput', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = apmService.getCurrentMetrics();
    const throughputData = {
      requestsPerSecond: metrics.throughput.requestsPerSecond,
      requestsPerMinute: metrics.throughput.requestsPerMinute,
      totalRequests: metrics.throughput.totalRequests,
      activeRequests: metrics.activeRequests,
      peakThroughput: calculatePeakThroughput(apmService.getMetricsHistory('1h'))
    };
    
    res.json({
      success: true,
      data: throughputData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get throughput metrics', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve throughput metrics'
    });
  }
});

/**
 * Get error metrics
 * Error rate and error analysis
 */
router.get('/metrics/errors', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = apmService.getCurrentMetrics();
    const errorData = {
      currentRate: metrics.errorRate.current,
      totalErrors: metrics.errorRate.errors,
      totalRequests: metrics.errorRate.total,
      errorsByType: metrics.errorRate.errorsByType,
      recentErrors: apmService.metrics.errorRate.errorHistory.slice(-10),
      errorTrends: calculateErrorTrends(apmService.getMetricsHistory('1h'))
    };
    
    res.json({
      success: true,
      data: errorData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get error metrics', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error metrics'
    });
  }
});

/**
 * Get system resource metrics
 * CPU, memory, disk, and network metrics
 */
router.get('/metrics/system', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = apmService.getCurrentMetrics();
    const systemData = {
      ...metrics.systemResources,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    };
    
    res.json({
      success: true,
      data: systemData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get system metrics', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system metrics'
    });
  }
});

/**
 * Get business metrics
 * Business-specific performance indicators
 */
router.get('/metrics/business', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = apmService.getCurrentMetrics();
    const businessData = {
      ...metrics.business,
      chatMetrics: await getChatMetrics(),
      userEngagement: calculateUserEngagement(apmService.getMetricsHistory('1h')),
      conversionFunnel: calculateConversionFunnel()
    };
    
    res.json({
      success: true,
      data: businessData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get business metrics', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve business metrics'
    });
  }
});

/**
 * Get APM configuration
 * Current APM service configuration
 */
router.get('/config', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const config = {
      isMonitoring: apmService.isMonitoring,
      thresholds: apmService.thresholds,
      maxHistorySize: apmService.maxHistorySize,
      monitoringInterval: 5000, // 5 seconds
      alertCooldown: 300000, // 5 minutes
      features: {
        responseTimeTracking: true,
        throughputTracking: true,
        errorTracking: true,
        systemResourceTracking: true,
        businessMetricsTracking: true,
        realTimeAlerts: true,
        chatIntegration: true
      }
    };
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Failed to get APM configuration', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve APM configuration'
    });
  }
});

/**
 * Update APM configuration
 * Modify APM service settings
 */
router.put('/config', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { thresholds } = req.body;
    
    if (thresholds) {
      // Validate and update thresholds
      if (thresholds.responseTime) {
        Object.assign(apmService.thresholds.responseTime, thresholds.responseTime);
      }
      if (thresholds.errorRate) {
        Object.assign(apmService.thresholds.errorRate, thresholds.errorRate);
      }
      if (thresholds.cpu) {
        Object.assign(apmService.thresholds.cpu, thresholds.cpu);
      }
      if (thresholds.memory) {
        Object.assign(apmService.thresholds.memory, thresholds.memory);
      }
    }
    
    logger.info('APM configuration updated', {
      changes: req.body,
      userId: req.user.id,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      message: 'APM configuration updated successfully',
      data: {
        thresholds: apmService.thresholds
      }
    });
  } catch (error) {
    logger.error('Failed to update APM configuration', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update APM configuration'
    });
  }
});

/**
 * APM health check
 * Check if APM service is running properly
 */
router.get('/health', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const health = {
      status: apmService.isMonitoring ? 'healthy' : 'stopped',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      activeRequests: apmService.activeRequests?.size || 0,
      metricsHistory: apmService.metricsHistory?.length || 0,
      activeAlerts: apmService.getActiveAlerts().length,
      lastMetricsUpdate: apmService.metricsHistory?.length > 0 ? 
        apmService.metricsHistory[apmService.metricsHistory.length - 1].timestamp : null
    };
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.status === 'healthy',
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('APM health check failed', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(503).json({
      success: false,
      error: 'APM health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Helper functions

/**
 * Calculate response time distribution
 */
function calculateResponseTimeDistribution(samples) {
  if (samples.length === 0) return {};
  
  const buckets = {
    '0-100ms': 0,
    '100-500ms': 0,
    '500ms-1s': 0,
    '1s-3s': 0,
    '3s+': 0
  };
  
  samples.forEach(time => {
    if (time <= 100) buckets['0-100ms']++;
    else if (time <= 500) buckets['100-500ms']++;
    else if (time <= 1000) buckets['500ms-1s']++;
    else if (time <= 3000) buckets['1s-3s']++;
    else buckets['3s+']++;
  });
  
  return buckets;
}

/**
 * Calculate peak throughput from history
 */
function calculatePeakThroughput(history) {
  if (history.length === 0) return 0;
  
  return Math.max(...history.map(h => h.throughput.requestsPerSecond));
}

/**
 * Calculate error trends
 */
function calculateErrorTrends(history) {
  if (history.length < 2) return { trend: 'stable', change: 0 };
  
  const recent = history.slice(-10);
  const older = history.slice(-20, -10);
  
  const recentAvg = recent.reduce((sum, h) => sum + h.errorRate.current, 0) / recent.length;
  const olderAvg = older.length > 0 ? 
    older.reduce((sum, h) => sum + h.errorRate.current, 0) / older.length : recentAvg;
  
  const change = ((recentAvg - olderAvg) / (olderAvg || 1)) * 100;
  
  return {
    trend: change > 10 ? 'increasing' : change < -10 ? 'decreasing' : 'stable',
    change: change.toFixed(2)
  };
}

/**
 * Get chat-specific metrics
 */
async function getChatMetrics() {
  try {
    // This would integrate with the chat service
    return {
      activeSessions: 0,
      averageResponseTime: 0,
      agentUtilization: 0,
      customerSatisfaction: 0
    };
  } catch (error) {
    return {};
  }
}

/**
 * Calculate user engagement metrics
 */
function calculateUserEngagement(history) {
  if (history.length === 0) return { score: 0, trend: 'stable' };
  
  // Simplified engagement calculation
  const avgActiveUsers = history.reduce((sum, h) => sum + (h.business?.activeUsers || 0), 0) / history.length;
  const avgRequestsPerUser = history.length > 0 && avgActiveUsers > 0 ? 
    history.reduce((sum, h) => sum + (h.throughput?.requestsPerMinute || 0), 0) / history.length / avgActiveUsers : 0;
  
  return {
    score: Math.min(100, avgRequestsPerUser * 10), // Simplified scoring
    trend: 'stable',
    avgActiveUsers,
    avgRequestsPerUser
  };
}

/**
 * Calculate conversion funnel metrics
 */
function calculateConversionFunnel() {
  // This would integrate with business logic to track conversions
  return {
    visitors: 0,
    signups: 0,
    activations: 0,
    conversions: 0,
    conversionRate: 0
  };
}

export default router;