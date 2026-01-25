import express from 'express';
import agentHealthMonitor from '../services/agentHealthMonitor.js';
import agentErrorHandler from '../services/agentErrorHandler.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * Get agent health status
 * GET /api/agent-health/:agentName
 * Requires: developer role
 */
router.get('/:agentName', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const { agentName } = req.params;
    const health = agentHealthMonitor.getAgentHealth(agentName);

    if (!health) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get agent health', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      agentName: req.params.agentName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get agent health',
      message: error.message
    });
  }
});

/**
 * Get all agents health
 * GET /api/agent-health
 * Requires: developer role
 */
router.get('/', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const health = agentHealthMonitor.getAllAgentsHealth();

    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get all agents health', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get all agents health',
      message: error.message
    });
  }
});

/**
 * Check agent health
 * POST /api/agent-health/:agentName/check
 * Requires: developer role
 */
router.post('/:agentName/check', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { agentName } = req.params;
    const healthCheck = await agentHealthMonitor.checkAgentHealth(agentName);

    if (!healthCheck) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    res.json({
      success: true,
      healthCheck,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to check agent health', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      agentName: req.params.agentName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to check agent health',
      message: error.message
    });
  }
});

/**
 * Restart agent
 * POST /api/agent-health/:agentName/restart
 * Requires: admin role
 */
router.post('/:agentName/restart', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { agentName } = req.params;
    const result = await agentHealthMonitor.attemptAgentRestart(agentName);

    logger.info('Agent restart attempted', {
      type: 'agent_health',
      agentName,
      success: result.success,
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to restart agent', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      agentName: req.params.agentName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to restart agent',
      message: error.message
    });
  }
});

/**
 * Optimize agent performance
 * POST /api/agent-health/:agentName/optimize
 * Requires: admin role
 */
router.post('/:agentName/optimize', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { agentName } = req.params;
    const optimization = await agentHealthMonitor.optimizeAgentPerformance(agentName);

    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    res.json({
      success: true,
      optimization,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to optimize agent performance', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      agentName: req.params.agentName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to optimize agent performance',
      message: error.message
    });
  }
});

/**
 * Get agent health history
 * GET /api/agent-health/:agentName/history
 * Requires: developer role
 */
router.get('/:agentName/history', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { agentName } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const history = await agentHealthMonitor.getHealthHistory(agentName, limit);

    res.json({
      success: true,
      history,
      count: history.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get agent health history', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      agentName: req.params.agentName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get agent health history',
      message: error.message
    });
  }
});

/**
 * Update health thresholds
 * PUT /api/agent-health/thresholds
 * Requires: admin role
 */
router.put('/thresholds', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const thresholds = req.body;

    agentHealthMonitor.setHealthThresholds(thresholds);

    logger.info('Health thresholds updated', {
      type: 'agent_health',
      thresholds,
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Health thresholds updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to update health thresholds', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update health thresholds',
      message: error.message
    });
  }
});

/**
 * Get monitoring status
 * GET /api/agent-health/monitoring/status
 * Requires: developer role
 */
router.get('/monitoring/status', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const status = agentHealthMonitor.getMonitoringStatus();

    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get monitoring status', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring status',
      message: error.message
    });
  }
});

/**
 * Start monitoring
 * POST /api/agent-health/monitoring/start
 * Requires: admin role
 */
router.post('/monitoring/start', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    agentHealthMonitor.startMonitoring();

    logger.info('Agent health monitoring started', {
      type: 'agent_health',
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Monitoring started successfully',
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
 * POST /api/agent-health/monitoring/stop
 * Requires: admin role
 */
router.post('/monitoring/stop', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    agentHealthMonitor.stopMonitoring();

    logger.info('Agent health monitoring stopped', {
      type: 'agent_health',
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Monitoring stopped successfully',
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

/**
 * Get retry configuration
 * GET /api/agent-health/retry-config
 * Requires: developer role
 */
router.get('/retry-config', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const config = agentErrorHandler.getRetryConfig();

    res.json({
      success: true,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get retry configuration', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get retry configuration',
      message: error.message
    });
  }
});

/**
 * Update retry configuration
 * PUT /api/agent-health/retry-config
 * Requires: admin role
 */
router.put('/retry-config', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const config = req.body;

    agentErrorHandler.setRetryConfig(config);

    logger.info('Retry configuration updated', {
      type: 'agent_error_handler',
      config,
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Retry configuration updated successfully',
      config: agentErrorHandler.getRetryConfig(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to update retry configuration', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update retry configuration',
      message: error.message
    });
  }
});

/**
 * Get circuit breaker status
 * GET /api/agent-health/circuit-breakers
 * Requires: developer role
 */
router.get('/circuit-breakers', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const status = agentErrorHandler.getCircuitBreakerStatus();

    res.json({
      success: true,
      circuitBreakers: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get circuit breaker status', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get circuit breaker status',
      message: error.message
    });
  }
});

/**
 * Reset circuit breaker
 * POST /api/agent-health/circuit-breakers/:circuitKey/reset
 * Requires: admin role
 */
router.post('/circuit-breakers/:circuitKey/reset', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { circuitKey } = req.params;

    agentErrorHandler.resetCircuitBreaker(circuitKey);

    logger.info('Circuit breaker reset', {
      type: 'agent_error_handler',
      circuitKey,
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Circuit breaker reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to reset circuit breaker', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      circuitKey: req.params.circuitKey
    });
    res.status(500).json({
      success: false,
      error: 'Failed to reset circuit breaker',
      message: error.message
    });
  }
});

export default router;
