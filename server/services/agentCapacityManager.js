import logger from './logger.js';
import cacheService from './cacheService.js';
import { getDatabase, getDatabaseType } from '../database/init.js';

/**
 * Agent Capacity Manager
 * Manages agent capacity, request queuing, dynamic resource allocation,
 * performance tracking, and scaling strategies
 */
class AgentCapacityManager {
  constructor() {
    this.agents = new Map();
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.queueProcessingInterval = null;
    
    // Capacity configuration
    this.capacityConfig = {
      defaultCapacity: 10,
      maxQueueSize: 500,
      queueProcessingInterval: 1000, // 1 second
      autoScalingEnabled: true,
      scaleUpThreshold: 0.8, // 80% capacity
      scaleDownThreshold: 0.3, // 30% capacity
      minCapacity: 5,
      maxCapacity: 50
    };

    // Performance tracking
    this.performanceMetrics = new Map();
    this.loadHistory = new Map();
    
    // Resource allocation
    this.resourcePools = {
      cpu: { total: 100, allocated: 0 },
      memory: { total: 100, allocated: 0 },
      network: { total: 100, allocated: 0 }
    };
  }

  /**
   * Register agent with capacity manager
   */
  registerAgent(agentName, config = {}) {
    if (this.agents.has(agentName)) {
      logger.warn('Agent already registered with capacity manager', {
        type: 'capacity_manager',
        agentName
      });
      return false;
    }

    const agentCapacity = {
      name: agentName,
      capacity: config.capacity || this.capacityConfig.defaultCapacity,
      currentLoad: 0,
      activeRequests: 0,
      queuedRequests: 0,
      totalProcessed: 0,
      totalRejected: 0,
      resourceAllocation: {
        cpu: config.cpu || 10,
        memory: config.memory || 10,
        network: config.network || 10
      },
      scalingConfig: {
        enabled: config.autoScaling !== false,
        minCapacity: config.minCapacity || this.capacityConfig.minCapacity,
        maxCapacity: config.maxCapacity || this.capacityConfig.maxCapacity
      },
      status: 'active',
      lastScaling: null
    };

    this.agents.set(agentName, agentCapacity);
    this.performanceMetrics.set(agentName, []);
    this.loadHistory.set(agentName, []);

    // Allocate resources
    this.allocateResources(agentName, agentCapacity.resourceAllocation);

    logger.info('Agent registered with capacity manager', {
      type: 'capacity_manager',
      agentName,
      capacity: agentCapacity.capacity
    });

    return true;
  }

  /**
   * Unregister agent
   */
  unregisterAgent(agentName) {
    if (!this.agents.has(agentName)) {
      return false;
    }

    const agent = this.agents.get(agentName);
    
    // Release resources
    this.releaseResources(agentName, agent.resourceAllocation);

    this.agents.delete(agentName);
    this.performanceMetrics.delete(agentName);
    this.loadHistory.delete(agentName);

    logger.info('Agent unregistered from capacity manager', {
      type: 'capacity_manager',
      agentName
    });

    return true;
  }

  /**
   * Check if agent can handle request
   */
  canHandleRequest(agentName) {
    if (!this.agents.has(agentName)) {
      return false;
    }

    const agent = this.agents.get(agentName);
    return agent.activeRequests < agent.capacity && agent.status === 'active';
  }

  /**
   * Request agent capacity
   */
  async requestCapacity(agentName, requestData, priority = 'normal') {
    try {
      if (!this.agents.has(agentName)) {
        throw new Error(`Agent ${agentName} not registered`);
      }

      const agent = this.agents.get(agentName);

      // Check if agent can handle request immediately
      if (this.canHandleRequest(agentName)) {
        return await this.allocateCapacity(agentName, requestData);
      }

      // Queue request if capacity exceeded
      if (this.requestQueue.length >= this.capacityConfig.maxQueueSize) {
        agent.totalRejected++;
        throw new Error('Request queue is full');
      }

      const queuedRequest = {
        id: this.generateRequestId(),
        agentName,
        requestData,
        priority: this.getPriorityValue(priority),
        queuedAt: new Date().toISOString(),
        status: 'queued'
      };

      this.requestQueue.push(queuedRequest);
      agent.queuedRequests++;

      // Sort queue by priority
      this.sortRequestQueue();

      logger.info('Request queued due to capacity limit', {
        type: 'capacity_manager',
        agentName,
        requestId: queuedRequest.id,
        queueLength: this.requestQueue.length
      });

      // Start queue processing if not already running
      if (!this.isProcessingQueue) {
        this.startQueueProcessing();
      }

      return {
        status: 'queued',
        requestId: queuedRequest.id,
        queuePosition: this.requestQueue.findIndex(r => r.id === queuedRequest.id) + 1,
        estimatedWaitTime: this.estimateWaitTime(agentName)
      };
    } catch (error) {
      logger.error('Failed to request capacity', {
        type: 'capacity_manager',
        error: error.message,
        agentName
      });
      throw error;
    }
  }

  /**
   * Allocate capacity to request
   */
  async allocateCapacity(agentName, requestData) {
    const agent = this.agents.get(agentName);
    const requestId = this.generateRequestId();

    agent.activeRequests++;
    agent.currentLoad = agent.activeRequests / agent.capacity;

    // Record load
    this.recordLoad(agentName, agent.currentLoad);

    logger.info('Capacity allocated', {
      type: 'capacity_manager',
      agentName,
      requestId,
      currentLoad: agent.currentLoad,
      activeRequests: agent.activeRequests
    });

    // Check if scaling is needed
    if (this.capacityConfig.autoScalingEnabled) {
      await this.checkScaling(agentName);
    }

    return {
      status: 'allocated',
      requestId,
      agentName
    };
  }

  /**
   * Release capacity after request completion
   */
  async releaseCapacity(agentName, requestId, success = true, metrics = {}) {
    if (!this.agents.has(agentName)) {
      return false;
    }

    const agent = this.agents.get(agentName);

    if (agent.activeRequests > 0) {
      agent.activeRequests--;
      agent.currentLoad = agent.activeRequests / agent.capacity;
    }

    if (success) {
      agent.totalProcessed++;
    }

    // Record performance metrics
    this.recordPerformance(agentName, {
      requestId,
      success,
      responseTime: metrics.responseTime || 0,
      timestamp: new Date().toISOString()
    });

    // Record load
    this.recordLoad(agentName, agent.currentLoad);

    logger.info('Capacity released', {
      type: 'capacity_manager',
      agentName,
      requestId,
      currentLoad: agent.currentLoad,
      activeRequests: agent.activeRequests
    });

    // Check if scaling is needed
    if (this.capacityConfig.autoScalingEnabled) {
      await this.checkScaling(agentName);
    }

    return true;
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get numeric priority value
   */
  getPriorityValue(priority) {
    const priorities = {
      low: 1,
      normal: 2,
      high: 3,
      critical: 4
    };
    return priorities[priority] || 2;
  }

  /**
   * Sort request queue by priority
   */
  sortRequestQueue() {
    this.requestQueue.sort((a, b) => {
      // First by priority (higher first)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Then by queue time (earlier first)
      return new Date(a.queuedAt) - new Date(b.queuedAt);
    });
  }

  /**
   * Start processing request queue
   */
  startQueueProcessing() {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    this.queueProcessingInterval = setInterval(async () => {
      await this.processRequestQueue();
    }, this.capacityConfig.queueProcessingInterval);

    logger.info('Request queue processing started', {
      type: 'capacity_manager'
    });
  }

  /**
   * Stop processing request queue
   */
  stopQueueProcessing() {
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval);
      this.queueProcessingInterval = null;
    }

    this.isProcessingQueue = false;

    logger.info('Request queue processing stopped', {
      type: 'capacity_manager'
    });
  }

  /**
   * Process request queue
   */
  async processRequestQueue() {
    try {
      // Stop if queue is empty
      if (this.requestQueue.length === 0) {
        this.stopQueueProcessing();
        return;
      }

      // Process requests that can be handled
      for (let i = this.requestQueue.length - 1; i >= 0; i--) {
        const request = this.requestQueue[i];
        
        if (this.canHandleRequest(request.agentName)) {
          // Remove from queue
          this.requestQueue.splice(i, 1);
          
          const agent = this.agents.get(request.agentName);
          if (agent.queuedRequests > 0) {
            agent.queuedRequests--;
          }

          // Allocate capacity
          await this.allocateCapacity(request.agentName, request.requestData);

          logger.info('Queued request processed', {
            type: 'capacity_manager',
            requestId: request.id,
            agentName: request.agentName,
            queueTime: Date.now() - new Date(request.queuedAt).getTime()
          });
        }
      }
    } catch (error) {
      logger.error('Error processing request queue', {
        type: 'capacity_manager',
        error: error.message
      });
    }
  }

  /**
   * Estimate wait time for queued request
   */
  estimateWaitTime(agentName) {
    if (!this.agents.has(agentName)) {
      return 0;
    }

    const agent = this.agents.get(agentName);
    const metrics = this.performanceMetrics.get(agentName) || [];

    // Calculate average processing time from recent metrics
    const recentMetrics = metrics.slice(-100);
    if (recentMetrics.length === 0) {
      return 5000; // Default 5 seconds
    }

    const avgProcessingTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
    
    // Estimate based on queue position and capacity
    const queuedForAgent = this.requestQueue.filter(r => r.agentName === agentName).length;
    const availableCapacity = agent.capacity - agent.activeRequests;
    
    if (availableCapacity <= 0) {
      return avgProcessingTime * Math.ceil(queuedForAgent / agent.capacity);
    }

    return avgProcessingTime * Math.ceil(queuedForAgent / availableCapacity);
  }

  /**
   * Record performance metric
   */
  recordPerformance(agentName, metric) {
    if (!this.performanceMetrics.has(agentName)) {
      this.performanceMetrics.set(agentName, []);
    }

    const metrics = this.performanceMetrics.get(agentName);
    metrics.push(metric);

    // Keep only last 1000 metrics
    if (metrics.length > 1000) {
      this.performanceMetrics.set(agentName, metrics.slice(-1000));
    }
  }

  /**
   * Record load metric
   */
  recordLoad(agentName, load) {
    if (!this.loadHistory.has(agentName)) {
      this.loadHistory.set(agentName, []);
    }

    const history = this.loadHistory.get(agentName);
    history.push({
      load,
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 entries
    if (history.length > 1000) {
      this.loadHistory.set(agentName, history.slice(-1000));
    }
  }

  /**
   * Check if scaling is needed
   */
  async checkScaling(agentName) {
    if (!this.agents.has(agentName)) {
      return;
    }

    const agent = this.agents.get(agentName);

    if (!agent.scalingConfig.enabled) {
      return;
    }

    // Check if we should scale up
    if (agent.currentLoad >= this.capacityConfig.scaleUpThreshold) {
      await this.scaleUp(agentName);
    }
    // Check if we should scale down
    else if (agent.currentLoad <= this.capacityConfig.scaleDownThreshold) {
      await this.scaleDown(agentName);
    }
  }

  /**
   * Scale up agent capacity
   */
  async scaleUp(agentName) {
    const agent = this.agents.get(agentName);

    // Check if we can scale up
    if (agent.capacity >= agent.scalingConfig.maxCapacity) {
      logger.info('Agent already at maximum capacity', {
        type: 'capacity_manager',
        agentName,
        currentCapacity: agent.capacity
      });
      return false;
    }

    // Calculate new capacity (increase by 50%)
    const newCapacity = Math.min(
      Math.ceil(agent.capacity * 1.5),
      agent.scalingConfig.maxCapacity
    );

    const oldCapacity = agent.capacity;
    agent.capacity = newCapacity;
    agent.currentLoad = agent.activeRequests / agent.capacity;
    agent.lastScaling = new Date().toISOString();

    logger.info('Agent scaled up', {
      type: 'capacity_manager',
      agentName,
      oldCapacity,
      newCapacity,
      currentLoad: agent.currentLoad
    });

    // Store scaling event
    await this.storeScalingEvent(agentName, 'scale_up', oldCapacity, newCapacity);

    return true;
  }

  /**
   * Scale down agent capacity
   */
  async scaleDown(agentName) {
    const agent = this.agents.get(agentName);

    // Check if we can scale down
    if (agent.capacity <= agent.scalingConfig.minCapacity) {
      return false;
    }

    // Don't scale down if there are active requests
    if (agent.activeRequests > agent.scalingConfig.minCapacity) {
      return false;
    }

    // Calculate new capacity (decrease by 25%)
    const newCapacity = Math.max(
      Math.floor(agent.capacity * 0.75),
      agent.scalingConfig.minCapacity
    );

    const oldCapacity = agent.capacity;
    agent.capacity = newCapacity;
    agent.currentLoad = agent.activeRequests / agent.capacity;
    agent.lastScaling = new Date().toISOString();

    logger.info('Agent scaled down', {
      type: 'capacity_manager',
      agentName,
      oldCapacity,
      newCapacity,
      currentLoad: agent.currentLoad
    });

    // Store scaling event
    await this.storeScalingEvent(agentName, 'scale_down', oldCapacity, newCapacity);

    return true;
  }

  /**
   * Allocate resources to agent
   */
  allocateResources(agentName, resources) {
    for (const [resource, amount] of Object.entries(resources)) {
      if (this.resourcePools[resource]) {
        const available = this.resourcePools[resource].total - this.resourcePools[resource].allocated;
        
        if (available >= amount) {
          this.resourcePools[resource].allocated += amount;
          
          logger.info('Resources allocated', {
            type: 'capacity_manager',
            agentName,
            resource,
            amount,
            remaining: this.resourcePools[resource].total - this.resourcePools[resource].allocated
          });
        } else {
          logger.warn('Insufficient resources', {
            type: 'capacity_manager',
            agentName,
            resource,
            requested: amount,
            available
          });
        }
      }
    }
  }

  /**
   * Release resources from agent
   */
  releaseResources(agentName, resources) {
    for (const [resource, amount] of Object.entries(resources)) {
      if (this.resourcePools[resource]) {
        this.resourcePools[resource].allocated = Math.max(
          0,
          this.resourcePools[resource].allocated - amount
        );
        
        logger.info('Resources released', {
          type: 'capacity_manager',
          agentName,
          resource,
          amount,
          remaining: this.resourcePools[resource].total - this.resourcePools[resource].allocated
        });
      }
    }
  }

  /**
   * Get agent capacity status
   */
  getAgentCapacity(agentName) {
    if (!this.agents.has(agentName)) {
      return null;
    }

    const agent = this.agents.get(agentName);
    const metrics = this.performanceMetrics.get(agentName) || [];
    const loadHistory = this.loadHistory.get(agentName) || [];

    // Calculate recent metrics
    const recentMetrics = metrics.slice(-100);
    const avgResponseTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length
      : 0;

    const successRate = recentMetrics.length > 0
      ? (recentMetrics.filter(m => m.success).length / recentMetrics.length) * 100
      : 100;

    // Calculate average load
    const recentLoad = loadHistory.slice(-100);
    const avgLoad = recentLoad.length > 0
      ? recentLoad.reduce((sum, l) => sum + l.load, 0) / recentLoad.length
      : 0;

    return {
      agentName,
      capacity: agent.capacity,
      currentLoad: agent.currentLoad,
      averageLoad: avgLoad,
      activeRequests: agent.activeRequests,
      queuedRequests: agent.queuedRequests,
      totalProcessed: agent.totalProcessed,
      totalRejected: agent.totalRejected,
      resourceAllocation: agent.resourceAllocation,
      scalingConfig: agent.scalingConfig,
      status: agent.status,
      lastScaling: agent.lastScaling,
      performance: {
        averageResponseTime: avgResponseTime,
        successRate: successRate
      }
    };
  }

  /**
   * Get all agents capacity
   */
  getAllAgentsCapacity() {
    const capacities = {};
    
    for (const [agentName] of this.agents) {
      capacities[agentName] = this.getAgentCapacity(agentName);
    }

    return capacities;
  }

  /**
   * Get capacity manager metrics
   */
  getMetrics() {
    return {
      totalAgents: this.agents.size,
      queueLength: this.requestQueue.length,
      isProcessingQueue: this.isProcessingQueue,
      resourcePools: this.resourcePools,
      capacityConfig: this.capacityConfig,
      agents: this.getAllAgentsCapacity()
    };
  }

  /**
   * Update capacity configuration
   */
  updateConfig(config) {
    this.capacityConfig = {
      ...this.capacityConfig,
      ...config
    };

    logger.info('Capacity configuration updated', {
      type: 'capacity_manager',
      config: this.capacityConfig
    });
  }

  /**
   * Set agent capacity
   */
  setAgentCapacity(agentName, capacity) {
    if (!this.agents.has(agentName)) {
      return false;
    }

    const agent = this.agents.get(agentName);
    const oldCapacity = agent.capacity;
    agent.capacity = capacity;
    agent.currentLoad = agent.activeRequests / agent.capacity;

    logger.info('Agent capacity updated', {
      type: 'capacity_manager',
      agentName,
      oldCapacity,
      newCapacity: capacity
    });

    return true;
  }

  /**
   * Store scaling event in database
   */
  async storeScalingEvent(agentName, eventType, oldCapacity, newCapacity) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      const eventData = {
        agentName,
        eventType,
        oldCapacity,
        newCapacity,
        reason: eventType === 'scale_up' ? 'High load detected' : 'Low load detected'
      };

      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO resource_allocation_log (agent_name, event_type, event_data, created_at)
          VALUES ($1, $2, $3, NOW())
        `, [agentName, eventType, JSON.stringify(eventData)]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO resource_allocation_log (agent_name, event_type, event_data, created_at)
            VALUES (?, ?, ?, datetime('now'))
          `, [agentName, eventType, JSON.stringify(eventData)], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      logger.error('Failed to store scaling event', {
        type: 'capacity_manager',
        error: error.message,
        agentName
      });
    }
  }

  /**
   * Get scaling history
   */
  async getScalingHistory(agentName, limit = 100) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      let query, params;
      
      if (dbType === 'postgres') {
        query = `
          SELECT * FROM resource_allocation_log
          WHERE agent_name = $1
          ORDER BY created_at DESC
          LIMIT $2
        `;
        params = [agentName, limit];
      } else {
        query = `
          SELECT * FROM resource_allocation_log
          WHERE agent_name = ?
          ORDER BY created_at DESC
          LIMIT ?
        `;
        params = [agentName, limit];
      }

      const result = dbType === 'postgres'
        ? await db.query(query, params)
        : await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
              if (err) reject(err);
              else resolve({ rows });
            });
          });

      return result.rows.map(row => ({
        ...row,
        eventData: JSON.parse(row.event_data)
      }));
    } catch (error) {
      logger.error('Failed to get scaling history', {
        type: 'capacity_manager',
        error: error.message,
        agentName
      });
      return [];
    }
  }
}

// Singleton instance
const agentCapacityManager = new AgentCapacityManager();

export default agentCapacityManager;
