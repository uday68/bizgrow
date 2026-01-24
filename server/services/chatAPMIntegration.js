import chatService from './chatService.js';
import apmService from './apmService.js';
import websocketServer from './websocketServer.js';
import logger from './logger.js';

/**
 * Chat System APM Integration Service
 * Integrates chat system with APM for comprehensive monitoring
 */
class ChatAPMIntegration {
  constructor() {
    this.chatMetrics = {
      sessions: {
        total: 0,
        active: 0,
        waiting: 0,
        closed: 0,
        averageDuration: 0
      },
      messages: {
        total: 0,
        perMinute: 0,
        averageLength: 0,
        responseTime: 0
      },
      agents: {
        total: 0,
        available: 0,
        busy: 0,
        offline: 0,
        utilization: 0,
        averageResponseTime: 0
      },
      performance: {
        connectionLatency: 0,
        messageDeliveryTime: 0,
        sessionAssignmentTime: 0,
        errorRate: 0
      },
      business: {
        customerSatisfaction: 0,
        resolutionRate: 0,
        escalationRate: 0,
        firstResponseTime: 0
      }
    };

    this.performanceTracking = {
      sessionTimes: new Map(),
      messageTimes: new Map(),
      agentResponseTimes: new Map(),
      connectionTimes: new Map()
    };

    this.isInitialized = false;
    this.initialize();
  }

  /**
   * Initialize chat APM integration
   */
  initialize() {
    if (this.isInitialized) return;

    try {
      // Set up chat service event listeners
      this.setupChatEventListeners();
      
      // Set up WebSocket event listeners
      this.setupWebSocketEventListeners();
      
      // Start periodic metrics collection
      this.startPeriodicCollection();
      
      this.isInitialized = true;
      
      logger.info('Chat APM integration initialized', {
        type: 'chat_apm',
        category: 'service_startup'
      });
    } catch (error) {
      logger.error('Failed to initialize Chat APM integration', {
        error: error.message,
        type: 'chat_apm_error'
      });
    }
  }

  /**
   * Set up chat service event listeners
   */
  setupChatEventListeners() {
    // Session events
    chatService.on('sessionCreated', (session) => {
      this.trackSessionCreated(session);
    });

    chatService.on('sessionClosed', ({ sessionId, session, closedBy, reason }) => {
      this.trackSessionClosed(sessionId, session, closedBy, reason);
    });

    chatService.on('agentAssigned', ({ sessionId, agentId, session }) => {
      this.trackAgentAssigned(sessionId, agentId, session);
    });

    // Message events
    chatService.on('messageReceived', ({ sessionId, message, session }) => {
      this.trackMessageReceived(sessionId, message, session);
    });

    // Agent events
    chatService.on('agentStatusChanged', ({ agentId, status, agent }) => {
      this.trackAgentStatusChanged(agentId, status, agent);
    });
  }

  /**
   * Set up WebSocket event listeners
   */
  setupWebSocketEventListeners() {
    if (!websocketServer.io) {
      logger.warn('WebSocket server not available for chat APM integration');
      return;
    }

    // Track WebSocket connections for chat
    websocketServer.io.on('connection', (socket) => {
      this.trackWebSocketConnection(socket);
    });
  }

  /**
   * Track session creation
   */
  trackSessionCreated(session) {
    const startTime = Date.now();
    
    // Update metrics
    this.chatMetrics.sessions.total++;
    this.chatMetrics.sessions.active++;
    this.chatMetrics.sessions.waiting++;

    // Track session timing
    this.performanceTracking.sessionTimes.set(session.id, {
      startTime,
      createdAt: new Date(session.createdAt).getTime(),
      customerId: session.customerId,
      customerName: session.customerInfo.name
    });

    // Track business metrics
    apmService.trackBusinessMetric('chat_session_created', {
      sessionId: session.id,
      customerId: session.customerId,
      customerName: session.customerInfo.name,
      queuePosition: chatService.sessionQueue.length
    });

    // Log performance
    logger.chat('Session created - APM tracking', {
      sessionId: session.id,
      customerId: session.customerId,
      queueLength: chatService.sessionQueue.length,
      type: 'chat_apm_session'
    });

    // Update APM with chat metrics
    this.updateAPMChatMetrics();
  }

  /**
   * Track session closure
   */
  trackSessionClosed(sessionId, session, closedBy, reason) {
    const endTime = Date.now();
    const sessionTracking = this.performanceTracking.sessionTimes.get(sessionId);
    
    if (sessionTracking) {
      const duration = endTime - sessionTracking.startTime;
      
      // Update average duration
      this.updateAverageSessionDuration(duration);
      
      // Clean up tracking
      this.performanceTracking.sessionTimes.delete(sessionId);
      
      // Track business metrics
      apmService.trackBusinessMetric('chat_session_closed', {
        sessionId,
        duration,
        closedBy,
        reason,
        customerId: session.customerId
      });

      logger.chat('Session closed - APM tracking', {
        sessionId,
        duration,
        closedBy,
        reason,
        type: 'chat_apm_session'
      });
    }

    // Update metrics
    this.chatMetrics.sessions.active = Math.max(0, this.chatMetrics.sessions.active - 1);
    this.chatMetrics.sessions.closed++;
    
    if (session.status === 'waiting') {
      this.chatMetrics.sessions.waiting = Math.max(0, this.chatMetrics.sessions.waiting - 1);
    }

    this.updateAPMChatMetrics();
  }

  /**
   * Track agent assignment
   */
  trackAgentAssigned(sessionId, agentId, session) {
    const assignmentTime = Date.now();
    const sessionTracking = this.performanceTracking.sessionTimes.get(sessionId);
    
    if (sessionTracking) {
      const waitTime = assignmentTime - sessionTracking.startTime;
      
      // Track assignment performance
      this.updateSessionAssignmentTime(waitTime);
      
      // Update session tracking
      sessionTracking.agentAssignedAt = assignmentTime;
      sessionTracking.agentId = agentId;
      sessionTracking.waitTime = waitTime;
    }

    // Update metrics
    this.chatMetrics.sessions.waiting = Math.max(0, this.chatMetrics.sessions.waiting - 1);

    // Track business metrics
    apmService.trackBusinessMetric('chat_agent_assigned', {
      sessionId,
      agentId,
      waitTime: sessionTracking?.waitTime || 0,
      customerId: session.customerId
    });

    logger.chat('Agent assigned - APM tracking', {
      sessionId,
      agentId,
      waitTime: sessionTracking?.waitTime || 0,
      type: 'chat_apm_agent'
    });

    this.updateAPMChatMetrics();
  }

  /**
   * Track message received
   */
  trackMessageReceived(sessionId, message, session) {
    const messageTime = Date.now();
    
    // Update message metrics
    this.chatMetrics.messages.total++;
    this.updateAverageMessageLength(message.content.length);

    // Track message timing
    this.performanceTracking.messageTimes.set(message.id, {
      timestamp: messageTime,
      sessionId,
      senderId: message.senderId,
      senderType: message.senderType,
      contentLength: message.content.length
    });

    // Track agent response times
    if (message.senderType === 'agent') {
      this.trackAgentResponseTime(sessionId, messageTime);
    }

    // Track business metrics
    apmService.trackBusinessMetric('chat_message_received', {
      sessionId,
      messageId: message.id,
      senderType: message.senderType,
      contentLength: message.content.length
    });

    // Calculate messages per minute
    this.updateMessagesPerMinute();

    this.updateAPMChatMetrics();
  }

  /**
   * Track agent status changes
   */
  trackAgentStatusChanged(agentId, status, agent) {
    // Update agent metrics based on status
    const stats = chatService.getStatistics();
    
    this.chatMetrics.agents.total = stats.agents.total;
    this.chatMetrics.agents.available = stats.agents.available;
    this.chatMetrics.agents.busy = stats.agents.busy;
    this.chatMetrics.agents.offline = stats.agents.offline;
    
    // Calculate utilization
    if (this.chatMetrics.agents.total > 0) {
      this.chatMetrics.agents.utilization = 
        (this.chatMetrics.agents.busy / this.chatMetrics.agents.total) * 100;
    }

    // Track business metrics
    apmService.trackBusinessMetric('chat_agent_status_changed', {
      agentId,
      status,
      agentName: agent.name,
      totalAgents: this.chatMetrics.agents.total,
      utilization: this.chatMetrics.agents.utilization
    });

    logger.chat('Agent status changed - APM tracking', {
      agentId,
      status,
      utilization: this.chatMetrics.agents.utilization,
      type: 'chat_apm_agent'
    });

    this.updateAPMChatMetrics();
  }

  /**
   * Track WebSocket connection for chat
   */
  trackWebSocketConnection(socket) {
    const connectionTime = Date.now();
    
    // Track connection timing
    this.performanceTracking.connectionTimes.set(socket.id, {
      startTime: connectionTime,
      userId: socket.userId,
      userRole: socket.userRole
    });

    // Listen for chat-specific events
    socket.on('joinSession', (data) => {
      this.trackSessionJoin(socket, data);
    });

    socket.on('sendMessage', (data) => {
      this.trackMessageSend(socket, data);
    });

    socket.on('disconnect', () => {
      this.trackWebSocketDisconnection(socket);
    });
  }

  /**
   * Track session join via WebSocket
   */
  trackSessionJoin(socket, data) {
    const joinTime = Date.now();
    const connectionTracking = this.performanceTracking.connectionTimes.get(socket.id);
    
    if (connectionTracking) {
      const connectionLatency = joinTime - connectionTracking.startTime;
      this.updateConnectionLatency(connectionLatency);
    }

    // Track business metrics
    apmService.trackBusinessMetric('chat_session_joined', {
      sessionId: data.sessionId,
      userId: socket.userId,
      userRole: socket.userRole,
      connectionLatency: connectionTracking ? joinTime - connectionTracking.startTime : 0
    });
  }

  /**
   * Track message send via WebSocket
   */
  trackMessageSend(socket, data) {
    const sendTime = Date.now();
    
    // Track message delivery performance
    const messageId = `ws_${sendTime}_${socket.id}`;
    this.performanceTracking.messageTimes.set(messageId, {
      timestamp: sendTime,
      sessionId: data.sessionId,
      senderId: socket.userId,
      senderType: socket.userRole === 'guest' ? 'customer' : 'agent',
      contentLength: data.content?.length || 0,
      deliveryMethod: 'websocket'
    });

    // Track business metrics
    apmService.trackBusinessMetric('chat_message_sent_ws', {
      sessionId: data.sessionId,
      userId: socket.userId,
      userRole: socket.userRole,
      contentLength: data.content?.length || 0
    });
  }

  /**
   * Track WebSocket disconnection
   */
  trackWebSocketDisconnection(socket) {
    const disconnectionTime = Date.now();
    const connectionTracking = this.performanceTracking.connectionTimes.get(socket.id);
    
    if (connectionTracking) {
      const connectionDuration = disconnectionTime - connectionTracking.startTime;
      
      // Track business metrics
      apmService.trackBusinessMetric('chat_connection_closed', {
        userId: socket.userId,
        userRole: socket.userRole,
        connectionDuration
      });

      // Clean up tracking
      this.performanceTracking.connectionTimes.delete(socket.id);
    }
  }

  /**
   * Track agent response time
   */
  trackAgentResponseTime(sessionId, messageTime) {
    // Find the last customer message in this session
    const sessionMessages = chatService.messageHistory.get(sessionId) || [];
    const lastCustomerMessage = [...sessionMessages]
      .reverse()
      .find(msg => msg.senderType === 'customer');

    if (lastCustomerMessage) {
      const responseTime = messageTime - new Date(lastCustomerMessage.timestamp).getTime();
      this.updateAgentResponseTime(responseTime);
      
      // Track in APM
      apmService.trackBusinessMetric('chat_agent_response', {
        sessionId,
        responseTime,
        agentId: sessionMessages[sessionMessages.length - 1]?.senderId
      });
    }
  }

  /**
   * Update average session duration
   */
  updateAverageSessionDuration(duration) {
    const currentAvg = this.chatMetrics.sessions.averageDuration;
    const totalSessions = this.chatMetrics.sessions.closed;
    
    if (totalSessions === 1) {
      this.chatMetrics.sessions.averageDuration = duration;
    } else {
      this.chatMetrics.sessions.averageDuration = 
        ((currentAvg * (totalSessions - 1)) + duration) / totalSessions;
    }
  }

  /**
   * Update average message length
   */
  updateAverageMessageLength(length) {
    const currentAvg = this.chatMetrics.messages.averageLength;
    const totalMessages = this.chatMetrics.messages.total;
    
    if (totalMessages === 1) {
      this.chatMetrics.messages.averageLength = length;
    } else {
      this.chatMetrics.messages.averageLength = 
        ((currentAvg * (totalMessages - 1)) + length) / totalMessages;
    }
  }

  /**
   * Update messages per minute
   */
  updateMessagesPerMinute() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let recentMessages = 0;
    for (const [messageId, messageData] of this.performanceTracking.messageTimes) {
      if (messageData.timestamp > oneMinuteAgo) {
        recentMessages++;
      } else {
        // Clean up old message tracking
        this.performanceTracking.messageTimes.delete(messageId);
      }
    }
    
    this.chatMetrics.messages.perMinute = recentMessages;
  }

  /**
   * Update session assignment time
   */
  updateSessionAssignmentTime(waitTime) {
    const currentAvg = this.chatMetrics.performance.sessionAssignmentTime;
    const assignedSessions = this.chatMetrics.sessions.total - this.chatMetrics.sessions.waiting;
    
    if (assignedSessions === 1) {
      this.chatMetrics.performance.sessionAssignmentTime = waitTime;
    } else if (assignedSessions > 1) {
      this.chatMetrics.performance.sessionAssignmentTime = 
        ((currentAvg * (assignedSessions - 1)) + waitTime) / assignedSessions;
    }
  }

  /**
   * Update agent response time
   */
  updateAgentResponseTime(responseTime) {
    // Track in agent response times
    const agentResponseTimes = Array.from(this.performanceTracking.agentResponseTimes.values());
    agentResponseTimes.push(responseTime);
    
    // Keep only recent response times (last 100)
    if (agentResponseTimes.length > 100) {
      agentResponseTimes.shift();
    }
    
    // Calculate average
    if (agentResponseTimes.length > 0) {
      this.chatMetrics.agents.averageResponseTime = 
        agentResponseTimes.reduce((sum, time) => sum + time, 0) / agentResponseTimes.length;
    }
  }

  /**
   * Update connection latency
   */
  updateConnectionLatency(latency) {
    const currentAvg = this.chatMetrics.performance.connectionLatency;
    const connections = this.performanceTracking.connectionTimes.size;
    
    if (connections === 1) {
      this.chatMetrics.performance.connectionLatency = latency;
    } else if (connections > 1) {
      this.chatMetrics.performance.connectionLatency = 
        ((currentAvg * (connections - 1)) + latency) / connections;
    }
  }

  /**
   * Update APM with current chat metrics
   */
  updateAPMChatMetrics() {
    // Update business metrics in APM
    apmService.metrics.business.chatSessions = this.chatMetrics.sessions.active;
    apmService.metrics.business.agentUtilization = this.chatMetrics.agents.utilization;
    
    // Emit chat metrics update
    apmService.emit('chatMetricsUpdate', {
      timestamp: new Date().toISOString(),
      metrics: this.chatMetrics
    });
  }

  /**
   * Start periodic metrics collection
   */
  startPeriodicCollection() {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.collectPeriodicMetrics();
    }, 30000);

    // Clean up old tracking data every 5 minutes
    setInterval(() => {
      this.cleanupOldTrackingData();
    }, 300000);
  }

  /**
   * Collect periodic metrics
   */
  collectPeriodicMetrics() {
    try {
      // Update chat service statistics
      const chatStats = chatService.getStatistics();
      
      // Update session metrics
      this.chatMetrics.sessions.active = chatStats.activeSessions;
      this.chatMetrics.sessions.waiting = chatStats.queuedSessions;
      
      // Update agent metrics
      this.chatMetrics.agents.total = chatStats.agents.total;
      this.chatMetrics.agents.available = chatStats.agents.available;
      this.chatMetrics.agents.busy = chatStats.agents.busy;
      this.chatMetrics.agents.offline = chatStats.agents.offline;
      
      // Calculate utilization
      if (this.chatMetrics.agents.total > 0) {
        this.chatMetrics.agents.utilization = 
          (this.chatMetrics.agents.busy / this.chatMetrics.agents.total) * 100;
      }

      // Update messages per minute
      this.updateMessagesPerMinute();

      // Update APM
      this.updateAPMChatMetrics();

      // Calculate business metrics
      this.calculateBusinessMetrics();

    } catch (error) {
      logger.error('Failed to collect periodic chat metrics', {
        error: error.message,
        type: 'chat_apm_error'
      });
    }
  }

  /**
   * Calculate business metrics
   */
  calculateBusinessMetrics() {
    // Customer satisfaction (placeholder - would integrate with feedback system)
    this.chatMetrics.business.customerSatisfaction = 85; // Placeholder

    // Resolution rate (placeholder - would track resolved vs unresolved sessions)
    this.chatMetrics.business.resolutionRate = 92; // Placeholder

    // Escalation rate (placeholder - would track escalated sessions)
    this.chatMetrics.business.escalationRate = 8; // Placeholder

    // First response time (average time to first agent response)
    this.chatMetrics.business.firstResponseTime = this.chatMetrics.performance.sessionAssignmentTime;
  }

  /**
   * Clean up old tracking data
   */
  cleanupOldTrackingData() {
    const now = Date.now();
    const oneHourAgo = now - 3600000; // 1 hour

    // Clean up old message times
    for (const [messageId, messageData] of this.performanceTracking.messageTimes) {
      if (messageData.timestamp < oneHourAgo) {
        this.performanceTracking.messageTimes.delete(messageId);
      }
    }

    // Clean up old connection times
    for (const [socketId, connectionData] of this.performanceTracking.connectionTimes) {
      if (connectionData.startTime < oneHourAgo) {
        this.performanceTracking.connectionTimes.delete(socketId);
      }
    }

    // Clean up old session times (for closed sessions)
    for (const [sessionId, sessionData] of this.performanceTracking.sessionTimes) {
      if (sessionData.startTime < oneHourAgo && !chatService.activeSessions.has(sessionId)) {
        this.performanceTracking.sessionTimes.delete(sessionId);
      }
    }
  }

  /**
   * Get current chat metrics
   */
  getCurrentMetrics() {
    return {
      timestamp: new Date().toISOString(),
      ...this.chatMetrics,
      tracking: {
        activeSessions: this.performanceTracking.sessionTimes.size,
        activeMessages: this.performanceTracking.messageTimes.size,
        activeConnections: this.performanceTracking.connectionTimes.size
      }
    };
  }

  /**
   * Generate chat performance report
   */
  generatePerformanceReport() {
    const metrics = this.getCurrentMetrics();
    
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalSessions: metrics.sessions.total,
        activeSessions: metrics.sessions.active,
        averageSessionDuration: metrics.sessions.averageDuration,
        totalMessages: metrics.messages.total,
        messagesPerMinute: metrics.messages.perMinute,
        agentUtilization: metrics.agents.utilization,
        averageResponseTime: metrics.agents.averageResponseTime
      },
      performance: metrics.performance,
      business: metrics.business,
      recommendations: this.generateRecommendations(metrics)
    };
  }

  /**
   * Generate recommendations based on chat metrics
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    // Agent utilization recommendations
    if (metrics.agents.utilization > 90) {
      recommendations.push({
        type: 'capacity',
        priority: 'high',
        title: 'High Agent Utilization',
        description: 'Agent utilization is above 90%. Consider adding more agents.',
        metric: `${metrics.agents.utilization.toFixed(1)}%`
      });
    }

    // Response time recommendations
    if (metrics.agents.averageResponseTime > 300000) { // 5 minutes
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Slow Agent Response Time',
        description: 'Average agent response time is above 5 minutes.',
        metric: `${(metrics.agents.averageResponseTime / 1000 / 60).toFixed(1)} minutes`
      });
    }

    // Queue recommendations
    if (metrics.sessions.waiting > 10) {
      recommendations.push({
        type: 'capacity',
        priority: 'high',
        title: 'Long Queue',
        description: 'Too many customers waiting for agents.',
        metric: `${metrics.sessions.waiting} waiting`
      });
    }

    return recommendations;
  }
}

// Create singleton instance
const chatAPMIntegration = new ChatAPMIntegration();

export default chatAPMIntegration;
export { ChatAPMIntegration };