import EventEmitter from 'events';
import os from 'os';
import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import cacheService from './cacheService.js';
import databaseMonitor from './databaseMonitor.js';
import chatService from './chatService.js';
import websocketServer from './websocketServer.js';

/**
 * Application Performance Monitoring (APM) Service
 * Comprehensive monitoring for response times, throughput, error rates, and system resources
 */
class APMService extends EventEmitter {
  constructor() {
    super();
    
    // Core metrics storage
    this.metrics = {
      responseTime: {
        current: 0,
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        samples: []
      },
      throughput: {
        requestsPerSecond: 0,
        requestsPerMinute: 0,
        totalRequests: 0,
        requestCounts: []
      },
      errorRate: {
        current: 0,
        total: 0,
        errors: 0,
        errorsByType: new Map(),
        errorHistory: []
      },
      systemResources: {
        cpu: {
          usage: 0,
          loadAverage: [0, 0, 0],
          cores: os.cpus().length
        },
        memory: {
          used: 0,
          free: 0,
          total: 0,
          usage: 0,
          heapUsed: 0,
          heapTotal: 0
        },
        disk: {
          usage: 0,
          free: 0,
          total: 0
        },
        network: {
          bytesIn: 0,
          bytesOut: 0
        }
      },
      business: {
        activeUsers: 0,
        chatSessions: 0,
        agentUtilization: 0,
        conversionRate: 0
      }
    };

    // Performance thresholds for alerting
    this.thresholds = {
      responseTime: {
        warning: 1000, // 1 second
        critical: 3000 // 3 seconds
      },
      errorRate: {
        warning: 0.05, // 5%
        critical: 0.10 // 10%
      },
      cpu: {
        warning: 70, // 70%
        critical: 90 // 90%
      },
      memory: {
        warning: 80, // 80%
        critical: 95 // 95%
      },
      disk: {
        warning: 85, // 85%
        critical: 95 // 95%
      }
    };

    // Alert management
    this.alerts = new Map();
    this.alertHistory = [];
    
    // Monitoring state
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.metricsHistory = [];
    this.maxHistorySize = 1000;
    
    // Request tracking
    this.activeRequests = new Map();
    this.requestHistory = [];
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize APM service
   */
  initialize() {
    logger.info('APM Service initializing', {
      type: 'apm',
      category: 'service_startup'
    });

    // Set up event listeners
    this.setupEventListeners();
    
    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Set up event listeners for various services
   */
  setupEventListeners() {
    // Chat service events
    if (chatService) {
      chatService.on('sessionCreated', (session) => {
        this.trackBusinessMetric('chatSessionCreated', { sessionId: session.id });
      });

      chatService.on('messageReceived', ({ sessionId, message }) => {
        this.trackBusinessMetric('chatMessage', { sessionId, messageId: message.id });
      });

      chatService.on('agentAssigned', ({ sessionId, agentId }) => {
        this.trackBusinessMetric('agentAssigned', { sessionId, agentId });
      });
    }

    // WebSocket events
    if (websocketServer) {
      // Track WebSocket connections for real-time user metrics
      setInterval(() => {
        const connectionStats = websocketServer.getConnectionStats();
        this.metrics.business.activeUsers = connectionStats.totalConnections;
      }, 5000);
    }
  }

  /**
   * Start monitoring system metrics
   */
  startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('APM monitoring already running');
      return;
    }

    this.isMonitoring = true;
    
    // Collect metrics every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000);

    // Calculate derived metrics every 10 seconds
    setInterval(() => {
      this.calculateDerivedMetrics();
    }, 10000);

    // Clean up old data every minute
    setInterval(() => {
      this.cleanupOldData();
    }, 60000);

    // Generate alerts every 30 seconds
    setInterval(() => {
      this.checkAlerts();
    }, 30000);

    logger.info('APM monitoring started', {
      type: 'apm',
      category: 'monitoring_started'
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
    
    logger.info('APM monitoring stopped', {
      type: 'apm',
      category: 'monitoring_stopped'
    });
  }

  /**
   * Track HTTP request start
   */
  trackRequestStart(req) {
    const requestId = req.requestId || req.correlationId;
    if (!requestId) return;

    const requestData = {
      id: requestId,
      method: req.method,
      path: req.path,
      url: req.url,
      startTime: Date.now(),
      startHrTime: process.hrtime(),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id
    };

    this.activeRequests.set(requestId, requestData);
    this.metrics.throughput.totalRequests++;
  }

  /**
   * Track HTTP request completion
   */
  trackRequestEnd(req, res, error = null) {
    const requestId = req.requestId || req.correlationId;
    if (!requestId) return;

    const requestData = this.activeRequests.get(requestId);
    if (!requestData) return;

    const endTime = Date.now();
    const endHrTime = process.hrtime(requestData.startHrTime);
    const responseTime = endTime - requestData.startTime;
    const preciseResponseTime = endHrTime[0] * 1000 + endHrTime[1] / 1000000;

    // Update response time metrics
    this.updateResponseTimeMetrics(responseTime, preciseResponseTime);

    // Track errors
    if (error || res.statusCode >= 400) {
      this.trackError(error, req, res);
    }

    // Store request history
    const requestRecord = {
      ...requestData,
      endTime,
      responseTime: preciseResponseTime,
      statusCode: res.statusCode,
      error: error ? error.message : null,
      contentLength: res.get('Content-Length') || 0
    };

    this.requestHistory.push(requestRecord);
    
    // Keep only recent requests
    if (this.requestHistory.length > 1000) {
      this.requestHistory = this.requestHistory.slice(-1000);
    }

    // Remove from active requests
    this.activeRequests.delete(requestId);

    // Emit event for real-time updates
    this.emit('requestCompleted', requestRecord);
  }

  /**
   * Update response time metrics
   */
  updateResponseTimeMetrics(responseTime, preciseResponseTime) {
    const metrics = this.metrics.responseTime;
    
    // Add to samples
    metrics.samples.push(preciseResponseTime);
    
    // Keep only recent samples (last 1000)
    if (metrics.samples.length > 1000) {
      metrics.samples = metrics.samples.slice(-1000);
    }

    // Update current
    metrics.current = preciseResponseTime;

    // Calculate percentiles
    if (metrics.samples.length > 0) {
      const sorted = [...metrics.samples].sort((a, b) => a - b);
      const len = sorted.length;
      
      metrics.p50 = sorted[Math.floor(len * 0.5)] || 0;
      metrics.p95 = sorted[Math.floor(len * 0.95)] || 0;
      metrics.p99 = sorted[Math.floor(len * 0.99)] || 0;
      
      // Calculate average
      metrics.average = metrics.samples.reduce((sum, time) => sum + time, 0) / len;
    }
  }

  /**
   * Track error occurrence
   */
  trackError(error, req, res) {
    this.metrics.errorRate.errors++;
    this.metrics.errorRate.total++;

    const errorType = error ? error.constructor.name : `HTTP_${res.statusCode}`;
    
    if (!this.metrics.errorRate.errorsByType.has(errorType)) {
      this.metrics.errorRate.errorsByType.set(errorType, 0);
    }
    this.metrics.errorRate.errorsByType.set(errorType, 
      this.metrics.errorRate.errorsByType.get(errorType) + 1
    );

    // Store error details
    const errorRecord = {
      timestamp: new Date().toISOString(),
      type: errorType,
      message: error ? error.message : `HTTP ${res.statusCode}`,
      stack: error ? error.stack : null,
      path: req.path,
      method: req.method,
      statusCode: res.statusCode,
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };

    this.metrics.errorRate.errorHistory.push(errorRecord);
    
    // Keep only recent errors
    if (this.metrics.errorRate.errorHistory.length > 500) {
      this.metrics.errorRate.errorHistory = this.metrics.errorRate.errorHistory.slice(-500);
    }

    // Log error for APM
    logger.error('APM tracked error', {
      type: 'apm_error',
      errorType,
      path: req.path,
      statusCode: res.statusCode,
      correlationId: req.correlationId
    });

    // Emit event for real-time updates
    this.emit('errorTracked', errorRecord);
  }

  /**
   * Track business metrics
   */
  trackBusinessMetric(metricName, data = {}) {
    const timestamp = new Date().toISOString();
    
    switch (metricName) {
      case 'chatSessionCreated':
        this.metrics.business.chatSessions++;
        break;
      case 'chatMessage':
        // Track message volume
        break;
      case 'agentAssigned':
        // Update agent utilization
        this.updateAgentUtilization();
        break;
    }

    // Emit event for real-time updates
    this.emit('businessMetric', { metricName, data, timestamp });
  }

  /**
   * Update agent utilization metrics
   */
  updateAgentUtilization() {
    if (chatService) {
      const stats = chatService.getStatistics();
      const totalAgents = stats.agents.total;
      const busyAgents = stats.agents.busy;
      
      this.metrics.business.agentUtilization = totalAgents > 0 ? 
        (busyAgents / totalAgents * 100) : 0;
    }
  }

  /**
   * Collect system resource metrics
   */
  collectSystemMetrics() {
    try {
      // CPU metrics
      const cpuUsage = process.cpuUsage();
      const loadAverage = os.loadavg();
      
      this.metrics.systemResources.cpu.loadAverage = loadAverage;
      this.metrics.systemResources.cpu.usage = this.calculateCpuUsage(cpuUsage);

      // Memory metrics
      const memoryUsage = process.memoryUsage();
      const systemMemory = {
        total: os.totalmem(),
        free: os.freemem()
      };
      
      this.metrics.systemResources.memory = {
        used: systemMemory.total - systemMemory.free,
        free: systemMemory.free,
        total: systemMemory.total,
        usage: ((systemMemory.total - systemMemory.free) / systemMemory.total) * 100,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal
      };

      // Disk metrics (basic implementation)
      this.collectDiskMetrics();

      // Network metrics (basic implementation)
      this.collectNetworkMetrics();

      // Business metrics
      this.collectBusinessMetrics();

    } catch (error) {
      logger.error('Failed to collect system metrics', {
        type: 'apm_error',
        error: error.message
      });
    }
  }

  /**
   * Calculate CPU usage percentage
   */
  calculateCpuUsage(cpuUsage) {
    if (!this.previousCpuUsage) {
      this.previousCpuUsage = cpuUsage;
      return 0;
    }

    const userDiff = cpuUsage.user - this.previousCpuUsage.user;
    const systemDiff = cpuUsage.system - this.previousCpuUsage.system;
    const totalDiff = userDiff + systemDiff;

    this.previousCpuUsage = cpuUsage;

    // Convert microseconds to percentage (rough approximation)
    return Math.min(100, (totalDiff / 1000000) * 100);
  }

  /**
   * Collect disk metrics
   */
  async collectDiskMetrics() {
    try {
      const stats = await fs.promises.stat(process.cwd());
      // This is a simplified implementation
      // In production, you'd use a library like 'node-disk-info'
      this.metrics.systemResources.disk = {
        usage: 50, // Placeholder
        free: 1000000000, // Placeholder
        total: 2000000000 // Placeholder
      };
    } catch (error) {
      // Ignore disk metric errors
    }
  }

  /**
   * Collect network metrics
   */
  collectNetworkMetrics() {
    // This is a simplified implementation
    // In production, you'd track actual network I/O
    this.metrics.systemResources.network = {
      bytesIn: 0, // Placeholder
      bytesOut: 0 // Placeholder
    };
  }

  /**
   * Collect business metrics
   */
  collectBusinessMetrics() {
    try {
      // Chat system metrics
      if (chatService) {
        const chatStats = chatService.getStatistics();
        this.metrics.business.chatSessions = chatStats.activeSessions;
        this.updateAgentUtilization();
      }

      // WebSocket connection metrics
      if (websocketServer) {
        const connectionStats = websocketServer.getConnectionStats();
        this.metrics.business.activeUsers = connectionStats.totalConnections;
      }

    } catch (error) {
      logger.error('Failed to collect business metrics', {
        type: 'apm_error',
        error: error.message
      });
    }
  }

  /**
   * Calculate derived metrics
   */
  calculateDerivedMetrics() {
    // Calculate error rate
    if (this.metrics.throughput.totalRequests > 0) {
      this.metrics.errorRate.current = 
        this.metrics.errorRate.errors / this.metrics.throughput.totalRequests;
    }

    // Calculate throughput
    this.calculateThroughputMetrics();

    // Store metrics snapshot
    this.storeMetricsSnapshot();
  }

  /**
   * Calculate throughput metrics
   */
  calculateThroughputMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneSecondAgo = now - 1000;

    // Count requests in the last minute
    const recentRequests = this.requestHistory.filter(req => 
      req.endTime && req.endTime > oneMinuteAgo
    );
    
    this.metrics.throughput.requestsPerMinute = recentRequests.length;

    // Count requests in the last second
    const veryRecentRequests = this.requestHistory.filter(req => 
      req.endTime && req.endTime > oneSecondAgo
    );
    
    this.metrics.throughput.requestsPerSecond = veryRecentRequests.length;
  }

  /**
   * Store metrics snapshot for historical analysis
   */
  storeMetricsSnapshot() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      responseTime: { ...this.metrics.responseTime },
      throughput: { ...this.metrics.throughput },
      errorRate: {
        current: this.metrics.errorRate.current,
        total: this.metrics.errorRate.total,
        errors: this.metrics.errorRate.errors
      },
      systemResources: JSON.parse(JSON.stringify(this.metrics.systemResources)),
      business: { ...this.metrics.business }
    };

    this.metricsHistory.push(snapshot);

    // Keep only recent history
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }

    // Cache current metrics for API access
    this.cacheCurrentMetrics(snapshot);

    // Emit event for real-time updates
    this.emit('metricsUpdated', snapshot);
  }

  /**
   * Cache current metrics for fast API access
   */
  async cacheCurrentMetrics(snapshot) {
    try {
      await cacheService.set('apm', 'current_metrics', snapshot, {}, 30); // 30 second TTL
    } catch (error) {
      // Ignore cache errors
    }
  }

  /**
   * Check for performance alerts
   */
  checkAlerts() {
    const alerts = [];
    const now = Date.now();

    // Response time alerts
    if (this.metrics.responseTime.p95 > this.thresholds.responseTime.critical) {
      alerts.push(this.createAlert('response_time_critical', 'critical', 
        `95th percentile response time (${this.metrics.responseTime.p95.toFixed(2)}ms) exceeds critical threshold`));
    } else if (this.metrics.responseTime.p95 > this.thresholds.responseTime.warning) {
      alerts.push(this.createAlert('response_time_warning', 'warning', 
        `95th percentile response time (${this.metrics.responseTime.p95.toFixed(2)}ms) exceeds warning threshold`));
    }

    // Error rate alerts
    if (this.metrics.errorRate.current > this.thresholds.errorRate.critical) {
      alerts.push(this.createAlert('error_rate_critical', 'critical', 
        `Error rate (${(this.metrics.errorRate.current * 100).toFixed(2)}%) exceeds critical threshold`));
    } else if (this.metrics.errorRate.current > this.thresholds.errorRate.warning) {
      alerts.push(this.createAlert('error_rate_warning', 'warning', 
        `Error rate (${(this.metrics.errorRate.current * 100).toFixed(2)}%) exceeds warning threshold`));
    }

    // CPU alerts
    if (this.metrics.systemResources.cpu.usage > this.thresholds.cpu.critical) {
      alerts.push(this.createAlert('cpu_critical', 'critical', 
        `CPU usage (${this.metrics.systemResources.cpu.usage.toFixed(1)}%) exceeds critical threshold`));
    } else if (this.metrics.systemResources.cpu.usage > this.thresholds.cpu.warning) {
      alerts.push(this.createAlert('cpu_warning', 'warning', 
        `CPU usage (${this.metrics.systemResources.cpu.usage.toFixed(1)}%) exceeds warning threshold`));
    }

    // Memory alerts
    if (this.metrics.systemResources.memory.usage > this.thresholds.memory.critical) {
      alerts.push(this.createAlert('memory_critical', 'critical', 
        `Memory usage (${this.metrics.systemResources.memory.usage.toFixed(1)}%) exceeds critical threshold`));
    } else if (this.metrics.systemResources.memory.usage > this.thresholds.memory.warning) {
      alerts.push(this.createAlert('memory_warning', 'warning', 
        `Memory usage (${this.metrics.systemResources.memory.usage.toFixed(1)}%) exceeds warning threshold`));
    }

    // Process new alerts
    for (const alert of alerts) {
      if (!this.alerts.has(alert.id) || 
          now - this.alerts.get(alert.id).lastTriggered > 300000) { // 5 minutes cooldown
        
        this.alerts.set(alert.id, {
          ...alert,
          lastTriggered: now
        });

        this.alertHistory.push(alert);
        
        // Keep only recent alert history
        if (this.alertHistory.length > 100) {
          this.alertHistory = this.alertHistory.slice(-100);
        }

        // Log alert
        logger.warn(`APM Alert: ${alert.message}`, {
          type: 'apm_alert',
          alertId: alert.id,
          severity: alert.severity,
          category: 'performance_alert'
        });

        // Emit alert event
        this.emit('alert', alert);
      }
    }

    // Clean up resolved alerts
    this.cleanupResolvedAlerts();
  }

  /**
   * Create alert object
   */
  createAlert(id, severity, message) {
    return {
      id,
      severity,
      message,
      timestamp: new Date().toISOString(),
      resolved: false,
      acknowledgedBy: null,
      acknowledgedAt: null
    };
  }

  /**
   * Clean up resolved alerts
   */
  cleanupResolvedAlerts() {
    const now = Date.now();
    const alertsToRemove = [];

    for (const [alertId, alert] of this.alerts) {
      // Remove alerts older than 1 hour if conditions are no longer met
      if (now - alert.lastTriggered > 3600000) { // 1 hour
        if (this.isAlertResolved(alertId)) {
          alertsToRemove.push(alertId);
        }
      }
    }

    for (const alertId of alertsToRemove) {
      this.alerts.delete(alertId);
    }
  }

  /**
   * Check if alert condition is resolved
   */
  isAlertResolved(alertId) {
    switch (alertId) {
      case 'response_time_critical':
        return this.metrics.responseTime.p95 <= this.thresholds.responseTime.critical;
      case 'response_time_warning':
        return this.metrics.responseTime.p95 <= this.thresholds.responseTime.warning;
      case 'error_rate_critical':
        return this.metrics.errorRate.current <= this.thresholds.errorRate.critical;
      case 'error_rate_warning':
        return this.metrics.errorRate.current <= this.thresholds.errorRate.warning;
      case 'cpu_critical':
        return this.metrics.systemResources.cpu.usage <= this.thresholds.cpu.critical;
      case 'cpu_warning':
        return this.metrics.systemResources.cpu.usage <= this.thresholds.cpu.warning;
      case 'memory_critical':
        return this.metrics.systemResources.memory.usage <= this.thresholds.memory.critical;
      case 'memory_warning':
        return this.metrics.systemResources.memory.usage <= this.thresholds.memory.warning;
      default:
        return false;
    }
  }

  /**
   * Clean up old data
   */
  cleanupOldData() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    // Clean up old request history
    this.requestHistory = this.requestHistory.filter(req => 
      req.endTime && req.endTime > oneHourAgo
    );

    // Clean up old error history
    this.metrics.errorRate.errorHistory = this.metrics.errorRate.errorHistory.filter(error => 
      new Date(error.timestamp).getTime() > oneHourAgo
    );

    // Clean up old response time samples
    if (this.metrics.responseTime.samples.length > 1000) {
      this.metrics.responseTime.samples = this.metrics.responseTime.samples.slice(-1000);
    }
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return {
      timestamp: new Date().toISOString(),
      responseTime: { ...this.metrics.responseTime },
      throughput: { ...this.metrics.throughput },
      errorRate: {
        current: this.metrics.errorRate.current,
        total: this.metrics.errorRate.total,
        errors: this.metrics.errorRate.errors,
        errorsByType: Object.fromEntries(this.metrics.errorRate.errorsByType)
      },
      systemResources: JSON.parse(JSON.stringify(this.metrics.systemResources)),
      business: { ...this.metrics.business },
      activeRequests: this.activeRequests.size,
      isMonitoring: this.isMonitoring
    };
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(timeRange = '1h') {
    const now = Date.now();
    let cutoffTime;

    switch (timeRange) {
      case '5m':
        cutoffTime = now - 5 * 60 * 1000;
        break;
      case '15m':
        cutoffTime = now - 15 * 60 * 1000;
        break;
      case '1h':
        cutoffTime = now - 60 * 60 * 1000;
        break;
      case '6h':
        cutoffTime = now - 6 * 60 * 60 * 1000;
        break;
      case '24h':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      default:
        cutoffTime = now - 60 * 60 * 1000; // Default 1 hour
    }

    return this.metricsHistory.filter(snapshot => 
      new Date(snapshot.timestamp).getTime() > cutoffTime
    );
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 50) {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId, userId) {
    if (this.alerts.has(alertId)) {
      const alert = this.alerts.get(alertId);
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date().toISOString();
      
      logger.info(`Alert acknowledged: ${alertId}`, {
        type: 'apm_alert_ack',
        alertId,
        userId
      });

      return true;
    }
    return false;
  }

  /**
   * Get performance dashboard data
   */
  getDashboardData(timeRange = '1h') {
    const history = this.getMetricsHistory(timeRange);
    const current = this.getCurrentMetrics();
    const alerts = this.getActiveAlerts();

    return {
      current,
      history,
      alerts,
      summary: {
        totalRequests: this.metrics.throughput.totalRequests,
        averageResponseTime: this.metrics.responseTime.average,
        errorRate: this.metrics.errorRate.current,
        uptime: process.uptime(),
        activeAlerts: alerts.length
      },
      timeRange
    };
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(timeRange = '24h') {
    const history = this.getMetricsHistory(timeRange);
    const current = this.getCurrentMetrics();
    const alerts = this.getAlertHistory();

    // Calculate statistics
    const responseTimeStats = this.calculateResponseTimeStats(history);
    const throughputStats = this.calculateThroughputStats(history);
    const errorStats = this.calculateErrorStats(history);

    return {
      generatedAt: new Date().toISOString(),
      timeRange,
      summary: {
        totalRequests: this.metrics.throughput.totalRequests,
        averageResponseTime: responseTimeStats.average,
        p95ResponseTime: responseTimeStats.p95,
        errorRate: errorStats.averageErrorRate,
        peakThroughput: throughputStats.peak,
        uptime: process.uptime(),
        alertsTriggered: alerts.length
      },
      responseTime: responseTimeStats,
      throughput: throughputStats,
      errors: errorStats,
      systemResources: current.systemResources,
      business: current.business,
      alerts: alerts,
      recommendations: this.generateRecommendations(current, history)
    };
  }

  /**
   * Calculate response time statistics
   */
  calculateResponseTimeStats(history) {
    if (history.length === 0) return { average: 0, p95: 0, p99: 0 };

    const responseTimes = history.map(h => h.responseTime.average).filter(rt => rt > 0);
    if (responseTimes.length === 0) return { average: 0, p95: 0, p99: 0 };

    const sorted = responseTimes.sort((a, b) => a - b);
    const len = sorted.length;

    return {
      average: responseTimes.reduce((sum, rt) => sum + rt, 0) / len,
      p95: sorted[Math.floor(len * 0.95)] || 0,
      p99: sorted[Math.floor(len * 0.99)] || 0,
      min: sorted[0],
      max: sorted[len - 1]
    };
  }

  /**
   * Calculate throughput statistics
   */
  calculateThroughputStats(history) {
    if (history.length === 0) return { peak: 0, average: 0 };

    const throughputs = history.map(h => h.throughput.requestsPerSecond);
    
    return {
      peak: Math.max(...throughputs),
      average: throughputs.reduce((sum, tp) => sum + tp, 0) / throughputs.length,
      total: this.metrics.throughput.totalRequests
    };
  }

  /**
   * Calculate error statistics
   */
  calculateErrorStats(history) {
    if (history.length === 0) return { averageErrorRate: 0, totalErrors: 0 };

    const errorRates = history.map(h => h.errorRate.current).filter(er => er >= 0);
    
    return {
      averageErrorRate: errorRates.length > 0 ? 
        errorRates.reduce((sum, er) => sum + er, 0) / errorRates.length : 0,
      totalErrors: this.metrics.errorRate.errors,
      errorsByType: Object.fromEntries(this.metrics.errorRate.errorsByType)
    };
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations(current, history) {
    const recommendations = [];

    // Response time recommendations
    if (current.responseTime.p95 > 1000) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'Optimize Response Times',
        description: '95th percentile response time is above 1 second',
        actions: [
          'Review slow database queries',
          'Implement more aggressive caching',
          'Consider adding a CDN',
          'Optimize API endpoints'
        ]
      });
    }

    // Error rate recommendations
    if (current.errorRate.current > 0.02) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        title: 'Reduce Error Rate',
        description: 'Error rate is above 2%',
        actions: [
          'Review error logs for patterns',
          'Implement better error handling',
          'Add input validation',
          'Monitor external service dependencies'
        ]
      });
    }

    // Resource recommendations
    if (current.systemResources.memory.usage > 80) {
      recommendations.push({
        type: 'resources',
        priority: 'medium',
        title: 'Memory Usage High',
        description: 'Memory usage is above 80%',
        actions: [
          'Review memory leaks',
          'Optimize data structures',
          'Implement garbage collection tuning',
          'Consider scaling up memory'
        ]
      });
    }

    // Business recommendations
    if (current.business.agentUtilization > 90) {
      recommendations.push({
        type: 'business',
        priority: 'medium',
        title: 'High Agent Utilization',
        description: 'Support agents are at high utilization',
        actions: [
          'Consider adding more support agents',
          'Implement chat automation',
          'Review support workflows',
          'Add self-service options'
        ]
      });
    }

    return recommendations;
  }
}

// Create singleton instance
const apmService = new APMService();

export default apmService;
export { APMService };