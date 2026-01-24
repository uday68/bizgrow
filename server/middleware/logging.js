import logger, { generateCorrelationId } from '../services/logger.js';

// Request/Response logging middleware with comprehensive tracking
export const requestResponseLogger = (options = {}) => {
  const {
    logLevel = 'info',
    includeBody = false,
    includeHeaders = false,
    excludePaths = ['/health', '/favicon.ico'],
    slowRequestThreshold = 1000, // 1 second
    logRequestBody = process.env.NODE_ENV !== 'production',
    logResponseBody = false,
    maxBodyLength = 1000
  } = options;

  return (req, res, next) => {
    const startTime = Date.now();
    
    // Generate correlation ID if not present
    if (!req.correlationId) {
      req.correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
    }
    
    // Generate request ID
    req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add correlation ID to response headers
    res.setHeader('X-Correlation-ID', req.correlationId);
    res.setHeader('X-Request-ID', req.requestId);
    
    // Skip logging for excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Create request logger with context
    const requestLogger = logger.child({
      correlationId: req.correlationId,
      requestId: req.requestId,
      userId: req.user?.id,
      sessionId: req.sessionID
    });
    
    // Prepare request metadata
    const requestMeta = {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      ...(includeHeaders && { headers: sanitizeHeaders(req.headers) }),
      ...(logRequestBody && includeBody && req.body && { 
        body: truncateBody(req.body, maxBodyLength) 
      })
    };
    
    // Log incoming request
    requestLogger.info('Incoming request', {
      type: 'request_start',
      ...requestMeta
    });
    
    // Capture original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;
    
    let responseBody = null;
    let responseSent = false;
    
    // Override res.send to capture response body
    res.send = function(body) {
      if (!responseSent) {
        responseBody = body;
        responseSent = true;
        logResponse();
      }
      return originalSend.call(this, body);
    };
    
    // Override res.json to capture JSON response
    res.json = function(obj) {
      if (!responseSent) {
        responseBody = obj;
        responseSent = true;
        logResponse();
      }
      return originalJson.call(this, obj);
    };
    
    // Override res.end to capture end without body
    res.end = function(chunk, encoding) {
      if (!responseSent) {
        responseBody = chunk;
        responseSent = true;
        logResponse();
      }
      return originalEnd.call(this, chunk, encoding);
    };
    
    // Function to log response
    const logResponse = () => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const isSlowRequest = duration > slowRequestThreshold;
      
      // Prepare response metadata
      const responseMeta = {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        duration,
        responseTime: duration,
        contentLength: res.get('Content-Length'),
        contentType: res.get('Content-Type'),
        isSlowRequest,
        ...(includeHeaders && { headers: sanitizeHeaders(res.getHeaders()) }),
        ...(logResponseBody && responseBody && { 
          responseBody: truncateBody(responseBody, maxBodyLength) 
        })
      };
      
      // Determine log level based on status code and performance
      let level = logLevel;
      let logType = 'request_complete';
      
      if (res.statusCode >= 500) {
        level = 'error';
        logType = 'request_error';
      } else if (res.statusCode >= 400) {
        level = 'warn';
        logType = 'request_client_error';
      } else if (isSlowRequest) {
        level = 'warn';
        logType = 'request_slow';
      }
      
      // Log response
      requestLogger.log(level, `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
        type: logType,
        ...requestMeta,
        ...responseMeta
      });
      
      // Log performance metrics for slow requests
      if (isSlowRequest) {
        requestLogger.performance('Slow request detected', {
          threshold: slowRequestThreshold,
          actualDuration: duration,
          path: req.path,
          method: req.method,
          statusCode: res.statusCode
        });
      }
      
      // Log security events for suspicious requests
      if (res.statusCode === 401 || res.statusCode === 403) {
        requestLogger.security('Authentication/Authorization failure', {
          statusCode: res.statusCode,
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          severity: res.statusCode === 403 ? 'high' : 'medium'
        });
      }
      
      // Log rate limiting events
      if (res.statusCode === 429) {
        requestLogger.security('Rate limit exceeded', {
          statusCode: res.statusCode,
          path: req.path,
          method: req.method,
          ip: req.ip,
          severity: 'medium'
        });
      }
    };
    
    // Handle response finish event as fallback
    res.on('finish', () => {
      if (!responseSent) {
        responseSent = true;
        logResponse();
      }
    });
    
    // Handle connection close/error
    res.on('close', () => {
      if (!responseSent) {
        responseSent = true;
        requestLogger.warn('Request connection closed before response', {
          type: 'request_closed',
          duration: Date.now() - startTime,
          ...requestMeta
        });
      }
    });
    
    next();
  };
};

// Error logging middleware
export const errorLogger = (err, req, res, next) => {
  const errorLogger = logger.child({
    correlationId: req.correlationId,
    requestId: req.requestId,
    userId: req.user?.id
  });
  
  // Prepare error metadata
  const errorMeta = {
    type: 'application_error',
    errorName: err.name,
    errorMessage: err.message,
    errorCode: err.code,
    statusCode: err.statusCode || 500,
    stack: err.stack,
    method: req.method,
    path: req.path,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    query: req.query,
    params: req.params
  };
  
  // Log error with appropriate level
  if (err.statusCode && err.statusCode < 500) {
    errorLogger.warn('Client error occurred', errorMeta);
  } else {
    errorLogger.error('Server error occurred', errorMeta);
  }
  
  next(err);
};

// Database operation logging middleware
export const databaseLogger = (operation) => {
  return (req, res, next) => {
    const dbLogger = logger.child({
      correlationId: req.correlationId,
      requestId: req.requestId,
      userId: req.user?.id
    });
    
    const startTime = Date.now();
    
    // Override database methods to log operations
    const originalQuery = req.db?.query;
    if (originalQuery) {
      req.db.query = function(...args) {
        const queryStartTime = Date.now();
        const query = args[0];
        
        dbLogger.database('Query started', {
          operation,
          query: typeof query === 'string' ? query.substring(0, 200) : 'Complex query',
          params: args[1] ? 'Present' : 'None'
        });
        
        const result = originalQuery.apply(this, args);
        
        // Handle promise-based queries
        if (result && typeof result.then === 'function') {
          return result
            .then(data => {
              const queryDuration = Date.now() - queryStartTime;
              dbLogger.database('Query completed', {
                operation,
                duration: queryDuration,
                rowCount: Array.isArray(data) ? data.length : data?.rowCount || 0,
                success: true
              });
              return data;
            })
            .catch(error => {
              const queryDuration = Date.now() - queryStartTime;
              dbLogger.error('Database query failed', {
                operation,
                duration: queryDuration,
                error: error.message,
                query: typeof query === 'string' ? query.substring(0, 200) : 'Complex query'
              });
              throw error;
            });
        }
        
        return result;
      };
    }
    
    next();
  };
};

// Cache operation logging middleware
export const cacheLogger = () => {
  return (req, res, next) => {
    const cacheLoggerInstance = logger.child({
      correlationId: req.correlationId,
      requestId: req.requestId,
      userId: req.user?.id
    });
    
    // Track cache operations
    req.cacheLogger = {
      hit: (key, ttl) => {
        cacheLoggerInstance.cache('Cache hit', {
          key,
          ttl,
          operation: 'hit'
        });
      },
      
      miss: (key) => {
        cacheLoggerInstance.cache('Cache miss', {
          key,
          operation: 'miss'
        });
      },
      
      set: (key, ttl) => {
        cacheLoggerInstance.cache('Cache set', {
          key,
          ttl,
          operation: 'set'
        });
      },
      
      delete: (key) => {
        cacheLoggerInstance.cache('Cache delete', {
          key,
          operation: 'delete'
        });
      }
    };
    
    next();
  };
};

// AI Agent operation logging middleware
export const agentLogger = () => {
  return (req, res, next) => {
    const agentLoggerInstance = logger.child({
      correlationId: req.correlationId,
      requestId: req.requestId,
      userId: req.user?.id
    });
    
    // Track agent operations
    req.agentLogger = {
      start: (agentName, operation, metadata = {}) => {
        agentLoggerInstance.agent(agentName, `Started: ${operation}`, {
          operation,
          status: 'started',
          ...metadata
        });
      },
      
      complete: (agentName, operation, result, metadata = {}) => {
        agentLoggerInstance.agent(agentName, `Completed: ${operation}`, {
          operation,
          status: 'completed',
          result: typeof result === 'object' ? 'Object' : result,
          ...metadata
        });
      },
      
      error: (agentName, operation, error, metadata = {}) => {
        agentLoggerInstance.error(`Agent ${agentName} failed: ${operation}`, {
          agentName,
          operation,
          status: 'failed',
          error: error.message,
          stack: error.stack,
          ...metadata
        });
      }
    };
    
    next();
  };
};

// Security event logging middleware
export const securityLogger = () => {
  return (req, res, next) => {
    const securityLoggerInstance = logger.child({
      correlationId: req.correlationId,
      requestId: req.requestId,
      userId: req.user?.id
    });
    
    // Track security events
    req.securityLogger = {
      authAttempt: (email, success, reason = null) => {
        securityLoggerInstance.security('Authentication attempt', {
          email,
          success,
          reason,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          severity: success ? 'low' : 'medium'
        });
      },
      
      authFailure: (email, reason, attempts = 1) => {
        securityLoggerInstance.security('Authentication failure', {
          email,
          reason,
          attempts,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          severity: attempts > 3 ? 'high' : 'medium'
        });
      },
      
      suspiciousActivity: (activity, metadata = {}) => {
        securityLoggerInstance.security('Suspicious activity detected', {
          activity,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          severity: 'high',
          ...metadata
        });
      },
      
      accessDenied: (resource, reason) => {
        securityLoggerInstance.security('Access denied', {
          resource,
          reason,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          severity: 'medium'
        });
      }
    };
    
    next();
  };
};

// Utility functions
function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token'
  ];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

function truncateBody(body, maxLength) {
  if (!body) return body;
  
  let bodyStr;
  if (typeof body === 'object') {
    bodyStr = JSON.stringify(body);
  } else {
    bodyStr = String(body);
  }
  
  if (bodyStr.length > maxLength) {
    return bodyStr.substring(0, maxLength) + '... [TRUNCATED]';
  }
  
  return body;
}

// Export all middleware
export default {
  requestResponseLogger,
  errorLogger,
  databaseLogger,
  cacheLogger,
  agentLogger,
  securityLogger
};