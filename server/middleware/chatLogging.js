import logger from '../services/logger.js';

// Chat-specific logging middleware
export const chatLogger = () => {
  return (req, res, next) => {
    const chatLoggerInstance = logger.child({
      correlationId: req.correlationId,
      requestId: req.requestId,
      userId: req.user?.id,
      sessionId: req.params?.sessionId
    });
    
    // Track chat operations
    req.chatLogger = {
      sessionCreated: (sessionId, customerId, metadata = {}) => {
        chatLoggerInstance.chat('Session created', {
          sessionId,
          customerId,
          operation: 'session_created',
          ...metadata
        });
      },
      
      messageSent: (sessionId, messageId, senderId, senderType, contentLength, metadata = {}) => {
        chatLoggerInstance.chat('Message sent', {
          sessionId,
          messageId,
          senderId,
          senderType,
          contentLength,
          operation: 'message_sent',
          ...metadata
        });
      },
      
      messageReceived: (sessionId, messageId, senderId, senderType, contentLength, metadata = {}) => {
        chatLoggerInstance.chat('Message received', {
          sessionId,
          messageId,
          senderId,
          senderType,
          contentLength,
          operation: 'message_received',
          ...metadata
        });
      },
      
      agentAssigned: (sessionId, agentId, agentName, metadata = {}) => {
        chatLoggerInstance.chat('Agent assigned', {
          sessionId,
          agentId,
          agentName,
          operation: 'agent_assigned',
          ...metadata
        });
      },
      
      agentStatusChanged: (agentId, oldStatus, newStatus, metadata = {}) => {
        chatLoggerInstance.chat('Agent status changed', {
          agentId,
          oldStatus,
          newStatus,
          operation: 'agent_status_changed',
          ...metadata
        });
      },
      
      sessionClosed: (sessionId, closedBy, reason, duration, messageCount, metadata = {}) => {
        chatLoggerInstance.chat('Session closed', {
          sessionId,
          closedBy,
          reason,
          duration,
          messageCount,
          operation: 'session_closed',
          ...metadata
        });
      },
      
      connectionEstablished: (connectionId, userId, metadata = {}) => {
        chatLoggerInstance.websocket('Connection established', {
          connectionId,
          userId,
          operation: 'connection_established',
          ...metadata
        });
      },
      
      connectionClosed: (connectionId, userId, reason, duration, metadata = {}) => {
        chatLoggerInstance.websocket('Connection closed', {
          connectionId,
          userId,
          reason,
          duration,
          operation: 'connection_closed',
          ...metadata
        });
      },
      
      supportTicketCreated: (ticketId, customerId, priority, category, metadata = {}) => {
        chatLoggerInstance.support('Support ticket created', {
          ticketId,
          customerId,
          priority,
          category,
          operation: 'ticket_created',
          ...metadata
        });
      },
      
      supportTicketUpdated: (ticketId, status, updatedBy, metadata = {}) => {
        chatLoggerInstance.support('Support ticket updated', {
          ticketId,
          status,
          updatedBy,
          operation: 'ticket_updated',
          ...metadata
        });
      },
      
      chatMetrics: (metrics, metadata = {}) => {
        chatLoggerInstance.chat('Chat metrics', {
          ...metrics,
          operation: 'metrics',
          type: 'metrics',
          ...metadata
        });
      },
      
      securityEvent: (eventType, sessionId, details, severity = 'medium', metadata = {}) => {
        chatLoggerInstance.security(`Chat security event: ${eventType}`, {
          eventType,
          sessionId,
          details,
          severity,
          category: 'chat_security',
          ...metadata
        });
      },
      
      performanceEvent: (eventType, duration, threshold, sessionId, metadata = {}) => {
        chatLoggerInstance.performance(`Chat performance event: ${eventType}`, {
          eventType,
          duration,
          threshold,
          sessionId,
          category: 'chat_performance',
          ...metadata
        });
      }
    };
    
    next();
  };
};

// WebSocket connection logging middleware
export const websocketLogger = () => {
  return (socket, next) => {
    const wsLogger = logger.child({
      connectionId: socket.id,
      userId: socket.userId,
      ip: socket.handshake.address
    });
    
    // Track WebSocket operations
    socket.wsLogger = {
      connected: (metadata = {}) => {
        wsLogger.websocket('WebSocket connected', {
          operation: 'connected',
          userAgent: socket.handshake.headers['user-agent'],
          ...metadata
        });
      },
      
      disconnected: (reason, duration, metadata = {}) => {
        wsLogger.websocket('WebSocket disconnected', {
          operation: 'disconnected',
          reason,
          duration,
          ...metadata
        });
      },
      
      messageReceived: (eventType, data, metadata = {}) => {
        wsLogger.websocket('WebSocket message received', {
          operation: 'message_received',
          eventType,
          dataSize: JSON.stringify(data).length,
          ...metadata
        });
      },
      
      messageSent: (eventType, data, metadata = {}) => {
        wsLogger.websocket('WebSocket message sent', {
          operation: 'message_sent',
          eventType,
          dataSize: JSON.stringify(data).length,
          ...metadata
        });
      },
      
      error: (error, metadata = {}) => {
        wsLogger.error('WebSocket error', {
          operation: 'error',
          error: error.message,
          stack: error.stack,
          ...metadata
        });
      },
      
      joinRoom: (room, metadata = {}) => {
        wsLogger.websocket('Joined room', {
          operation: 'join_room',
          room,
          ...metadata
        });
      },
      
      leaveRoom: (room, metadata = {}) => {
        wsLogger.websocket('Left room', {
          operation: 'leave_room',
          room,
          ...metadata
        });
      }
    };
    
    next();
  };
};

// Chat performance monitoring middleware
export const chatPerformanceLogger = () => {
  return (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(body) {
      const duration = Date.now() - startTime;
      const isSlowRequest = duration > 2000; // 2 seconds threshold for chat operations
      
      if (isSlowRequest) {
        logger.performance('Slow chat operation detected', {
          path: req.path,
          method: req.method,
          duration,
          threshold: 2000,
          sessionId: req.params?.sessionId,
          operation: req.path.includes('/messages') ? 'message_operation' : 'session_operation',
          category: 'chat_performance'
        });
      }
      
      // Log chat-specific metrics
      if (req.path.includes('/chat/')) {
        logger.chat('Chat API operation completed', {
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          duration,
          sessionId: req.params?.sessionId,
          operation: 'api_operation',
          type: 'performance'
        });
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
};

// Chat security monitoring middleware
export const chatSecurityLogger = () => {
  return (req, res, next) => {
    const securityLogger = logger.child({
      correlationId: req.correlationId,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Monitor for suspicious chat activity
    const suspiciousPatterns = [
      /script/i,
      /<.*>/,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /document\./i,
      /window\./i
    ];
    
    // Check message content for suspicious patterns
    if (req.body && req.body.content) {
      const content = req.body.content;
      
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          securityLogger.security('Suspicious chat content detected', {
            sessionId: req.params?.sessionId,
            pattern: pattern.source,
            contentLength: content.length,
            severity: 'high',
            category: 'chat_security'
          });
          break;
        }
      }
      
      // Check for excessive message length
      if (content.length > 5000) {
        securityLogger.security('Excessive message length detected', {
          sessionId: req.params?.sessionId,
          contentLength: content.length,
          maxLength: 5000,
          severity: 'medium',
          category: 'chat_security'
        });
      }
    }
    
    // Monitor for rapid message sending (potential spam)
    const sessionId = req.params?.sessionId;
    if (sessionId && req.path.includes('/messages') && req.method === 'POST') {
      const now = Date.now();
      const key = `${req.ip}_${sessionId}`;
      
      if (!req.app.locals.messageRateTracker) {
        req.app.locals.messageRateTracker = new Map();
      }
      
      const tracker = req.app.locals.messageRateTracker;
      const lastMessages = tracker.get(key) || [];
      
      // Remove messages older than 1 minute
      const recentMessages = lastMessages.filter(time => now - time < 60000);
      recentMessages.push(now);
      tracker.set(key, recentMessages);
      
      // Check if too many messages in short time
      if (recentMessages.length > 10) { // More than 10 messages per minute
        securityLogger.security('Rapid message sending detected', {
          sessionId,
          messageCount: recentMessages.length,
          timeWindow: '1 minute',
          severity: 'high',
          category: 'chat_security'
        });
      }
    }
    
    next();
  };
};

export default {
  chatLogger,
  websocketLogger,
  chatPerformanceLogger,
  chatSecurityLogger
};