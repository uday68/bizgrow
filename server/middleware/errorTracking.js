import errorTracker from '../services/errorTracker.js';
import logger from '../services/logger.js';

/**
 * Error tracking middleware
 * Integrates with the error tracker service to capture and analyze errors
 */

/**
 * Express error handling middleware
 * Captures all unhandled errors and tracks them
 */
export const errorTrackingMiddleware = (error, req, res, next) => {
  // Extract context from request
  const context = {
    method: req.method,
    path: req.path,
    url: req.url,
    statusCode: res.statusCode || 500,
    userId: req.user?.id,
    sessionId: req.sessionID,
    correlationId: req.correlationId || req.requestId,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    referer: req.get('Referer'),
    metadata: {
      query: req.query,
      params: req.params,
      body: req.body ? sanitizeRequestBody(req.body) : undefined,
      headers: sanitizeHeaders(req.headers)
    }
  };

  // Track the error
  const errorId = errorTracker.trackError(error, context);
  
  // Add error ID to response headers for debugging
  res.set('X-Error-ID', errorId);
  
  // Log the error with tracking information
  logger.error('Unhandled error tracked', {
    type: 'error_tracking',
    category: 'unhandled_error',
    errorId,
    errorType: error.name,
    message: error.message,
    correlationId: context.correlationId,
    path: context.path,
    userId: context.userId
  });

  // Continue with normal error handling
  next(error);
};

/**
 * Request completion middleware
 * Tracks errors based on HTTP status codes
 */
export const requestCompletionMiddleware = (req, res, next) => {
  // Store original end method
  const originalEnd = res.end;
  
  // Override end method to capture response
  res.end = function(chunk, encoding) {
    // Check if this is an error response
    if (res.statusCode >= 400) {
      const error = new Error(`HTTP ${res.statusCode}: ${getStatusMessage(res.statusCode)}`);
      error.name = `HTTP${res.statusCode}Error`;
      
      const context = {
        method: req.method,
        path: req.path,
        url: req.url,
        statusCode: res.statusCode,
        userId: req.user?.id,
        sessionId: req.sessionID,
        correlationId: req.correlationId || req.requestId,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        referer: req.get('Referer'),
        metadata: {
          responseSize: res.get('Content-Length'),
          responseTime: res.get('X-Response-Time')
        }
      };
      
      // Track the error
      const errorId = errorTracker.trackError(error, context);
      
      // Add error ID to response headers
      res.set('X-Error-ID', errorId);
    }
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

/**
 * Promise rejection handler
 * Captures unhandled promise rejections
 */
export const setupUnhandledRejectionTracking = () => {
  process.on('unhandledRejection', (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    error.name = 'UnhandledPromiseRejection';
    
    const context = {
      method: 'SYSTEM',
      path: 'unhandled-rejection',
      statusCode: 500,
      metadata: {
        promise: promise.toString(),
        reason: String(reason)
      }
    };
    
    const errorId = errorTracker.trackError(error, context);
    
    logger.error('Unhandled promise rejection tracked', {
      type: 'error_tracking',
      category: 'unhandled_rejection',
      errorId,
      reason: String(reason)
    });
  });
};

/**
 * Uncaught exception handler
 * Captures uncaught exceptions
 */
export const setupUncaughtExceptionTracking = () => {
  process.on('uncaughtException', (error) => {
    const context = {
      method: 'SYSTEM',
      path: 'uncaught-exception',
      statusCode: 500,
      metadata: {
        stack: error.stack
      }
    };
    
    const errorId = errorTracker.trackError(error, context);
    
    logger.error('Uncaught exception tracked', {
      type: 'error_tracking',
      category: 'uncaught_exception',
      errorId,
      message: error.message
    });
    
    // Give time for error to be processed before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
};

/**
 * Manual error tracking function
 * For tracking errors manually in application code
 */
export const trackError = (error, additionalContext = {}) => {
  const context = {
    method: 'MANUAL',
    path: 'manual-tracking',
    statusCode: 500,
    ...additionalContext
  };
  
  return errorTracker.trackError(error, context);
};

/**
 * Async wrapper for route handlers
 * Automatically catches and tracks async errors
 */
export const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      const context = {
        method: req.method,
        path: req.path,
        url: req.url,
        statusCode: 500,
        userId: req.user?.id,
        correlationId: req.correlationId || req.requestId,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        metadata: {
          routeHandler: fn.name || 'anonymous'
        }
      };
      
      const errorId = errorTracker.trackError(error, context);
      res.set('X-Error-ID', errorId);
      
      next(error);
    });
  };
};

/**
 * Database error tracking wrapper
 * Wraps database operations to track errors
 */
export const trackDatabaseError = async (operation, operationName = 'database_operation') => {
  try {
    return await operation();
  } catch (error) {
    const context = {
      method: 'DATABASE',
      path: operationName,
      statusCode: 500,
      metadata: {
        operation: operationName,
        errorCode: error.code,
        sqlState: error.sqlState
      }
    };
    
    const errorId = errorTracker.trackError(error, context);
    
    logger.error('Database error tracked', {
      type: 'error_tracking',
      category: 'database_error',
      errorId,
      operation: operationName,
      message: error.message
    });
    
    throw error; // Re-throw for normal error handling
  }
};

/**
 * External API error tracking wrapper
 * Wraps external API calls to track errors
 */
export const trackExternalAPIError = async (operation, apiName = 'external_api') => {
  try {
    return await operation();
  } catch (error) {
    const context = {
      method: 'EXTERNAL_API',
      path: apiName,
      statusCode: error.response?.status || 500,
      metadata: {
        api: apiName,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      }
    };
    
    const errorId = errorTracker.trackError(error, context);
    
    logger.error('External API error tracked', {
      type: 'error_tracking',
      category: 'external_api_error',
      errorId,
      api: apiName,
      message: error.message
    });
    
    throw error; // Re-throw for normal error handling
  }
};

/**
 * Sanitize request body for logging
 * Removes sensitive information
 */
function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Sanitize headers for logging
 * Removes sensitive headers
 */
function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return headers;
  }
  
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  const sanitized = { ...headers };
  
  for (const header of sensitiveHeaders) {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Get HTTP status message
 */
function getStatusMessage(statusCode) {
  const messages = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  return messages[statusCode] || 'Unknown Error';
}

export default {
  errorTrackingMiddleware,
  requestCompletionMiddleware,
  setupUnhandledRejectionTracking,
  setupUncaughtExceptionTracking,
  trackError,
  asyncErrorHandler,
  trackDatabaseError,
  trackExternalAPIError
};