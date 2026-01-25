import express from 'express';
import agentOrchestrator from '../services/agentOrchestrator.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * Submit a task to the orchestrator
 * POST /api/orchestrator/tasks
 * Requires: developer role
 */
router.post('/tasks', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { agentName, taskType, taskData, priority } = req.body;

    if (!agentName || !taskType || !taskData) {
      return res.status(400).json({
        success: false,
        error: 'Agent name, task type, and task data are required'
      });
    }

    const taskId = await agentOrchestrator.submitTask(agentName, taskType, taskData, priority);

    res.json({
      success: true,
      taskId,
      message: 'Task submitted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to submit task', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to submit task',
      message: error.message
    });
  }
});

/**
 * Get task status
 * GET /api/orchestrator/tasks/:taskId
 * Requires: developer role
 */
router.get('/tasks/:taskId', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const { taskId } = req.params;
    const task = agentOrchestrator.getTaskStatus(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    res.json({
      success: true,
      task,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get task status', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      taskId: req.params.taskId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get task status',
      message: error.message
    });
  }
});

/**
 * Cancel a task
 * DELETE /api/orchestrator/tasks/:taskId
 * Requires: developer role
 */
router.delete('/tasks/:taskId', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const { taskId } = req.params;
    const cancelled = agentOrchestrator.cancelTask(taskId);

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: 'Task not found or cannot be cancelled'
      });
    }

    logger.info('Task cancelled', {
      type: 'orchestrator',
      taskId,
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Task cancelled successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to cancel task', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      taskId: req.params.taskId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to cancel task',
      message: error.message
    });
  }
});

/**
 * Get queue status
 * GET /api/orchestrator/queue
 * Requires: developer role
 */
router.get('/queue', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const queueStatus = agentOrchestrator.getQueueStatus();

    res.json({
      success: true,
      queue: queueStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get queue status', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get queue status',
      message: error.message
    });
  }
});

/**
 * Get agent status
 * GET /api/orchestrator/agents/:agentName
 * Requires: developer role
 */
router.get('/agents/:agentName', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const { agentName } = req.params;
    const agentStatus = agentOrchestrator.getAgentStatus(agentName);

    if (!agentStatus) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    res.json({
      success: true,
      agent: agentStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get agent status', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      agentName: req.params.agentName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get agent status',
      message: error.message
    });
  }
});

/**
 * Get all agents status
 * GET /api/orchestrator/agents
 * Requires: developer role
 */
router.get('/agents', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const agentsStatus = agentOrchestrator.getAllAgentsStatus();

    res.json({
      success: true,
      agents: agentsStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get agents status', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get agents status',
      message: error.message
    });
  }
});

/**
 * Get orchestrator metrics
 * GET /api/orchestrator/metrics
 * Requires: developer role
 */
router.get('/metrics', authenticateToken, requireRole('developer'), (req, res) => {
  try {
    const metrics = agentOrchestrator.getMetrics();

    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get orchestrator metrics', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get orchestrator metrics',
      message: error.message
    });
  }
});

/**
 * Update resource limits
 * PUT /api/orchestrator/resource-limits
 * Requires: admin role
 */
router.put('/resource-limits', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const limits = req.body;

    agentOrchestrator.setResourceLimits(limits);

    logger.info('Resource limits updated', {
      type: 'orchestrator',
      limits,
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Resource limits updated successfully',
      limits: agentOrchestrator.getMetrics().resourceLimits,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to update resource limits', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update resource limits',
      message: error.message
    });
  }
});

/**
 * Set agent health status
 * PUT /api/orchestrator/agents/:agentName/health
 * Requires: admin role
 */
router.put('/agents/:agentName/health', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { agentName } = req.params;
    const { health } = req.body;

    if (!health) {
      return res.status(400).json({
        success: false,
        error: 'Health status is required'
      });
    }

    const updated = agentOrchestrator.setAgentHealth(agentName, health);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    logger.info('Agent health updated', {
      type: 'orchestrator',
      agentName,
      health,
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Agent health updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to update agent health', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      agentName: req.params.agentName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update agent health',
      message: error.message
    });
  }
});

/**
 * Start processing
 * POST /api/orchestrator/processing/start
 * Requires: admin role
 */
router.post('/processing/start', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    agentOrchestrator.startProcessing();

    logger.info('Orchestrator processing started', {
      type: 'orchestrator',
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Processing started successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to start processing', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start processing',
      message: error.message
    });
  }
});

/**
 * Stop processing
 * POST /api/orchestrator/processing/stop
 * Requires: admin role
 */
router.post('/processing/stop', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    agentOrchestrator.stopProcessing();

    logger.info('Orchestrator processing stopped', {
      type: 'orchestrator',
      correlationId: req.correlationId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Processing stopped successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to stop processing', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to stop processing',
      message: error.message
    });
  }
});

export default router;
