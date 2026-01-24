import apmService from './apmService.js';
import websocketServer from './websocketServer.js';
import logger from './logger.js';

/**
 * APM WebSocket Integration Service
 * Provides real-time APM data streaming to connected clients
 */
class APMWebSocketIntegration {
  constructor() {
    this.connectedClients = new Set();
    this.broadcastInterval = null;
    this.isInitialized = false;
    
    this.initialize();
  }

  /**
   * Initialize WebSocket integration
   */
  initialize() {
    if (this.isInitialized) return;

    try {
      // Set up APM service event listeners
      this.setupAPMEventListeners();
      
      // Set up WebSocket event handlers
      this.setupWebSocketHandlers();
      
      // Start periodic broadcasts
      this.startPeriodicBroadcast();
      
      this.isInitialized = true;
      
      logger.info('APM WebSocket integration initialized', {
        type: 'apm_websocket',
        category: 'service_startup'
      });
    } catch (error) {
      logger.error('Failed to initialize APM WebSocket integration', {
        error: error.message,
        type: 'apm_websocket_error'
      });
    }
  }

  /**
   * Set up APM service event listeners
   */
  setupAPMEventListeners() {
    // Listen for metrics updates
    apmService.on('metricsUpdated', (metrics) => {
      this.broadcastToClients('apmMetricsUpdate', metrics);
    });

    // Listen for new alerts
    apmService.on('alert', (alert) => {
      this.broadcastToClients('apmAlert', alert);
      
      // Log critical alerts
      if (alert.severity === 'critical') {
        logger.warn('Critical APM alert broadcasted', {
          alertId: alert.id,
          message: alert.message,
          type: 'apm_critical_alert'
        });
      }
    });

    // Listen for request completions
    apmService.on('requestCompleted', (requestData) => {
      // Only broadcast slow requests to reduce noise
      if (requestData.responseTime > 1000) {
        this.broadcastToClients('apmSlowRequest', {
          path: requestData.path,
          method: requestData.method,
          responseTime: requestData.responseTime,
          statusCode: requestData.statusCode,
          timestamp: new Date(requestData.endTime).toISOString()
        });
      }
    });

    // Listen for error tracking
    apmService.on('errorTracked', (errorData) => {
      this.broadcastToClients('apmError', {
        type: errorData.type,
        message: errorData.message,
        path: errorData.path,
        method: errorData.method,
        statusCode: errorData.statusCode,
        timestamp: errorData.timestamp
      });
    });

    // Listen for business metrics
    apmService.on('businessMetric', (metricData) => {
      this.broadcastToClients('apmBusinessMetric', metricData);
    });

    // Listen for chat metrics
    apmService.on('chatMetric', (chatMetricData) => {
      this.broadcastToClients('apmChatMetric', chatMetricData);
    });

    // Listen for real-time metrics
    apmService.on('realTimeMetric', (realtimeData) => {
      this.broadcastToClients('apmRealTimeMetric', realtimeData);
    });
  }

  /**
   * Set up WebSocket event handlers
   */
  setupWebSocketHandlers() {
    if (!websocketServer.io) {
      logger.warn('WebSocket server not available for APM integration');
      return;
    }

    // Handle new connections
    websocketServer.io.on('connection', (socket) => {
      this.handleNewConnection(socket);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  handleNewConnection(socket) {
    // Check if user has permission to view APM data
    if (!this.hasAPMPermission(socket)) {
      return;
    }

    // APM subscription
    socket.on('subscribeToAPM', (data) => {
      this.handleAPMSubscription(socket, data);
    });

    // APM unsubscription
    socket.on('unsubscribeFromAPM', () => {
      this.handleAPMUnsubscription(socket);
    });

    // Request current metrics
    socket.on('requestAPMMetrics', () => {
      this.sendCurrentMetrics(socket);
    });

    // Request metrics history
    socket.on('requestAPMHistory', (data) => {
      this.sendMetricsHistory(socket, data);
    });

    // Request alerts
    socket.on('requestAPMAlerts', () => {
      this.sendCurrentAlerts(socket);
    });

    // Acknowledge alert
    socket.on('acknowledgeAPMAlert', (data) => {
      this.handleAlertAcknowledgment(socket, data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  /**
   * Check if socket has APM viewing permissions
   */
  hasAPMPermission(socket) {
    return socket.userRole === 'developer' || socket.userRole === 'admin';
  }

  /**
   * Handle APM subscription
   */
  handleAPMSubscription(socket, data = {}) {
    if (!this.hasAPMPermission(socket)) {
      socket.emit('apmError', { message: 'Insufficient permissions for APM data' });
      return;
    }

    // Add to connected clients
    this.connectedClients.add(socket);
    
    // Store subscription preferences
    socket.apmSubscription = {
      metrics: data.metrics !== false,
      alerts: data.alerts !== false,
      errors: data.errors !== false,
      businessMetrics: data.businessMetrics !== false,
      chatMetrics: data.chatMetrics !== false,
      realTimeMetrics: data.realTimeMetrics !== false
    };

    logger.info('Client subscribed to APM updates', {
      socketId: socket.id,
      userId: socket.userId,
      subscription: socket.apmSubscription,
      type: 'apm_subscription'
    });

    // Send initial data
    this.sendCurrentMetrics(socket);
    this.sendCurrentAlerts(socket);

    // Confirm subscription
    socket.emit('apmSubscribed', {
      success: true,
      subscription: socket.apmSubscription
    });
  }

  /**
   * Handle APM unsubscription
   */
  handleAPMUnsubscription(socket) {
    this.connectedClients.delete(socket);
    delete socket.apmSubscription;

    logger.info('Client unsubscribed from APM updates', {
      socketId: socket.id,
      userId: socket.userId,
      type: 'apm_unsubscription'
    });

    socket.emit('apmUnsubscribed', { success: true });
  }

  /**
   * Send current metrics to a specific socket
   */
  sendCurrentMetrics(socket) {
    try {
      const metrics = apmService.getCurrentMetrics();
      socket.emit('apmCurrentMetrics', metrics);
    } catch (error) {
      logger.error('Failed to send current APM metrics', {
        error: error.message,
        socketId: socket.id
      });
      socket.emit('apmError', { message: 'Failed to retrieve current metrics' });
    }
  }

  /**
   * Send metrics history to a specific socket
   */
  sendMetricsHistory(socket, data = {}) {
    try {
      const { timeRange = '1h', limit = 100 } = data;
      const history = apmService.getMetricsHistory(timeRange);
      
      // Limit the number of data points to prevent overwhelming the client
      const limitedHistory = history.slice(-limit);
      
      socket.emit('apmMetricsHistory', {
        history: limitedHistory,
        timeRange,
        count: limitedHistory.length
      });
    } catch (error) {
      logger.error('Failed to send APM metrics history', {
        error: error.message,
        socketId: socket.id,
        timeRange: data.timeRange
      });
      socket.emit('apmError', { message: 'Failed to retrieve metrics history' });
    }
  }

  /**
   * Send current alerts to a specific socket
   */
  sendCurrentAlerts(socket) {
    try {
      const alerts = apmService.getActiveAlerts();
      socket.emit('apmCurrentAlerts', {
        alerts,
        count: alerts.length
      });
    } catch (error) {
      logger.error('Failed to send current APM alerts', {
        error: error.message,
        socketId: socket.id
      });
      socket.emit('apmError', { message: 'Failed to retrieve current alerts' });
    }
  }

  /**
   * Handle alert acknowledgment
   */
  handleAlertAcknowledgment(socket, data) {
    try {
      const { alertId } = data;
      const userId = socket.userId;
      
      const acknowledged = apmService.acknowledgeAlert(alertId, userId);
      
      if (acknowledged) {
        // Broadcast acknowledgment to all APM clients
        this.broadcastToClients('apmAlertAcknowledged', {
          alertId,
          acknowledgedBy: userId,
          acknowledgedAt: new Date().toISOString()
        });
        
        socket.emit('apmAlertAcknowledged', {
          success: true,
          alertId,
          acknowledgedBy: userId
        });
      } else {
        socket.emit('apmError', { message: 'Alert not found or already acknowledged' });
      }
    } catch (error) {
      logger.error('Failed to acknowledge APM alert', {
        error: error.message,
        socketId: socket.id,
        alertId: data?.alertId
      });
      socket.emit('apmError', { message: 'Failed to acknowledge alert' });
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnection(socket) {
    this.connectedClients.delete(socket);
    
    logger.debug('APM client disconnected', {
      socketId: socket.id,
      userId: socket.userId,
      connectedClients: this.connectedClients.size,
      type: 'apm_disconnection'
    });
  }

  /**
   * Broadcast data to all connected APM clients
   */
  broadcastToClients(eventName, data) {
    if (this.connectedClients.size === 0) return;

    let broadcastCount = 0;
    
    for (const socket of this.connectedClients) {
      try {
        // Check if client is still connected
        if (!socket.connected) {
          this.connectedClients.delete(socket);
          continue;
        }

        // Check subscription preferences
        if (!this.shouldBroadcastEvent(socket, eventName)) {
          continue;
        }

        socket.emit(eventName, data);
        broadcastCount++;
      } catch (error) {
        logger.error('Failed to broadcast APM data to client', {
          error: error.message,
          socketId: socket.id,
          eventName
        });
        
        // Remove problematic socket
        this.connectedClients.delete(socket);
      }
    }

    if (broadcastCount > 0) {
      logger.debug('APM data broadcasted', {
        eventName,
        clientCount: broadcastCount,
        type: 'apm_broadcast'
      });
    }
  }

  /**
   * Check if event should be broadcasted to specific client
   */
  shouldBroadcastEvent(socket, eventName) {
    const subscription = socket.apmSubscription;
    if (!subscription) return false;

    switch (eventName) {
      case 'apmMetricsUpdate':
        return subscription.metrics;
      case 'apmAlert':
      case 'apmAlertAcknowledged':
        return subscription.alerts;
      case 'apmError':
      case 'apmSlowRequest':
        return subscription.errors;
      case 'apmBusinessMetric':
        return subscription.businessMetrics;
      case 'apmChatMetric':
        return subscription.chatMetrics;
      case 'apmRealTimeMetric':
        return subscription.realTimeMetrics;
      default:
        return true;
    }
  }

  /**
   * Start periodic broadcast of metrics
   */
  startPeriodicBroadcast() {
    // Broadcast current metrics every 10 seconds
    this.broadcastInterval = setInterval(() => {
      if (this.connectedClients.size > 0) {
        const metrics = apmService.getCurrentMetrics();
        this.broadcastToClients('apmPeriodicUpdate', {
          timestamp: new Date().toISOString(),
          connectedClients: this.connectedClients.size,
          summary: {
            responseTime: metrics.responseTime.average,
            throughput: metrics.throughput.requestsPerSecond,
            errorRate: metrics.errorRate.current,
            activeRequests: metrics.activeRequests,
            cpuUsage: metrics.systemResources.cpu.usage,
            memoryUsage: metrics.systemResources.memory.usage
          }
        });
      }
    }, 10000); // 10 seconds
  }

  /**
   * Stop periodic broadcast
   */
  stopPeriodicBroadcast() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      connectedClients: this.connectedClients.size,
      isInitialized: this.isInitialized,
      broadcastActive: !!this.broadcastInterval
    };
  }

  /**
   * Send custom APM event to all clients
   */
  broadcastCustomEvent(eventName, data) {
    this.broadcastToClients(eventName, {
      ...data,
      timestamp: new Date().toISOString(),
      source: 'apm_custom'
    });
  }

  /**
   * Send APM notification to specific user
   */
  sendNotificationToUser(userId, notification) {
    for (const socket of this.connectedClients) {
      if (socket.userId === userId) {
        socket.emit('apmNotification', {
          ...notification,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Cleanup and shutdown
   */
  shutdown() {
    this.stopPeriodicBroadcast();
    
    // Notify all connected clients
    this.broadcastToClients('apmServiceShutdown', {
      message: 'APM service is shutting down',
      timestamp: new Date().toISOString()
    });
    
    // Clear connected clients
    this.connectedClients.clear();
    
    this.isInitialized = false;
    
    logger.info('APM WebSocket integration shut down', {
      type: 'apm_websocket',
      category: 'service_shutdown'
    });
  }
}

// Create singleton instance
const apmWebSocketIntegration = new APMWebSocketIntegration();

export default apmWebSocketIntegration;
export { APMWebSocketIntegration };