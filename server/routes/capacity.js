import express from 'express';
import agentCapacityManager from '../services/agentCapacityManager.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * Get capacity manager metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = agentCapacityManager.getMetrics();
    
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    logger.error('Failed to get capacity metrics', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get agent capacity status
 */
router.get('/agent/:agentName', async (req, res) => {
  try {
    const { agentName } = req.params;
    const capacity = agentCapacityManager.getAgentCapacity(agentName);
    
    if (!capacity) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }
    
    res.json({
      success: true,
      capacity
    });
  } catch (error) {
    logger.error('Failed to get agent capacity', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all agents capacity
 */
router.get('/agents', async (req, res) => {
  try {
    const capacities = agentCapacityManager.getAllAgentsCapacity();
    
    res.json({
      success: true,
      capacities
    });
  } catch (error) {
    logger.error('Failed to get all agents capacity', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Register agent with capacity manager
 */
router.post('/agent/register', async (req, res) => {
  try {
    const { agentName, config } = req.body;
    
    if (!agentName) {
      return res.status(400).json({
        success: false,
        error: 'Agent name is required'
      });
    }
    
    const result = agentCapacityManager.registerAgent(agentName, config || {});
    
    res.json({
      success: result,
      message: result ? 'Agent registered successfully' : 'Agent already registered'
    });
  } catch (error) {
    logger.error('Failed to register agent', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Unregister agent from capacity manager
 */
router.post('/agent/unregister', async (req, res) => {
  try {
    const { agentName } = req.body;
    
    if (!agentName) {
      return res.status(400).json({
        success: false,
        error: 'Agent name is required'
      });
    }
    
    const result = agentCapacityManager.unregisterAgent(agentName);
    
    res.json({
      success: result,
      message: result ? 'Agent unregistered successfully' : 'Agent not found'
    });
  } catch (error) {
    logger.error('Failed to unregister agent', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Request agent capacity
 */
router.post('/request', async (req, res) => {
  try {
    const { agentName, requestData, priority } = req.body;
    
    if (!agentName || !requestData) {
      return res.status(400).json({
        success: false,
        error: 'Agent name and request data are required'
      });
    }
    
    const result = await agentCapacityManager.requestCapacity(
      agentName,
      requestData,
      priority || 'normal'
    );
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Failed to request capacity', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Release agent capacity
 */
router.post('/release', async (req, res) => {
  try {
    const { agentName, requestId, success, metrics } = req.body;
    
    if (!agentName || !requestId) {
      return res.status(400).json({
        success: false,
        error: 'Agent name and request ID are required'
      });
    }
    
    const result = await agentCapacityManager.releaseCapacity(
      agentName,
      requestId,
      success !== false,
      metrics || {}
    );
    
    res.json({
      success: result,
      message: result ? 'Capacity released successfully' : 'Failed to release capacity'
    });
  } catch (error) {
    logger.error('Failed to release capacity', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Set agent capacity
 */
router.post('/agent/:agentName/capacity', async (req, res) => {
  try {
    const { agentName } = req.params;
    const { capacity } = req.body;
    
    if (!capacity || capacity < 1) {
      return res.status(400).json({
        success: false,
        error: 'Valid capacity value is required'
      });
    }
    
    const result = agentCapacityManager.setAgentCapacity(agentName, capacity);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Agent capacity updated successfully'
    });
  } catch (error) {
    logger.error('Failed to set agent capacity', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Scale up agent capacity
 */
router.post('/agent/:agentName/scale-up', async (req, res) => {
  try {
    const { agentName } = req.params;
    const result = await agentCapacityManager.scaleUp(agentName);
    
    res.json({
      success: result,
      message: result ? 'Agent scaled up successfully' : 'Cannot scale up (at maximum capacity)'
    });
  } catch (error) {
    logger.error('Failed to scale up agent', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Scale down agent capacity
 */
router.post('/agent/:agentName/scale-down', async (req, res) => {
  try {
    const { agentName } = req.params;
    const result = await agentCapacityManager.scaleDown(agentName);
    
    res.json({
      success: result,
      message: result ? 'Agent scaled down successfully' : 'Cannot scale down (at minimum capacity or has active requests)'
    });
  } catch (error) {
    logger.error('Failed to scale down agent', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update capacity configuration
 */
router.post('/config', async (req, res) => {
  try {
    const config = req.body;
    agentCapacityManager.updateConfig(config);
    
    res.json({
      success: true,
      message: 'Capacity configuration updated successfully',
      config: agentCapacityManager.capacityConfig
    });
  } catch (error) {
    logger.error('Failed to update capacity config', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get scaling history for agent
 */
router.get('/agent/:agentName/scaling-history', async (req, res) => {
  try {
    const { agentName } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    
    const history = await agentCapacityManager.getScalingHistory(agentName, limit);
    
    res.json({
      success: true,
      history
    });
  } catch (error) {
    logger.error('Failed to get scaling history', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get request queue status
 */
router.get('/queue', async (req, res) => {
  try {
    const metrics = agentCapacityManager.getMetrics();
    
    res.json({
      success: true,
      queue: {
        length: metrics.queueLength,
        isProcessing: metrics.isProcessingQueue,
        maxSize: metrics.capacityConfig.maxQueueSize
      }
    });
  } catch (error) {
    logger.error('Failed to get queue status', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get resource pool status
 */
router.get('/resources', async (req, res) => {
  try {
    const metrics = agentCapacityManager.getMetrics();
    
    res.json({
      success: true,
      resources: metrics.resourcePools
    });
  } catch (error) {
    logger.error('Failed to get resource pool status', {
      type: 'capacity_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
