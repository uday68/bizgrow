import express from 'express';
import errorTracker from '../services/errorTracker.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * Get recent errors
 */
router.get('/recent', authenticateToken, requireRole(['admin', 'developer']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const errors = errorTracker.getRecentErrors(limit);
    
    res.json({
      success: true,
      data: {
        errors,
        total: errors.length
      }
    });
  } catch (error) {
    logger.error('Failed to get recent errors', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent errors'
    });
  }
});

/**
 * Get error by ID
 */
router.get('/:errorId', authenticateToken, requireRole(['admin', 'developer']), async (req, res) => {
  try {
    const { errorId } = req.params;
    const error = errorTracker.getError(errorId);
    
    if (!error) {
      return res.status(404).json({
        success: false,
        error: 'Error not found'
      });
    }
    
    res.json({
      success: true,
      data: error
    });
  } catch (error) {
    logger.error('Failed to get error details', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error details'
    });
  }
});

/**
 * Get correlated errors
 */
router.get('/correlation/:correlationId', authenticateToken, requireRole(['admin', 'developer']), async (req, res) => {
  try {
    const { correlationId } = req.params;
    const errors = errorTracker.getCorrelatedErrors(correlationId);
    
    res.json({
      success: true,
      data: {
        correlationId,
        errors,
        count: errors.length
      }
    });
  } catch (error) {
    logger.error('Failed to get correlated errors', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve correlated errors'
    });
  }
});

/**
 * Get error statistics
 */
router.get('/stats/overview', authenticateToken, requireRole(['admin', 'developer']), async (req, res) => {
  try {
    const statistics = errorTracker.getErrorStatistics();
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    logger.error('Failed to get error statistics', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error statistics'
    });
  }
});

/**
 * Get error analysis
 */
router.get('/analysis/current', authenticateToken, requireRole(['admin', 'developer']), async (req, res) => {
  try {
    const analysis = errorTracker.getErrorAnalysis();
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    logger.error('Failed to get error analysis', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error analysis'
    });
  }
});

/**
 * Generate error report
 */
router.get('/reports/:timeRange', authenticateToken, requireRole(['admin', 'developer']), async (req, res) => {
  try {
    const { timeRange } = req.params;
    const validRanges = ['1h', '6h', '24h', '7d'];
    
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time range. Valid options: ' + validRanges.join(', ')
      });
    }
    
    const report = errorTracker.generateErrorReport(timeRange);
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Failed to generate error report', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate error report'
    });
  }
});

/**
 * Search errors
 */
router.post('/search', authenticateToken, requireRole(['admin', 'developer']), async (req, res) => {
  try {
    const { 
      query, 
      severity, 
      category, 
      timeRange = '24h',
      limit = 100 
    } = req.body;
    
    const recentErrors = errorTracker.getRecentErrors(1000); // Get more for filtering
    
    let filteredErrors = recentErrors;
    
    // Apply filters
    if (query) {
      const searchTerm = query.toLowerCase();
      filteredErrors = filteredErrors.filter(error => 
        error.message.toLowerCase().includes(searchTerm) ||
        error.type.toLowerCase().includes(searchTerm) ||
        (error.path && error.path.toLowerCase().includes(searchTerm))
      );
    }
    
    if (severity) {
      filteredErrors = filteredErrors.filter(error => error.severity === severity);
    }
    
    if (category) {
      filteredErrors = filteredErrors.filter(error => error.category === category);
    }
    
    // Apply time range filter
    const now = Date.now();
    let cutoffTime;
    switch (timeRange) {
      case '1h':
        cutoffTime = now - 60 * 60 * 1000;
        break;
      case '6h':
        cutoffTime = now - 6 * 60 * 60 * 1000;
        break;
      case '24h':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      case '7d':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        cutoffTime = now - 24 * 60 * 60 * 1000;
    }
    
    filteredErrors = filteredErrors.filter(error => 
      new Date(error.timestamp).getTime() > cutoffTime
    );
    
    // Apply limit
    filteredErrors = filteredErrors.slice(0, limit);
    
    res.json({
      success: true,
      data: {
        errors: filteredErrors,
        total: filteredErrors.length,
        filters: { query, severity, category, timeRange, limit }
      }
    });
  } catch (error) {
    logger.error('Failed to search errors', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to search errors'
    });
  }
});

/**
 * Get error dashboard data
 */
router.get('/dashboard/data', authenticateToken, requireRole(['admin', 'developer']), async (req, res) => {
  try {
    const timeRange = req.query.timeRange || '24h';
    
    const [statistics, analysis, report] = await Promise.all([
      errorTracker.getErrorStatistics(),
      errorTracker.getErrorAnalysis(),
      errorTracker.generateErrorReport(timeRange)
    ]);
    
    const dashboardData = {
      statistics,
      analysis,
      report,
      recentErrors: errorTracker.getRecentErrors(10),
      timeRange
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    logger.error('Failed to get error dashboard data', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error dashboard data'
    });
  }
});

/**
 * Test error tracking (development only)
 */
router.post('/test', authenticateToken, requireRole(['admin']), async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test endpoints not available in production'
    });
  }
  
  try {
    const { errorType = 'TestError', message = 'Test error message' } = req.body;
    
    // Create a test error
    const testError = new Error(message);
    testError.name = errorType;
    
    const context = {
      method: 'POST',
      path: '/api/errors/test',
      statusCode: 500,
      userId: req.user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { test: true }
    };
    
    const errorId = errorTracker.trackError(testError, context);
    
    res.json({
      success: true,
      data: {
        message: 'Test error tracked successfully',
        errorId,
        error: errorTracker.getError(errorId)
      }
    });
  } catch (error) {
    logger.error('Failed to create test error', {
      type: 'error_tracker_api',
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to create test error'
    });
  }
});

export default router;