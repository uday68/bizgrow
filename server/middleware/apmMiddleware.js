import apmService from '../services/apmService.js';
import logger from '../services/logger.js';

/**
 * APM Middleware for tracking HTTP requests and performance metrics
 */

/**
 * Request tracking middleware
 * Tracks request start and integrates with APM service
 */
export const apmRequestTracking = () => {
  return (req, res, next) => {
    // Track request start
    apmService.trackRequestStart(req);

    // Store original methods
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;

    let responseSent = false;

    // Function to track request completion
    const trackCompletion = (error = null) => {
      if (responseSent) return;
      responseSent = true;
      
      try {
        apmService.trackRequestEnd(req, res, error);
      } catch (trackingError) {
        logger.error('APM request tracking failed', {
          error: trackingError.message,
          correlationId: req.correlationId
        });
      }
    };

    // Override response methods
    res.send = function(body) {
      trackCompletion();
      return originalSend.call(this, body);
    };

    res.json = function(obj) {
      trackCompletion();
      return originalJson.call(this, obj);
    };

    res.end = function(chunk, encoding) {
      trackCompletion();
      return originalEnd.call(this, chunk, encoding);
    };

    // Handle response events
    res.on('finish', () => {
      trackCompletion();
    });

    res.on('close', () => {
      trackCompletion();
    });

    // Handle errors
    res.on('error', (error) => {
      trackCompletion(error);
    });

    next();
  };
};

/**
 * Error tracking middleware
 * Specifically for tracking errors in APM
 */
export const apmErrorTracking = () => {
  return (error, req, res, next) => {
    try {
      // Track error in APM service
      apmService.trackError(error, req, res);
    } catch (trackingError) {
      logger.error('APM error tracking failed', {
        error: trackingError.message,
        originalError: error.message,
        correlationId: req.correlationId
      });
    }

    next(error);
  };
};

/**
 * Business metrics tracking middleware
 * Tracks business-specific events and metrics
 */
export const apmBusinessTracking = () => {
  return (req, res, next) => {
    // Add business metric tracking helper to request
    req.trackBusinessMetric = (metricName, data = {}) => {
      try {
        apmService.trackBusinessMetric(metricName, {
          ...data,
          userId: req.user?.id,
          path: req.path,
          method: req.method,
          correlationId: req.correlationId
        });
      } catch (error) {
        logger.error('Business metric tracking failed', {
          error: error.message,
          metricName,
          correlationId: req.correlationId
        });
      }
    };

    // Track specific business events based on routes
    const path = req.path;
    const method = req.method;

    // Track API usage patterns
    if (path.startsWith('/api/')) {
      req.trackBusinessMetric('apiCall', {
        endpoint: path,
        method
      });
    }

    // Track authentication events
    if (path.includes('/auth/')) {
      if (method === 'POST' && path.includes('/login')) {
        req.trackBusinessMetric('loginAttempt');
      } else if (method === 'POST' && path.includes('/register')) {
        req.trackBusinessMetric('registrationAttempt');
      }
    }

    // Track chat system usage
    if (path.startsWith('/api/chat/')) {
      if (method === 'POST' && path.includes('/sessions')) {
        req.trackBusinessMetric('chatSessionStart');
      } else if (method === 'POST' && path.includes('/messages')) {
        req.trackBusinessMetric('chatMessage');
      }
    }

    // Track AI agent usage
    if (path.startsWith('/api/agents/')) {
      req.trackBusinessMetric('agentInteraction', {
        agentType: path.split('/')[3] // Extract agent type from path
      });
    }

    next();
  };
};

/**
 * Performance monitoring middleware
 * Adds performance-specific headers and tracking
 */
export const apmPerformanceMonitoring = () => {
  return (req, res, next) => {
    const startTime = process.hrtime.bigint();

    // Store original methods
    const originalSend = res.send;
    const originalJson = res.json;

    // Add performance tracking
    const addPerformanceHeaders = () => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      // Add performance headers
      res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
      res.set('X-Process-Time', `${process.uptime().toFixed(2)}s`);
      res.set('X-Memory-Usage', `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // Add APM correlation headers
      if (req.correlationId) {
        res.set('X-Correlation-ID', req.correlationId);
      }
      
      if (req.requestId) {
        res.set('X-Request-ID', req.requestId);
      }

      // Track slow requests
      if (duration > 1000) { // Slower than 1 second
        logger.warn('Slow request detected by APM', {
          type: 'apm_slow_request',
          path: req.path,
          method: req.method,
          duration,
          correlationId: req.correlationId
        });
      }
    };

    // Override response methods
    res.send = function(body) {
      addPerformanceHeaders();
      return originalSend.call(this, body);
    };

    res.json = function(obj) {
      addPerformanceHeaders();
      return originalJson.call(this, obj);
    };

    next();
  };
};

/**
 * Real-time metrics middleware
 * Provides real-time metrics updates via WebSocket
 */
export const apmRealTimeMetrics = () => {
  return (req, res, next) => {
    // Add real-time metrics helper
    req.emitMetric = (metricType, data) => {
      try {
        // Emit to APM service for real-time dashboard updates
        apmService.emit('realTimeMetric', {
          type: metricType,
          data,
          timestamp: new Date().toISOString(),
          path: req.path,
          method: req.method,
          userId: req.user?.id
        });
      } catch (error) {
        logger.error('Real-time metric emission failed', {
          error: error.message,
          metricType,
          correlationId: req.correlationId
        });
      }
    };

    next();
  };
};

/**
 * Chat system APM integration middleware
 * Specifically tracks chat-related performance metrics
 */
export const apmChatIntegration = () => {
  return (req, res, next) => {
    // Add chat-specific tracking helpers
    req.trackChatMetric = (metricName, data = {}) => {
      try {
        const chatMetricData = {
          ...data,
          sessionId: req.params?.sessionId,
          userId: req.user?.id,
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        };

        apmService.trackBusinessMetric(`chat_${metricName}`, chatMetricData);

        // Also emit for real-time updates
        apmService.emit('chatMetric', {
          metricName,
          data: chatMetricData
        });
      } catch (error) {
        logger.error('Chat metric tracking failed', {
          error: error.message,
          metricName,
          correlationId: req.correlationId
        });
      }
    };

    // Track chat-specific events
    const path = req.path;
    const method = req.method;

    if (path.startsWith('/api/chat/')) {
      // Track session operations
      if (path.includes('/sessions')) {
        if (method === 'POST' && !path.includes('/messages')) {
          req.trackChatMetric('session_created');
        } else if (method === 'GET') {
          req.trackChatMetric('session_accessed');
        } else if (method === 'POST' && path.includes('/close')) {
          req.trackChatMetric('session_closed');
        }
      }

      // Track message operations
      if (path.includes('/messages') && method === 'POST') {
        req.trackChatMetric('message_sent');
      }

      // Track agent operations
      if (path.includes('/assign') && method === 'POST') {
        req.trackChatMetric('agent_assigned');
      }

      // Track search operations
      if (path.includes('/search') && method === 'POST') {
        req.trackChatMetric('search_performed');
      }
    }

    next();
  };
};

/**
 * Combined APM middleware
 * Applies all APM tracking in the correct order
 */
export const apmMiddleware = () => {
  return (req, res, next) => {
    // Apply all APM middleware in sequence
    apmRequestTracking()(req, res, () => {
      apmPerformanceMonitoring()(req, res, () => {
        apmBusinessTracking()(req, res, () => {
          apmRealTimeMetrics()(req, res, () => {
            apmChatIntegration()(req, res, next);
          });
        });
      });
    });
  };
};

/**
 * APM health check middleware
 * Provides health check information for APM system
 */
export const apmHealthCheck = () => {
  return (req, res, next) => {
    // Add APM health information to health checks
    if (req.path === '/health' || req.path === '/api/health') {
      const originalJson = res.json;
      
      res.json = function(data) {
        // Add APM health information
        const apmHealth = {
          apm: {
            status: apmService.isMonitoring ? 'healthy' : 'stopped',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            activeRequests: apmService.activeRequests?.size || 0,
            totalRequests: apmService.metrics?.throughput?.totalRequests || 0,
            errorRate: apmService.metrics?.errorRate?.current || 0,
            averageResponseTime: apmService.metrics?.responseTime?.average || 0
          }
        };

        const enhancedData = {
          ...data,
          ...apmHealth
        };

        return originalJson.call(this, enhancedData);
      };
    }

    next();
  };
};

export default {
  apmRequestTracking,
  apmErrorTracking,
  apmBusinessTracking,
  apmPerformanceMonitoring,
  apmRealTimeMetrics,
  apmChatIntegration,
  apmMiddleware,
  apmHealthCheck
};