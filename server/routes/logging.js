import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import logger, { logAggregator } from '../services/logger.js';
import logAggregationService from '../services/logAggregation.js';

const router = express.Router();

// Get logging metrics (developer/admin only)
router.get('/metrics', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = logAggregator.getMetrics();
    const aggregationMetrics = logAggregationService.getMetrics();
    
    res.json({
      success: true,
      data: {
        basic: metrics,
        aggregation: aggregationMetrics,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get logging metrics', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve logging metrics'
    });
  }
});

// Get active alerts (developer/admin only)
router.get('/alerts', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const alerts = logAggregationService.getActiveAlerts();
    
    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get active alerts', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active alerts'
    });
  }
});

// Search logs (developer/admin only)
router.post('/search', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const criteria = req.body;
    const results = await logAggregationService.searchLogs(criteria);
    
    logger.info('Log search performed', {
      criteria,
      resultCount: results.length,
      userId: req.user.id,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: {
        results,
        count: results.length,
        criteria,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Log search failed', { 
      error: error.message,
      criteria: req.body,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Log search failed'
    });
  }
});

// Get log analysis (developer/admin only)
router.get('/analysis', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const timeWindow = parseInt(req.query.timeWindow) || 5 * 60 * 1000; // 5 minutes default
    const analysis = await logAggregationService.analyzeRecentLogs(timeWindow);
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    logger.error('Failed to get log analysis', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve log analysis'
    });
  }
});

// Generate daily report (admin only)
router.post('/reports/daily', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const report = await logAggregationService.generateDailyReport();
    
    logger.audit('Daily report generated', {
      userId: req.user.id,
      reportDate: report.date,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Failed to generate daily report', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate daily report'
    });
  }
});

// Get log configuration (admin only)
router.get('/config', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const config = {
      logLevel: process.env.LOG_LEVEL || 'info',
      logAggregationEnabled: !!process.env.LOG_AGGREGATION_URL,
      logRetentionDays: process.env.LOG_RETENTION_DAYS || 30,
      maxLogFileSize: '50MB',
      maxLogFiles: 10,
      environment: process.env.NODE_ENV || 'development',
      features: {
        structuredLogging: true,
        correlationIds: true,
        securityLogging: true,
        performanceLogging: true,
        businessMetrics: true,
        auditLogging: true
      }
    };
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Failed to get log configuration', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve log configuration'
    });
  }
});

// Update log configuration (admin only)
router.put('/config', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { logLevel } = req.body;
    
    // Validate log level
    const validLevels = ['error', 'warn', 'info', 'debug'];
    if (logLevel && !validLevels.includes(logLevel)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid log level. Must be one of: error, warn, info, debug'
      });
    }
    
    // Update logger level
    if (logLevel) {
      logger.logger.level = logLevel;
      process.env.LOG_LEVEL = logLevel;
    }
    
    logger.audit('Log configuration updated', {
      changes: req.body,
      userId: req.user.id,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      message: 'Log configuration updated successfully',
      data: {
        logLevel: logger.logger.level
      }
    });
  } catch (error) {
    logger.error('Failed to update log configuration', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update log configuration'
    });
  }
});

// Test logging endpoints (developer/admin only)
router.post('/test', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { level = 'info', message = 'Test log message', metadata = {} } = req.body;
    
    // Generate test log
    const testLogger = logger.child({
      correlationId: req.correlationId,
      userId: req.user.id,
      testLog: true
    });
    
    testLogger.log(level, message, {
      ...metadata,
      type: 'test',
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Test log generated successfully',
      data: {
        level,
        message,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to generate test log', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate test log'
    });
  }
});

// Get log statistics (developer/admin only)
router.get('/stats', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const timeRange = req.query.timeRange || '1h';
    const stats = await logAggregationService.searchLogs({ timeRange, limit: 10000 });
    
    // Calculate statistics
    const levelCounts = {};
    const typeCounts = {};
    const hourlyDistribution = {};
    
    stats.forEach(log => {
      // Count by level
      const level = log.level || 'UNKNOWN';
      levelCounts[level] = (levelCounts[level] || 0) + 1;
      
      // Count by type
      const type = log.type || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      
      // Hourly distribution
      const hour = new Date(log.timestamp).getHours();
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    });
    
    res.json({
      success: true,
      data: {
        timeRange,
        totalLogs: stats.length,
        levelDistribution: levelCounts,
        typeDistribution: typeCounts,
        hourlyDistribution,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get log statistics', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve log statistics'
    });
  }
});

// Export logs (admin only)
router.post('/export', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { timeRange = '24h', format = 'json', filters = {} } = req.body;
    
    // Search logs based on criteria
    const logs = await logAggregationService.searchLogs({
      ...filters,
      timeRange,
      limit: 10000
    });
    
    // Format response based on requested format
    let responseData;
    let contentType;
    let filename;
    
    if (format === 'csv') {
      // Convert to CSV
      const csvHeaders = ['timestamp', 'level', 'message', 'correlationId', 'userId', 'type'];
      const csvRows = logs.map(log => 
        csvHeaders.map(header => log[header] || '').join(',')
      );
      responseData = [csvHeaders.join(','), ...csvRows].join('\n');
      contentType = 'text/csv';
      filename = `logs-export-${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      // Default to JSON
      responseData = JSON.stringify(logs, null, 2);
      contentType = 'application/json';
      filename = `logs-export-${new Date().toISOString().split('T')[0]}.json`;
    }
    
    logger.audit('Logs exported', {
      userId: req.user.id,
      timeRange,
      format,
      logCount: logs.length,
      correlationId: req.correlationId
    });
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(responseData);
  } catch (error) {
    logger.error('Failed to export logs', { 
      error: error.message,
      correlationId: req.correlationId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to export logs'
    });
  }
});

export default router;