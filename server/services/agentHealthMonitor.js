import logger from './logger.js';
import cacheService from './cacheService.js';
import { getDatabase, getDatabaseType } from '../database/init.js';

/**
 * Agent Health Monitor
 * Monitors agent health, implements automatic restart, and tracks performance metrics
 */
class AgentHealthMonitor {
  constructor() {
    this.agents = new Map();
    this.healthCheckInterval = null;
    this.isMonitoring = false;
    this.healthThresholds = {
      errorRateThreshold: 0.3, // 30% error rate
      responseTimeThreshold: 30000, // 30 seconds
      consecutiveFailuresThreshold: 3,
      healthCheckInterval: 30000 // 30 seconds
    };
    this.performanceMetrics = new Map();
  }

  /**
   * Register agent for health monitoring
   */
  registerAgent(agentName, agentInstance, restartCallback) {
    if (this.agents.has(agentName)) {
      logger.warn('Agent already registered for health monitoring', {
        type: 'agent_health',
        agentName
      });
      return false;
    }

    this.agents.set(agentName, {
      instance: agentInstance,
      restartCallback,
      health: {
        status: 'healthy',
        lastCheck: null,
        consecutiveFailures: 0,
        totalRequests: 0,
        totalErrors: 0,
        totalSuccesses: 0,
        averageResponseTime: 0,
        lastError: null,
        lastSuccess: null
      },
      performance: {
        requestsPerMinute: 0,
        errorsPerMinute: 0,
        averageResponseTime: 0,
        peakResponseTime: 0,
        lastOptimization: null
      }
    });

    this.performanceMetrics.set(agentName, []);

    logger.info('Agent registered for health monitoring', {
      type: 'agent_health',
      agentName
    });

    return true;
  }

  /**
   * Unregister agent from health monitoring
   */
  unregisterAgent(agentName) {
    if (!this.agents.has(agentName)) {
      return false;
    }

    this.agents.delete(agentName);
    this.performanceMetrics.delete(agentName);

    logger.info('Agent unregistered from health monitoring', {
      type: 'agent_health',
      agentName
    });

    return true;
  }

  /**
   * Start health monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('Health monitoring already running', {
        type: 'agent_health'
      });
      return;
    }

    this.isMonitoring = true;

    // Perform health checks at regular intervals
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthThresholds.healthCheckInterval);

    logger.info('Agent health monitoring started', {
      type: 'agent_health',
      interval: this.healthThresholds.healthCheckInterval
    });
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.isMonitoring = false;

    logger.info('Agent health monitoring stopped', {
      type: 'agent_health'
    });
  }

  /**
   * Perform health checks on all agents
   */
  async performHealthChecks() {
    for (const [agentName, agentData] of this.agents) {
      try {
        await this.checkAgentHealth(agentName);
      } catch (error) {
        logger.error('Health check failed', {
          type: 'agent_health',
          agentName,
          error: error.message
        });
      }
    }
  }

  /**
   * Check individual agent health
   */
  async checkAgentHealth(agentName) {
    if (!this.agents.has(agentName)) {
      return null;
    }

    const agentData = this.agents.get(agentName);
    const health = agentData.health;

    health.lastCheck = new Date().toISOString();

    // Calculate error rate
    const errorRate = health.totalRequests > 0 
      ? health.totalErrors / health.totalRequests 
      : 0;

    // Check if agent is unhealthy
    let isUnhealthy = false;
    const issues = [];

    // Check error rate
    if (errorRate > this.healthThresholds.errorRateThreshold) {
      isUnhealthy = true;
      issues.push({
        type: 'high_error_rate',
        severity: 'critical',
        message: `Error rate (${(errorRate * 100).toFixed(1)}%) exceeds threshold`,
        errorRate
      });
    }

    // Check consecutive failures
    if (health.consecutiveFailures >= this.healthThresholds.consecutiveFailuresThreshold) {
      isUnhealthy = true;
      issues.push({
        type: 'consecutive_failures',
        severity: 'critical',
        message: `${health.consecutiveFailures} consecutive failures detected`,
        consecutiveFailures: health.consecutiveFailures
      });
    }

    // Check response time
    if (health.averageResponseTime > this.healthThresholds.responseTimeThreshold) {
      isUnhealthy = true;
      issues.push({
        type: 'slow_response',
        severity: 'warning',
        message: `Average response time (${health.averageResponseTime}ms) exceeds threshold`,
        averageResponseTime: health.averageResponseTime
      });
    }

    // Update health status
    const previousStatus = health.status;
    health.status = isUnhealthy ? 'unhealthy' : 'healthy';

    // Log health status change
    if (previousStatus !== health.status) {
      logger.warn('Agent health status changed', {
        type: 'agent_health',
        agentName,
        previousStatus,
        newStatus: health.status,
        issues
      });

      // Attempt automatic restart if unhealthy
      if (health.status === 'unhealthy') {
        await this.attemptAgentRestart(agentName);
      }
    }

    // Store health check result
    await this.storeHealthCheck(agentName, health, issues);

    // Cache health status
    await cacheService.set('agent_health', agentName, {
      status: health.status,
      lastCheck: health.lastCheck,
      errorRate,
      issues
    }, {}, 60);

    return {
      agentName,
      health: health.status,
      errorRate,
      consecutiveFailures: health.consecutiveFailures,
      averageResponseTime: health.averageResponseTime,
      issues
    };
  }

  /**
   * Attempt automatic agent restart
   */
  async attemptAgentRestart(agentName) {
    logger.info('Attempting automatic agent restart', {
      type: 'agent_health',
      agentName
    });

    try {
      const agentData = this.agents.get(agentName);
      
      if (agentData.restartCallback) {
        await agentData.restartCallback();
        
        // Reset health metrics after restart
        agentData.health.consecutiveFailures = 0;
        agentData.health.status = 'healthy';
        agentData.health.lastError = null;

        logger.info('Agent restarted successfully', {
          type: 'agent_health',
          agentName
        });

        return { success: true, message: 'Agent restarted successfully' };
      } else {
        logger.warn('No restart callback configured for agent', {
          type: 'agent_health',
          agentName
        });

        return { success: false, message: 'No restart callback configured' };
      }
    } catch (error) {
      logger.error('Agent restart failed', {
        type: 'agent_health',
        agentName,
        error: error.message
      });

      return { success: false, message: error.message };
    }
  }

  /**
   * Record agent request
   */
  recordRequest(agentName, success, responseTime, error = null) {
    if (!this.agents.has(agentName)) {
      return;
    }

    const agentData = this.agents.get(agentName);
    const health = agentData.health;

    health.totalRequests++;

    if (success) {
      health.totalSuccesses++;
      health.consecutiveFailures = 0;
      health.lastSuccess = new Date().toISOString();
    } else {
      health.totalErrors++;
      health.consecutiveFailures++;
      health.lastError = {
        message: error?.message || 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }

    // Update average response time
    health.averageResponseTime = 
      ((health.averageResponseTime * (health.totalRequests - 1)) + responseTime) / health.totalRequests;

    // Record performance metric
    this.recordPerformanceMetric(agentName, {
      timestamp: new Date().toISOString(),
      success,
      responseTime,
      error: error?.message
    });

    // Update performance metrics
    this.updatePerformanceMetrics(agentName);
  }

  /**
   * Record performance metric
   */
  recordPerformanceMetric(agentName, metric) {
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
   * Update performance metrics
   */
  updatePerformanceMetrics(agentName) {
    if (!this.agents.has(agentName) || !this.performanceMetrics.has(agentName)) {
      return;
    }

    const agentData = this.agents.get(agentName);
    const metrics = this.performanceMetrics.get(agentName);
    const performance = agentData.performance;

    // Calculate metrics for last minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentMetrics = metrics.filter(m => 
      new Date(m.timestamp).getTime() > oneMinuteAgo
    );

    performance.requestsPerMinute = recentMetrics.length;
    performance.errorsPerMinute = recentMetrics.filter(m => !m.success).length;

    if (recentMetrics.length > 0) {
      const totalResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
      performance.averageResponseTime = totalResponseTime / recentMetrics.length;
      performance.peakResponseTime = Math.max(...recentMetrics.map(m => m.responseTime));
    }
  }

  /**
   * Get agent health status
   */
  getAgentHealth(agentName) {
    if (!this.agents.has(agentName)) {
      return null;
    }

    const agentData = this.agents.get(agentName);
    return {
      agentName,
      health: agentData.health,
      performance: agentData.performance
    };
  }

  /**
   * Get all agents health
   */
  getAllAgentsHealth() {
    const healthData = {};
    
    for (const [agentName] of this.agents) {
      healthData[agentName] = this.getAgentHealth(agentName);
    }

    return healthData;
  }

  /**
   * Optimize agent performance
   */
  async optimizeAgentPerformance(agentName) {
    if (!this.agents.has(agentName)) {
      return null;
    }

    logger.info('Optimizing agent performance', {
      type: 'agent_health',
      agentName
    });

    const agentData = this.agents.get(agentName);
    const performance = agentData.performance;
    const recommendations = [];

    // Analyze performance metrics
    if (performance.averageResponseTime > 10000) {
      recommendations.push({
        type: 'slow_response',
        priority: 'high',
        message: 'Average response time is high. Consider optimizing agent logic or increasing resources.',
        currentValue: performance.averageResponseTime,
        targetValue: 5000
      });
    }

    if (performance.errorsPerMinute > 5) {
      recommendations.push({
        type: 'high_error_rate',
        priority: 'critical',
        message: 'High error rate detected. Review error logs and implement better error handling.',
        currentValue: performance.errorsPerMinute,
        targetValue: 1
      });
    }

    if (performance.requestsPerMinute > 50) {
      recommendations.push({
        type: 'high_load',
        priority: 'medium',
        message: 'High request volume. Consider implementing request throttling or scaling.',
        currentValue: performance.requestsPerMinute,
        targetValue: 30
      });
    }

    performance.lastOptimization = new Date().toISOString();

    logger.info('Performance optimization completed', {
      type: 'agent_health',
      agentName,
      recommendationsCount: recommendations.length
    });

    return {
      agentName,
      performance,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Store health check result in database
   */
  async storeHealthCheck(agentName, health, issues) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      const metrics = {
        totalRequests: health.totalRequests,
        totalErrors: health.totalErrors,
        totalSuccesses: health.totalSuccesses,
        averageResponseTime: health.averageResponseTime,
        consecutiveFailures: health.consecutiveFailures
      };

      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO agent_health_log (agent_name, health_status, metrics, checked_at)
          VALUES ($1, $2, $3, NOW())
        `, [agentName, health.status, JSON.stringify({ ...metrics, issues })]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO agent_health_log (agent_name, health_status, metrics, checked_at)
            VALUES (?, ?, ?, datetime('now'))
          `, [agentName, health.status, JSON.stringify({ ...metrics, issues })], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      logger.error('Failed to store health check', {
        type: 'agent_health',
        error: error.message,
        agentName
      });
    }
  }

  /**
   * Get health history
   */
  async getHealthHistory(agentName, limit = 100) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      let query, params;
      
      if (dbType === 'postgres') {
        query = `
          SELECT * FROM agent_health_log
          WHERE agent_name = $1
          ORDER BY checked_at DESC
          LIMIT $2
        `;
        params = [agentName, limit];
      } else {
        query = `
          SELECT * FROM agent_health_log
          WHERE agent_name = ?
          ORDER BY checked_at DESC
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
        metrics: JSON.parse(row.metrics)
      }));
    } catch (error) {
      logger.error('Failed to get health history', {
        type: 'agent_health',
        error: error.message,
        agentName
      });
      return [];
    }
  }

  /**
   * Set health thresholds
   */
  setHealthThresholds(thresholds) {
    this.healthThresholds = {
      ...this.healthThresholds,
      ...thresholds
    };

    logger.info('Health thresholds updated', {
      type: 'agent_health',
      thresholds: this.healthThresholds
    });
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      registeredAgents: Array.from(this.agents.keys()),
      healthThresholds: this.healthThresholds,
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance
const agentHealthMonitor = new AgentHealthMonitor();

export default agentHealthMonitor;
