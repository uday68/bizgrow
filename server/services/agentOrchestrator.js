import logger from './logger.js';
import cacheService from './cacheService.js';
import { getDatabase, getDatabaseType } from '../database/init.js';

/**
 * AI Agent Orchestrator
 * Centralized management for all AI agents with lifecycle management,
 * task queuing, resource allocation, and conflict prevention
 */
class AgentOrchestrator {
  constructor() {
    this.agents = new Map();
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.resourceLimits = {
      maxConcurrentTasks: 5,
      maxTasksPerAgent: 2,
      maxQueueSize: 100
    };
    this.agentPriorities = {
      discovery: 1,
      proposal: 2,
      builder: 3
    };
    this.isProcessing = false;
    this.processingInterval = null;
    this.metrics = {
      totalTasksProcessed: 0,
      totalTasksFailed: 0,
      totalTasksQueued: 0,
      averageProcessingTime: 0,
      agentUtilization: {}
    };
  }

  /**
   * Register an agent with the orchestrator
   */
  registerAgent(agentName, agentInstance) {
    if (this.agents.has(agentName)) {
      logger.warn('Agent already registered', {
        type: 'orchestrator',
        agentName
      });
      return false;
    }

    this.agents.set(agentName, {
      instance: agentInstance,
      status: 'idle',
      currentTasks: [],
      totalTasksProcessed: 0,
      totalTasksFailed: 0,
      lastActivity: null,
      health: 'healthy'
    });

    this.metrics.agentUtilization[agentName] = {
      tasksProcessed: 0,
      tasksFailed: 0,
      averageTaskTime: 0,
      utilizationRate: 0
    };

    logger.info('Agent registered', {
      type: 'orchestrator',
      agentName
    });

    return true;
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentName) {
    if (!this.agents.has(agentName)) {
      return false;
    }

    const agent = this.agents.get(agentName);
    
    // Cancel active tasks for this agent
    for (const taskId of agent.currentTasks) {
      this.cancelTask(taskId);
    }

    this.agents.delete(agentName);

    logger.info('Agent unregistered', {
      type: 'orchestrator',
      agentName
    });

    return true;
  }

  /**
   * Submit a task to the orchestrator
   */
  async submitTask(agentName, taskType, taskData, priority = 'normal') {
    try {
      // Validate agent exists
      if (!this.agents.has(agentName)) {
        throw new Error(`Agent ${agentName} not registered`);
      }

      // Check queue size limit
      if (this.taskQueue.length >= this.resourceLimits.maxQueueSize) {
        throw new Error('Task queue is full');
      }

      const taskId = this.generateTaskId();
      const task = {
        id: taskId,
        agentName,
        taskType,
        taskData,
        priority: this.getPriorityValue(priority),
        status: 'queued',
        submittedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        result: null,
        error: null,
        retryCount: 0,
        maxRetries: 3
      };

      this.taskQueue.push(task);
      this.metrics.totalTasksQueued++;

      // Sort queue by priority
      this.sortTaskQueue();

      logger.info('Task submitted', {
        type: 'orchestrator',
        taskId,
        agentName,
        taskType,
        priority,
        queueLength: this.taskQueue.length
      });

      // Start processing if not already running
      if (!this.isProcessing) {
        this.startProcessing();
      }

      return taskId;
    } catch (error) {
      logger.error('Failed to submit task', {
        type: 'orchestrator',
        error: error.message,
        agentName,
        taskType
      });
      throw error;
    }
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
   * Sort task queue by priority
   */
  sortTaskQueue() {
    this.taskQueue.sort((a, b) => {
      // First by priority (higher first)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Then by agent priority
      const agentPriorityA = this.agentPriorities[a.agentName] || 999;
      const agentPriorityB = this.agentPriorities[b.agentName] || 999;
      if (agentPriorityA !== agentPriorityB) {
        return agentPriorityA - agentPriorityB;
      }
      // Finally by submission time (earlier first)
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    });
  }

  /**
   * Start processing task queue
   */
  startProcessing() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Process queue every 2 seconds
    this.processingInterval = setInterval(async () => {
      await this.processQueue();
    }, 2000);

    logger.info('Task processing started', {
      type: 'orchestrator'
    });
  }

  /**
   * Stop processing task queue
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    this.isProcessing = false;

    logger.info('Task processing stopped', {
      type: 'orchestrator'
    });
  }

  /**
   * Process task queue
   */
  async processQueue() {
    try {
      // Check if we can process more tasks
      if (this.activeTasks.size >= this.resourceLimits.maxConcurrentTasks) {
        return;
      }

      // Get next task from queue
      const task = this.getNextTask();
      if (!task) {
        // No tasks to process, stop processing if queue is empty
        if (this.taskQueue.length === 0 && this.activeTasks.size === 0) {
          this.stopProcessing();
        }
        return;
      }

      // Check if agent can handle more tasks
      const agent = this.agents.get(task.agentName);
      if (agent.currentTasks.length >= this.resourceLimits.maxTasksPerAgent) {
        return;
      }

      // Check for conflicts
      if (this.hasConflict(task)) {
        logger.warn('Task conflict detected, deferring', {
          type: 'orchestrator',
          taskId: task.id,
          agentName: task.agentName
        });
        return;
      }

      // Remove from queue and add to active tasks
      const taskIndex = this.taskQueue.findIndex(t => t.id === task.id);
      if (taskIndex !== -1) {
        this.taskQueue.splice(taskIndex, 1);
      }

      this.activeTasks.set(task.id, task);
      agent.currentTasks.push(task.id);
      agent.status = 'busy';
      agent.lastActivity = new Date().toISOString();

      // Execute task
      await this.executeTask(task);
    } catch (error) {
      logger.error('Error processing queue', {
        type: 'orchestrator',
        error: error.message
      });
    }
  }

  /**
   * Get next task from queue
   */
  getNextTask() {
    for (const task of this.taskQueue) {
      const agent = this.agents.get(task.agentName);
      
      // Check if agent is available
      if (agent.status === 'idle' || agent.currentTasks.length < this.resourceLimits.maxTasksPerAgent) {
        // Check if agent is healthy
        if (agent.health === 'healthy') {
          return task;
        }
      }
    }
    return null;
  }

  /**
   * Check for task conflicts
   */
  hasConflict(task) {
    // Check if same business is being processed by another agent
    if (task.taskData.businessId) {
      for (const [activeTaskId, activeTask] of this.activeTasks) {
        if (activeTask.taskData.businessId === task.taskData.businessId &&
            activeTask.agentName !== task.agentName) {
          return true;
        }
      }
    }

    // Check if agent is processing conflicting task type
    const agent = this.agents.get(task.agentName);
    for (const activeTaskId of agent.currentTasks) {
      const activeTask = this.activeTasks.get(activeTaskId);
      if (activeTask && this.areTasksConflicting(task, activeTask)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if two tasks are conflicting
   */
  areTasksConflicting(task1, task2) {
    // Same agent, same business
    if (task1.agentName === task2.agentName &&
        task1.taskData.businessId === task2.taskData.businessId) {
      return true;
    }

    // Proposal and builder on same business (builder should wait for proposal)
    if ((task1.agentName === 'proposal' && task2.agentName === 'builder') ||
        (task1.agentName === 'builder' && task2.agentName === 'proposal')) {
      if (task1.taskData.businessId === task2.taskData.businessId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Execute task
   */
  async executeTask(task) {
    const startTime = Date.now();
    task.status = 'running';
    task.startedAt = new Date().toISOString();

    logger.info('Task execution started', {
      type: 'orchestrator',
      taskId: task.id,
      agentName: task.agentName,
      taskType: task.taskType
    });

    try {
      const agent = this.agents.get(task.agentName);
      const agentInstance = agent.instance;

      // Execute task based on type
      let result;
      switch (task.taskType) {
        case 'discover':
          result = await agentInstance.discoverBusinesses(
            task.taskData.query,
            task.taskData.region,
            task.taskData.limit
          );
          break;
        
        case 'generate_proposal':
          result = await agentInstance.generateProposal(task.taskData.businessId);
          break;
        
        case 'build_project':
          result = await agentInstance.buildProject(
            task.taskData.businessId,
            task.taskData.projectType
          );
          break;
        
        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      // Task completed successfully
      const executionTime = Date.now() - startTime;
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.result = result;

      this.metrics.totalTasksProcessed++;
      agent.totalTasksProcessed++;
      this.metrics.agentUtilization[task.agentName].tasksProcessed++;

      // Update average processing time
      this.updateAverageProcessingTime(executionTime);
      this.updateAgentAverageTime(task.agentName, executionTime);

      logger.info('Task completed successfully', {
        type: 'orchestrator',
        taskId: task.id,
        agentName: task.agentName,
        executionTime
      });

      // Store task result in database
      await this.storeTaskResult(task);

      // Clean up
      this.completeTask(task);
    } catch (error) {
      logger.error('Task execution failed', {
        type: 'orchestrator',
        taskId: task.id,
        agentName: task.agentName,
        error: error.message
      });

      // Handle task failure
      await this.handleTaskFailure(task, error);
    }
  }

  /**
   * Handle task failure
   */
  async handleTaskFailure(task, error) {
    task.error = error.message;
    task.retryCount++;

    const agent = this.agents.get(task.agentName);

    // Check if we should retry
    if (task.retryCount < task.maxRetries) {
      logger.info('Retrying task', {
        type: 'orchestrator',
        taskId: task.id,
        retryCount: task.retryCount,
        maxRetries: task.maxRetries
      });

      // Reset task status and requeue
      task.status = 'queued';
      task.startedAt = null;
      
      // Remove from active tasks
      this.activeTasks.delete(task.id);
      const taskIndex = agent.currentTasks.indexOf(task.id);
      if (taskIndex !== -1) {
        agent.currentTasks.splice(taskIndex, 1);
      }

      // Add back to queue with exponential backoff delay
      const delay = Math.pow(2, task.retryCount) * 1000; // 2s, 4s, 8s
      setTimeout(() => {
        this.taskQueue.push(task);
        this.sortTaskQueue();
      }, delay);
    } else {
      // Max retries exceeded
      task.status = 'failed';
      task.completedAt = new Date().toISOString();

      this.metrics.totalTasksFailed++;
      agent.totalTasksFailed++;
      this.metrics.agentUtilization[task.agentName].tasksFailed++;

      logger.error('Task failed after max retries', {
        type: 'orchestrator',
        taskId: task.id,
        agentName: task.agentName,
        retryCount: task.retryCount
      });

      // Store failed task
      await this.storeTaskResult(task);

      // Clean up
      this.completeTask(task);
    }
  }

  /**
   * Complete task and clean up
   */
  completeTask(task) {
    const agent = this.agents.get(task.agentName);

    // Remove from active tasks
    this.activeTasks.delete(task.id);

    // Remove from agent's current tasks
    const taskIndex = agent.currentTasks.indexOf(task.id);
    if (taskIndex !== -1) {
      agent.currentTasks.splice(taskIndex, 1);
    }

    // Update agent status
    if (agent.currentTasks.length === 0) {
      agent.status = 'idle';
    }

    // Update utilization rate
    this.updateAgentUtilization(task.agentName);
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId) {
    // Check if task is in queue
    const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.taskQueue[queueIndex];
      this.taskQueue.splice(queueIndex, 1);
      
      logger.info('Task cancelled from queue', {
        type: 'orchestrator',
        taskId
      });
      
      return true;
    }

    // Check if task is active
    if (this.activeTasks.has(taskId)) {
      const task = this.activeTasks.get(taskId);
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      
      this.completeTask(task);
      
      logger.info('Active task cancelled', {
        type: 'orchestrator',
        taskId
      });
      
      return true;
    }

    return false;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    // Check active tasks
    if (this.activeTasks.has(taskId)) {
      return this.activeTasks.get(taskId);
    }

    // Check queue
    const queuedTask = this.taskQueue.find(t => t.id === taskId);
    if (queuedTask) {
      return queuedTask;
    }

    return null;
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentName) {
    if (!this.agents.has(agentName)) {
      return null;
    }

    const agent = this.agents.get(agentName);
    return {
      name: agentName,
      status: agent.status,
      health: agent.health,
      currentTasks: agent.currentTasks.length,
      totalTasksProcessed: agent.totalTasksProcessed,
      totalTasksFailed: agent.totalTasksFailed,
      lastActivity: agent.lastActivity,
      utilization: this.metrics.agentUtilization[agentName]
    };
  }

  /**
   * Get all agents status
   */
  getAllAgentsStatus() {
    const statuses = {};
    for (const [agentName] of this.agents) {
      statuses[agentName] = this.getAgentStatus(agentName);
    }
    return statuses;
  }

  /**
   * Get orchestrator metrics
   */
  getMetrics() {
    return {
      totalTasksProcessed: this.metrics.totalTasksProcessed,
      totalTasksFailed: this.metrics.totalTasksFailed,
      totalTasksQueued: this.metrics.totalTasksQueued,
      averageProcessingTime: this.metrics.averageProcessingTime,
      currentQueueSize: this.taskQueue.length,
      activeTasksCount: this.activeTasks.size,
      agentUtilization: this.metrics.agentUtilization,
      resourceLimits: this.resourceLimits,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Update average processing time
   */
  updateAverageProcessingTime(executionTime) {
    const totalTasks = this.metrics.totalTasksProcessed;
    const currentAvg = this.metrics.averageProcessingTime;
    this.metrics.averageProcessingTime = ((currentAvg * (totalTasks - 1)) + executionTime) / totalTasks;
  }

  /**
   * Update agent average time
   */
  updateAgentAverageTime(agentName, executionTime) {
    const utilization = this.metrics.agentUtilization[agentName];
    const totalTasks = utilization.tasksProcessed;
    const currentAvg = utilization.averageTaskTime;
    utilization.averageTaskTime = ((currentAvg * (totalTasks - 1)) + executionTime) / totalTasks;
  }

  /**
   * Update agent utilization rate
   */
  updateAgentUtilization(agentName) {
    const agent = this.agents.get(agentName);
    const utilization = this.metrics.agentUtilization[agentName];
    
    const totalTasks = agent.totalTasksProcessed + agent.totalTasksFailed;
    if (totalTasks > 0) {
      utilization.utilizationRate = (agent.totalTasksProcessed / totalTasks) * 100;
    }
  }

  /**
   * Store task result in database
   */
  async storeTaskResult(task) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO orchestrator_tasks 
          (task_id, agent_name, task_type, task_data, priority, status, submitted_at, started_at, completed_at, result, error, retry_count)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          task.id,
          task.agentName,
          task.taskType,
          JSON.stringify(task.taskData),
          task.priority,
          task.status,
          task.submittedAt,
          task.startedAt,
          task.completedAt,
          JSON.stringify(task.result),
          task.error,
          task.retryCount
        ]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO orchestrator_tasks 
            (task_id, agent_name, task_type, task_data, priority, status, submitted_at, started_at, completed_at, result, error, retry_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            task.id,
            task.agentName,
            task.taskType,
            JSON.stringify(task.taskData),
            task.priority,
            task.status,
            task.submittedAt,
            task.startedAt,
            task.completedAt,
            JSON.stringify(task.result),
            task.error,
            task.retryCount
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      logger.error('Failed to store task result', {
        type: 'orchestrator',
        error: error.message,
        taskId: task.id
      });
    }
  }

  /**
   * Set resource limits
   */
  setResourceLimits(limits) {
    this.resourceLimits = {
      ...this.resourceLimits,
      ...limits
    };

    logger.info('Resource limits updated', {
      type: 'orchestrator',
      limits: this.resourceLimits
    });
  }

  /**
   * Set agent health status
   */
  setAgentHealth(agentName, health) {
    if (!this.agents.has(agentName)) {
      return false;
    }

    const agent = this.agents.get(agentName);
    agent.health = health;

    logger.info('Agent health updated', {
      type: 'orchestrator',
      agentName,
      health
    });

    return true;
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      queueLength: this.taskQueue.length,
      activeTasksCount: this.activeTasks.size,
      tasks: this.taskQueue.map(t => ({
        id: t.id,
        agentName: t.agentName,
        taskType: t.taskType,
        priority: t.priority,
        status: t.status,
        submittedAt: t.submittedAt
      }))
    };
  }
}

// Singleton instance
const agentOrchestrator = new AgentOrchestrator();

export default agentOrchestrator;
