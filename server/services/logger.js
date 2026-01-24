import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format with correlation IDs and structured data
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, correlationId, userId, requestId, service, ...metadata }) => {
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      correlationId: correlationId || generateCorrelationId(),
      service: service || 'bizgrow-ai',
      ...(userId && { userId }),
      ...(requestId && { requestId }),
      ...metadata
    };
    
    return JSON.stringify(logEntry);
  })
);

// Generate correlation ID for request tracking
function generateCorrelationId() {
  return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Create Winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'bizgrow-ai',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, correlationId, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${service}] ${level}: ${message} ${correlationId ? `[${correlationId}]` : ''} ${metaStr}`;
        })
      )
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'application.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      tailable: true
    }),

    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5,
      tailable: true
    }),

    // Separate file for security events
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf((info) => {
          // Only log security-related events
          if (info.type === 'security' || info.category === 'security' || 
              info.level === 'warn' || info.level === 'error') {
            return JSON.stringify(info);
          }
          return false;
        })
      )
    }),

    // Separate file for performance metrics
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 3,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf((info) => {
          // Only log performance-related events
          if (info.type === 'performance' || info.category === 'performance' || 
              info.responseTime || info.duration) {
            return JSON.stringify(info);
          }
          return false;
        })
      )
    })
  ],

  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 3
    })
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 3
    })
  ]
});

// Add HTTP transport for centralized logging in production
if (process.env.NODE_ENV === 'production' && process.env.LOG_AGGREGATION_URL) {
  logger.add(new winston.transports.Http({
    host: process.env.LOG_AGGREGATION_HOST || 'localhost',
    port: process.env.LOG_AGGREGATION_PORT || 3000,
    path: process.env.LOG_AGGREGATION_PATH || '/logs',
    ssl: process.env.LOG_AGGREGATION_SSL === 'true',
    auth: process.env.LOG_AGGREGATION_AUTH ? {
      username: process.env.LOG_AGGREGATION_USERNAME,
      password: process.env.LOG_AGGREGATION_PASSWORD
    } : undefined
  }));
}

// Add centralized logging for chat system
if (process.env.CHAT_LOGGING_ENABLED !== 'false') {
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'chat.log'),
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 5,
    tailable: true,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log chat-related events
        if (info.type === 'chat' || info.category === 'chat' || 
            info.chatId || info.messageId) {
          return JSON.stringify(info);
        }
        return false;
      })
    )
  }));
}

// Enhanced logging methods with context
class Logger {
  constructor(service = 'bizgrow-ai') {
    this.service = service;
    this.logger = logger;
  }

  // Create child logger with additional context
  child(context = {}) {
    return new Logger(this.service).withContext(context);
  }

  // Add context to all subsequent logs
  withContext(context = {}) {
    this.context = { ...this.context, ...context };
    return this;
  }

  // Log with correlation ID and context
  log(level, message, meta = {}) {
    const logMeta = {
      service: this.service,
      ...this.context,
      ...meta
    };

    this.logger.log(level, message, logMeta);
  }

  // Convenience methods for different log levels
  error(message, meta = {}) {
    this.log('error', message, { ...meta, type: 'error' });
  }

  warn(message, meta = {}) {
    this.log('warn', message, { ...meta, type: 'warning' });
  }

  info(message, meta = {}) {
    this.log('info', message, { ...meta, type: 'info' });
  }

  debug(message, meta = {}) {
    this.log('debug', message, { ...meta, type: 'debug' });
  }

  // Security-specific logging
  security(message, meta = {}) {
    this.log('warn', message, { 
      ...meta, 
      type: 'security', 
      category: 'security',
      severity: meta.severity || 'medium'
    });
  }

  // Performance-specific logging
  performance(message, meta = {}) {
    this.log('info', message, { 
      ...meta, 
      type: 'performance', 
      category: 'performance'
    });
  }

  // Business metrics logging
  business(message, meta = {}) {
    this.log('info', message, { 
      ...meta, 
      type: 'business', 
      category: 'business_metrics'
    });
  }

  // Audit logging for compliance
  audit(message, meta = {}) {
    this.log('info', message, { 
      ...meta, 
      type: 'audit', 
      category: 'audit',
      compliance: true
    });
  }

  // Request/Response logging
  request(req, res, duration, meta = {}) {
    const requestMeta = {
      ...meta,
      type: 'request',
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      correlationId: req.correlationId,
      requestId: req.requestId || req.correlationId
    };

    // Log different levels based on status code
    if (res.statusCode >= 500) {
      this.error(`${req.method} ${req.path} - ${res.statusCode}`, requestMeta);
    } else if (res.statusCode >= 400) {
      this.warn(`${req.method} ${req.path} - ${res.statusCode}`, requestMeta);
    } else {
      this.info(`${req.method} ${req.path} - ${res.statusCode}`, requestMeta);
    }
  }

  // Database operation logging
  database(operation, meta = {}) {
    this.log('debug', `Database operation: ${operation}`, {
      ...meta,
      type: 'database',
      category: 'database'
    });
  }

  // AI Agent operation logging
  agent(agentName, operation, meta = {}) {
    this.log('info', `Agent ${agentName}: ${operation}`, {
      ...meta,
      type: 'agent',
      category: 'ai_agent',
      agentName
    });
  }

  // Cache operation logging
  cache(operation, meta = {}) {
    this.log('debug', `Cache operation: ${operation}`, {
      ...meta,
      type: 'cache',
      category: 'cache'
    });
  }

  // External API call logging
  external(service, operation, meta = {}) {
    this.log('info', `External API ${service}: ${operation}`, {
      ...meta,
      type: 'external_api',
      category: 'external',
      externalService: service
    });
  }

  // Chat system logging
  chat(operation, meta = {}) {
    this.log('info', `Chat: ${operation}`, {
      ...meta,
      type: 'chat',
      category: 'chat'
    });
  }

  // WebSocket connection logging
  websocket(operation, meta = {}) {
    this.log('info', `WebSocket: ${operation}`, {
      ...meta,
      type: 'websocket',
      category: 'websocket'
    });
  }

  // Customer support logging
  support(operation, meta = {}) {
    this.log('info', `Support: ${operation}`, {
      ...meta,
      type: 'support',
      category: 'customer_support'
    });
  }
}

// Create default logger instance
const defaultLogger = new Logger();

// Log aggregation utilities
class LogAggregator {
  constructor() {
    this.metrics = {
      totalLogs: 0,
      errorCount: 0,
      warningCount: 0,
      requestCount: 0,
      securityEvents: 0,
      performanceEvents: 0
    };
    
    this.startTime = Date.now();
    
    // Track metrics
    logger.on('data', (info) => {
      this.metrics.totalLogs++;
      
      if (info.level === 'error') this.metrics.errorCount++;
      if (info.level === 'warn') this.metrics.warningCount++;
      if (info.type === 'request') this.metrics.requestCount++;
      if (info.type === 'security') this.metrics.securityEvents++;
      if (info.type === 'performance') this.metrics.performanceEvents++;
    });
  }

  // Get logging metrics
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    return {
      ...this.metrics,
      uptime,
      logsPerMinute: Math.round((this.metrics.totalLogs / uptime) * 60000),
      errorRate: this.metrics.totalLogs > 0 ? 
        (this.metrics.errorCount / this.metrics.totalLogs * 100).toFixed(2) : 0
    };
  }

  // Get recent logs by type
  async getRecentLogs(type = null, limit = 100) {
    // In a production environment, this would query a log aggregation service
    // For now, we'll return a placeholder
    return {
      type,
      limit,
      logs: [],
      message: 'Log aggregation service not configured. Logs are written to files.'
    };
  }

  // Search logs by criteria
  async searchLogs(criteria = {}) {
    // In a production environment, this would search through aggregated logs
    return {
      criteria,
      results: [],
      message: 'Log search service not configured. Use file-based log analysis.'
    };
  }

  // Generate log report
  generateReport(timeRange = '24h') {
    const metrics = this.getMetrics();
    
    return {
      timeRange,
      generatedAt: new Date().toISOString(),
      summary: {
        totalLogs: metrics.totalLogs,
        errorRate: `${metrics.errorRate}%`,
        averageLogsPerMinute: metrics.logsPerMinute,
        uptime: `${Math.round(metrics.uptime / 1000 / 60)} minutes`
      },
      breakdown: {
        errors: metrics.errorCount,
        warnings: metrics.warningCount,
        requests: metrics.requestCount,
        securityEvents: metrics.securityEvents,
        performanceEvents: metrics.performanceEvents
      },
      recommendations: this.generateRecommendations(metrics)
    };
  }

  // Generate recommendations based on log patterns
  generateRecommendations(metrics) {
    const recommendations = [];
    
    if (metrics.errorRate > 5) {
      recommendations.push({
        type: 'error_rate',
        severity: 'high',
        message: `Error rate is ${metrics.errorRate}%, consider investigating recent errors`
      });
    }
    
    if (metrics.securityEvents > 10) {
      recommendations.push({
        type: 'security',
        severity: 'medium',
        message: `${metrics.securityEvents} security events detected, review security logs`
      });
    }
    
    if (metrics.logsPerMinute > 1000) {
      recommendations.push({
        type: 'performance',
        severity: 'low',
        message: 'High log volume detected, consider adjusting log levels in production'
      });
    }
    
    return recommendations;
  }
}

// Create log aggregator instance
const logAggregator = new LogAggregator();

// Export logger and utilities
export default defaultLogger;
export { Logger, LogAggregator, logAggregator, generateCorrelationId };

// Export convenience methods for backward compatibility
export const log = defaultLogger.log.bind(defaultLogger);
export const error = defaultLogger.error.bind(defaultLogger);
export const warn = defaultLogger.warn.bind(defaultLogger);
export const info = defaultLogger.info.bind(defaultLogger);
export const debug = defaultLogger.debug.bind(defaultLogger);
export const security = defaultLogger.security.bind(defaultLogger);
export const performance = defaultLogger.performance.bind(defaultLogger);
export const business = defaultLogger.business.bind(defaultLogger);
export const audit = defaultLogger.audit.bind(defaultLogger);
export const chat = defaultLogger.chat.bind(defaultLogger);
export const websocket = defaultLogger.websocket.bind(defaultLogger);
export const support = defaultLogger.support.bind(defaultLogger);