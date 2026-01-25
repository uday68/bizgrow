import express from 'express';
import databaseMonitor from '../services/databaseMonitor.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * Get current health status
 * GET /api/database-health/status
 * Requires: developer role
 */
router.get('/status', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const healthStatus = databaseMonitor.getHealthStatus();
    
    res.json({
      success: true,
      health: healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get health status', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get health status',
      message: error.message
    });
  }
});

/**
 * Perform health check
 * POST /api/database-health/check
 * Requires: developer role
 */
router.post('/check', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const healthStatus = await databaseMonitor.performHealthCheck();
    
    logger.info('Health check performed', {
      isHealthy: healthStatus.isHealthy,
      issuesCount: healthStatus.issues.length,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      health: healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * Get integrity status
 * GET /api/database-health/integrity
 * Requires: developer role
 */
router.get('/integrity', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const integrityStatus = await databaseMonitor.getIntegrityStatus();
    
    res.json({
      success: true,
      integrity: integrityStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get integrity status', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get integrity status',
      message: error.message
    });
  }
});

/**
 * Check data integrity
 * POST /api/database-health/integrity/check
 * Requires: developer role
 */
router.post('/integrity/check', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const integrityStatus = await databaseMonitor.checkDataIntegrity();
    
    logger.info('Integrity check performed', {
      isHealthy: integrityStatus.isHealthy,
      issuesCount: integrityStatus.issues.length,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      integrity: integrityStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Integrity check failed', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Integrity check failed',
      message: error.message
    });
  }
});

/**
 * Attempt connection recovery
 * POST /api/database-health/recover
 * Requires: admin role
 */
router.post('/recover', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await databaseMonitor.attemptConnectionRecovery();
    
    logger.info('Connection recovery attempted', {
      success: result.success,
      message: result.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    
    res.json({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Connection recovery failed', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Connection recovery failed',
      message: error.message
    });
  }
});

/**
 * Perform database maintenance
 * POST /api/database-health/maintenance
 * Requires: admin role
 */
router.post('/maintenance', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await databaseMonitor.performMaintenance();
    
    logger.info('Database maintenance performed', {
      success: result.success,
      resultsCount: result.results.length,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      maintenance: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Database maintenance failed', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Database maintenance failed',
      message: error.message
    });
  }
});

/**
 * Get comprehensive health report
 * GET /api/database-health/report
 * Requires: developer role
 */
router.get('/report', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const performanceReport = databaseMonitor.generatePerformanceReport();
    const integrityStatus = await databaseMonitor.getIntegrityStatus();
    
    const report = {
      ...performanceReport,
      integrity: integrityStatus,
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to generate health report', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate health report',
      message: error.message
    });
  }
});

/**
 * Start monitoring
 * POST /api/database-health/monitoring/start
 * Requires: admin role
 */
router.post('/monitoring/start', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    databaseMonitor.startMonitoring();
    
    logger.info('Database monitoring started', {
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      message: 'Database monitoring started',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to start monitoring', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start monitoring',
      message: error.message
    });
  }
});

/**
 * Stop monitoring
 * POST /api/database-health/monitoring/stop
 * Requires: admin role
 */
router.post('/monitoring/stop', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    databaseMonitor.stopMonitoring();
    
    logger.info('Database monitoring stopped', {
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      message: 'Database monitoring stopped',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to stop monitoring', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to stop monitoring',
      message: error.message
    });
  }
});

export default router;
