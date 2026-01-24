import EventEmitter from 'events';
import nodemailer from 'nodemailer';
import logger from './logger.js';
import cacheService from './cacheService.js';

/**
 * Enhanced Error Tracking and Alerting Service
 * Provides centralized error tracking with detailed context capture,
 * stack trace collection, error correlation, and automated alerting
 */
class ErrorTracker extends EventEmitter {
  constructor() {
    super();
    
    // Error storage and correlation
    this.errors = new Map(); // errorId -> errorDetails
    this.errorCorrelations = new Map(); // correlationId -> [errorIds]
    this.errorPatterns = new Map(); // pattern -> count
    this.recentErrors = [];
    this.maxRecentErrors = 1000;
    
    // Alert configuration
    this.alertChannels = {
      email: {
        enabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
        transporter: null,
        recipients: (process.env.ALERT_EMAIL_RECIPIENTS || '').split(',').filter(Boolean)
      },
      webhook: {
        enabled: process.env.WEBHOOK_ALERTS_ENABLED === 'true',
        urls: (process.env.ALERT_WEBHOOK_URLS || '').split(',').filter(Boolean)
      },
      slack: {
        enabled: process.env.SLACK_ALERTS_ENABLED === 'true',
        webhookUrl: process.env.SLACK_WEBHOOK_URL
      }
    };
    
    // Alert thresholds and rate limiting
    this.alertThresholds = {
      errorRate: {
        warning: 0.05, // 5%
        critical: 0.10 // 10%
      },
      errorCount: {
        warning: 10, // 10 errors in 5 minutes
        critical: 25  // 25 errors in 5 minutes
      },
      timeWindow: 5 * 60 * 1000 // 5 minutes
    };
    
    this.alertCooldowns = new Map(); // alertType -> lastSentTime
    this.alertCooldownPeriod = 15 * 60 * 1000; // 15 minutes
    
    // Error analysis
    this.errorAnalysis = {
      topErrors: [],
      errorTrends: [],
      correlatedErrors: [],
      lastAnalysisTime: null
    };
    
    // Store interval IDs for cleanup
    this.intervals = [];
    
    this.initialize();
  }

  /**
   * Initialize error tracker
   */
  initialize() {
    logger.info('Error Tracker initializing', {
      type: 'error_tracker',
      category: 'service_startup'
    });

    // Initialize email transporter if enabled
    if (this.alertChannels.email.enabled) {
      this.initializeEmailTransporter();
    }

    // Start periodic analysis
    this.startPeriodicAnalysis();
    
    // Clean up old data periodically
    const cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 60000); // Every minute
    this.intervals.push(cleanupInterval);
  }

  /**
   * Initialize email transporter for alerts
   */
  initializeEmailTransporter() {
    try {
      this.alertChannels.email.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      logger.info('Email transporter initialized for error alerts', {
        type: 'error_tracker',
        category: 'email_setup'
      });
    } catch (error) {
      logger.error('Failed to initialize email transporter', {
        type: 'error_tracker',
        error: error.message
      });
    }
  }

  /**
   * Track a new error with detailed context
   */
  trackError(error, context = {}) {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();
    
    // Extract detailed error information
    const errorDetails = {
      id: errorId,
      timestamp,
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
      stack: error.stack || null,
      type: error.constructor.name,
      
      // Request context
      method: context.method,
      path: context.path,
      url: context.url,
      statusCode: context.statusCode,
      
      // User context
      userId: context.userId,
      sessionId: context.sessionId,
      correlationId: context.correlationId || this.generateCorrelationId(),
      
      // System context
      userAgent: context.userAgent,
      ip: context.ip,
      referer: context.referer,
      
      // Additional context
      metadata: context.metadata || {},
      
      // Error classification
      severity: this.classifyErrorSeverity(error, context),
      category: this.categorizeError(error, context),
      
      // Correlation tracking
      fingerprint: this.generateErrorFingerprint(error, context)
    };

    // Store error
    this.errors.set(errorId, errorDetails);
    this.recentErrors.push(errorDetails);
    
    // Maintain recent errors limit
    if (this.recentErrors.length > this.maxRecentErrors) {
      const removedError = this.recentErrors.shift();
      this.errors.delete(removedError.id);
    }

    // Track error correlations
    this.trackErrorCorrelation(errorDetails);
    
    // Track error patterns
    this.trackErrorPattern(errorDetails);
    
    // Log error with structured data
    logger.error('Error tracked', {
      type: 'error_tracker',
      category: 'error_tracked',
      errorId,
      errorType: errorDetails.type,
      severity: errorDetails.severity,
      correlationId: errorDetails.correlationId,
      fingerprint: errorDetails.fingerprint,
      ...context
    });

    // Check for alert conditions
    this.checkAlertConditions(errorDetails);
    
    // Emit event for real-time updates
    this.emit('errorTracked', errorDetails);
    
    // Cache recent error for quick access
    this.cacheRecentError(errorDetails);
    
    return errorId;
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate correlation ID
   */
  generateCorrelationId() {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate error fingerprint for correlation
   */
  generateErrorFingerprint(error, context) {
    const components = [
      error.name || 'Error',
      error.message || 'Unknown',
      context.path || 'unknown',
      context.method || 'unknown'
    ];
    
    // Create a simple hash of the components
    return components.join('|').replace(/[^a-zA-Z0-9|]/g, '').toLowerCase();
  }

  /**
   * Classify error severity
   */
  classifyErrorSeverity(error, context) {
    // Critical errors
    if (error.name === 'DatabaseError' || 
        error.name === 'SecurityError' ||
        context.statusCode >= 500) {
      return 'critical';
    }
    
    // High severity errors
    if (error.name === 'ValidationError' ||
        error.name === 'AuthenticationError' ||
        context.statusCode >= 400) {
      return 'high';
    }
    
    // Medium severity errors
    if (error.name === 'TimeoutError' ||
        error.name === 'NetworkError') {
      return 'medium';
    }
    
    // Default to low severity
    return 'low';
  }

  /**
   * Categorize error type
   */
  categorizeError(error, context) {
    if (context.path && context.path.includes('/api/auth')) {
      return 'authentication';
    }
    
    if (context.path && context.path.includes('/api/')) {
      return 'api';
    }
    
    if (error.name === 'DatabaseError') {
      return 'database';
    }
    
    if (error.name === 'NetworkError') {
      return 'network';
    }
    
    if (context.statusCode >= 500) {
      return 'server';
    }
    
    if (context.statusCode >= 400) {
      return 'client';
    }
    
    return 'general';
  }

  /**
   * Track error correlations
   */
  trackErrorCorrelation(errorDetails) {
    const correlationId = errorDetails.correlationId;
    
    if (!this.errorCorrelations.has(correlationId)) {
      this.errorCorrelations.set(correlationId, []);
    }
    
    this.errorCorrelations.get(correlationId).push(errorDetails.id);
    
    // Limit correlation tracking
    const correlatedErrors = this.errorCorrelations.get(correlationId);
    if (correlatedErrors.length > 50) {
      correlatedErrors.splice(0, correlatedErrors.length - 50);
    }
  }

  /**
   * Track error patterns
   */
  trackErrorPattern(errorDetails) {
    const pattern = errorDetails.fingerprint;
    
    if (!this.errorPatterns.has(pattern)) {
      this.errorPatterns.set(pattern, {
        count: 0,
        firstSeen: errorDetails.timestamp,
        lastSeen: errorDetails.timestamp,
        examples: []
      });
    }
    
    const patternData = this.errorPatterns.get(pattern);
    patternData.count++;
    patternData.lastSeen = errorDetails.timestamp;
    
    // Keep a few examples
    if (patternData.examples.length < 5) {
      patternData.examples.push({
        id: errorDetails.id,
        timestamp: errorDetails.timestamp,
        context: {
          path: errorDetails.path,
          userId: errorDetails.userId
        }
      });
    }
  }

  /**
   * Check alert conditions and send alerts if needed
   */
  async checkAlertConditions(errorDetails) {
    const now = Date.now();
    const timeWindow = this.alertThresholds.timeWindow;
    const recentErrors = this.recentErrors.filter(err => 
      new Date(err.timestamp).getTime() > now - timeWindow
    );

    // Check error count threshold
    if (recentErrors.length >= this.alertThresholds.errorCount.critical) {
      await this.sendAlert('error_count_critical', {
        type: 'error_count',
        severity: 'critical',
        count: recentErrors.length,
        timeWindow: timeWindow / 60000, // minutes
        recentError: errorDetails
      });
    } else if (recentErrors.length >= this.alertThresholds.errorCount.warning) {
      await this.sendAlert('error_count_warning', {
        type: 'error_count',
        severity: 'warning',
        count: recentErrors.length,
        timeWindow: timeWindow / 60000,
        recentError: errorDetails
      });
    }

    // Check for critical errors
    if (errorDetails.severity === 'critical') {
      await this.sendAlert('critical_error', {
        type: 'critical_error',
        severity: 'critical',
        error: errorDetails
      });
    }

    // Check for error pattern spikes
    const pattern = errorDetails.fingerprint;
    const patternData = this.errorPatterns.get(pattern);
    if (patternData && patternData.count >= 5) {
      const patternRecentCount = recentErrors.filter(err => 
        err.fingerprint === pattern
      ).length;
      
      if (patternRecentCount >= 5) {
        await this.sendAlert('error_pattern_spike', {
          type: 'error_pattern',
          severity: 'warning',
          pattern,
          count: patternRecentCount,
          totalCount: patternData.count,
          example: errorDetails
        });
      }
    }
  }

  /**
   * Send alert via configured channels
   */
  async sendAlert(alertType, alertData) {
    // Check cooldown
    const lastSent = this.alertCooldowns.get(alertType);
    const now = Date.now();
    
    if (lastSent && now - lastSent < this.alertCooldownPeriod) {
      return; // Skip due to cooldown
    }

    this.alertCooldowns.set(alertType, now);

    // Send to all enabled channels
    const promises = [];
    
    if (this.alertChannels.email.enabled) {
      promises.push(this.sendEmailAlert(alertType, alertData));
    }
    
    if (this.alertChannels.webhook.enabled) {
      promises.push(this.sendWebhookAlert(alertType, alertData));
    }
    
    if (this.alertChannels.slack.enabled) {
      promises.push(this.sendSlackAlert(alertType, alertData));
    }

    try {
      await Promise.allSettled(promises);
      
      logger.info('Alert sent', {
        type: 'error_tracker',
        category: 'alert_sent',
        alertType,
        severity: alertData.severity
      });
      
      this.emit('alertSent', { alertType, alertData });
    } catch (error) {
      logger.error('Failed to send alert', {
        type: 'error_tracker',
        category: 'alert_failed',
        alertType,
        error: error.message
      });
    }
  }

  /**
   * Send email alert
   */
  async sendEmailAlert(alertType, alertData) {
    if (!this.alertChannels.email.transporter || 
        this.alertChannels.email.recipients.length === 0) {
      return;
    }

    const subject = this.generateEmailSubject(alertType, alertData);
    const html = this.generateEmailBody(alertType, alertData);

    const mailOptions = {
      from: process.env.SMTP_FROM || 'alerts@bizgrow-ai.com',
      to: this.alertChannels.email.recipients.join(','),
      subject,
      html
    };

    await this.alertChannels.email.transporter.sendMail(mailOptions);
  }

  /**
   * Send webhook alert
   */
  async sendWebhookAlert(alertType, alertData) {
    const payload = {
      alertType,
      timestamp: new Date().toISOString(),
      service: 'bizgrow-ai',
      ...alertData
    };

    const promises = this.alertChannels.webhook.urls.map(async (url) => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'BizGrow-AI-ErrorTracker/1.0'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status}`);
        }
      } catch (error) {
        logger.error('Webhook alert failed', {
          type: 'error_tracker',
          url,
          error: error.message
        });
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Send Slack alert
   */
  async sendSlackAlert(alertType, alertData) {
    if (!this.alertChannels.slack.webhookUrl) {
      return;
    }

    const payload = {
      text: this.generateSlackMessage(alertType, alertData),
      attachments: [{
        color: alertData.severity === 'critical' ? 'danger' : 'warning',
        fields: this.generateSlackFields(alertType, alertData),
        timestamp: Math.floor(Date.now() / 1000)
      }]
    };

    try {
      const response = await fetch(this.alertChannels.slack.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Slack alert failed', {
        type: 'error_tracker',
        error: error.message
      });
    }
  }

  /**
   * Generate email subject
   */
  generateEmailSubject(alertType, alertData) {
    const severity = alertData.severity.toUpperCase();
    
    switch (alertType) {
      case 'error_count_critical':
      case 'error_count_warning':
        return `[${severity}] High Error Rate Detected - ${alertData.count} errors in ${alertData.timeWindow} minutes`;
      case 'critical_error':
        return `[CRITICAL] Critical Error: ${alertData.error.message}`;
      case 'error_pattern_spike':
        return `[WARNING] Error Pattern Spike: ${alertData.count} similar errors`;
      default:
        return `[${severity}] BizGrow AI Alert`;
    }
  }

  /**
   * Generate email body
   */
  generateEmailBody(alertType, alertData) {
    let html = `
      <h2>BizGrow AI Error Alert</h2>
      <p><strong>Alert Type:</strong> ${alertType}</p>
      <p><strong>Severity:</strong> ${alertData.severity}</p>
      <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
    `;

    switch (alertType) {
      case 'error_count_critical':
      case 'error_count_warning':
        html += `
          <h3>Error Count Alert</h3>
          <p><strong>Error Count:</strong> ${alertData.count}</p>
          <p><strong>Time Window:</strong> ${alertData.timeWindow} minutes</p>
          <h4>Most Recent Error:</h4>
          <pre>${JSON.stringify(alertData.recentError, null, 2)}</pre>
        `;
        break;
      case 'critical_error':
        html += `
          <h3>Critical Error</h3>
          <p><strong>Message:</strong> ${alertData.error.message}</p>
          <p><strong>Path:</strong> ${alertData.error.path}</p>
          <p><strong>User ID:</strong> ${alertData.error.userId || 'N/A'}</p>
          <h4>Stack Trace:</h4>
          <pre>${alertData.error.stack || 'No stack trace available'}</pre>
        `;
        break;
      case 'error_pattern_spike':
        html += `
          <h3>Error Pattern Spike</h3>
          <p><strong>Pattern:</strong> ${alertData.pattern}</p>
          <p><strong>Recent Count:</strong> ${alertData.count}</p>
          <p><strong>Total Count:</strong> ${alertData.totalCount}</p>
          <h4>Example Error:</h4>
          <pre>${JSON.stringify(alertData.example, null, 2)}</pre>
        `;
        break;
    }

    return html;
  }

  /**
   * Generate Slack message
   */
  generateSlackMessage(alertType, alertData) {
    switch (alertType) {
      case 'error_count_critical':
      case 'error_count_warning':
        return `🚨 High error rate detected: ${alertData.count} errors in ${alertData.timeWindow} minutes`;
      case 'critical_error':
        return `💥 Critical error: ${alertData.error.message}`;
      case 'error_pattern_spike':
        return `📈 Error pattern spike: ${alertData.count} similar errors detected`;
      default:
        return `⚠️ BizGrow AI Alert: ${alertType}`;
    }
  }

  /**
   * Generate Slack fields
   */
  generateSlackFields(alertType, alertData) {
    const fields = [
      {
        title: 'Severity',
        value: alertData.severity,
        short: true
      },
      {
        title: 'Time',
        value: new Date().toLocaleString(),
        short: true
      }
    ];

    if (alertData.error) {
      fields.push({
        title: 'Error Path',
        value: alertData.error.path || 'N/A',
        short: true
      });
    }

    return fields;
  }

  /**
   * Start periodic error analysis
   */
  startPeriodicAnalysis() {
    // Run analysis every 5 minutes
    const analysisInterval = setInterval(() => {
      this.performErrorAnalysis();
    }, 5 * 60 * 1000);
    this.intervals.push(analysisInterval);
  }

  /**
   * Perform error analysis
   */
  performErrorAnalysis() {
    try {
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      const recentErrors = this.recentErrors.filter(err => 
        new Date(err.timestamp).getTime() > now - oneHour
      );

      // Analyze top errors
      const errorCounts = new Map();
      recentErrors.forEach(err => {
        const key = err.fingerprint;
        errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
      });

      this.errorAnalysis.topErrors = Array.from(errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([fingerprint, count]) => ({
          fingerprint,
          count,
          pattern: this.errorPatterns.get(fingerprint)
        }));

      // Analyze error trends (simplified)
      this.errorAnalysis.errorTrends = this.calculateErrorTrends(recentErrors);
      
      // Find correlated errors
      this.errorAnalysis.correlatedErrors = this.findCorrelatedErrors();
      
      this.errorAnalysis.lastAnalysisTime = new Date().toISOString();

      logger.info('Error analysis completed', {
        type: 'error_tracker',
        category: 'analysis',
        topErrorsCount: this.errorAnalysis.topErrors.length,
        totalRecentErrors: recentErrors.length
      });

      this.emit('analysisCompleted', this.errorAnalysis);
    } catch (error) {
      logger.error('Error analysis failed', {
        type: 'error_tracker',
        error: error.message
      });
    }
  }

  /**
   * Calculate error trends
   */
  calculateErrorTrends(recentErrors) {
    // Simple trend calculation - errors per 10-minute window
    const windows = 6; // 1 hour / 10 minutes
    const windowSize = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();
    
    const trends = [];
    for (let i = 0; i < windows; i++) {
      const windowStart = now - (i + 1) * windowSize;
      const windowEnd = now - i * windowSize;
      
      const windowErrors = recentErrors.filter(err => {
        const errorTime = new Date(err.timestamp).getTime();
        return errorTime >= windowStart && errorTime < windowEnd;
      });
      
      trends.unshift({
        window: new Date(windowStart).toISOString(),
        count: windowErrors.length
      });
    }
    
    return trends;
  }

  /**
   * Find correlated errors
   */
  findCorrelatedErrors() {
    const correlations = [];
    
    for (const [correlationId, errorIds] of this.errorCorrelations) {
      if (errorIds.length > 1) {
        const errors = errorIds.map(id => this.errors.get(id)).filter(Boolean);
        if (errors.length > 1) {
          correlations.push({
            correlationId,
            errorCount: errors.length,
            timeSpan: this.calculateTimeSpan(errors),
            errorTypes: [...new Set(errors.map(e => e.type))]
          });
        }
      }
    }
    
    return correlations.sort((a, b) => b.errorCount - a.errorCount).slice(0, 10);
  }

  /**
   * Calculate time span for correlated errors
   */
  calculateTimeSpan(errors) {
    const times = errors.map(e => new Date(e.timestamp).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    return max - min;
  }

  /**
   * Cache recent error for quick access
   */
  async cacheRecentError(errorDetails) {
    try {
      await cacheService.set('errors', `recent_${errorDetails.id}`, errorDetails, {}, 3600); // 1 hour TTL
    } catch (error) {
      // Ignore cache errors
    }
  }

  /**
   * Clean up old data
   */
  cleanupOldData() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    // Clean up old error correlations
    for (const [correlationId, errorIds] of this.errorCorrelations) {
      const validErrorIds = errorIds.filter(id => this.errors.has(id));
      if (validErrorIds.length === 0) {
        this.errorCorrelations.delete(correlationId);
      } else {
        this.errorCorrelations.set(correlationId, validErrorIds);
      }
    }
    
    // Clean up old error patterns
    for (const [pattern, data] of this.errorPatterns) {
      const lastSeenTime = new Date(data.lastSeen).getTime();
      if (now - lastSeenTime > oneDay) {
        this.errorPatterns.delete(pattern);
      }
    }
    
    // Clean up old alert cooldowns
    for (const [alertType, lastSent] of this.alertCooldowns) {
      if (now - lastSent > this.alertCooldownPeriod * 2) {
        this.alertCooldowns.delete(alertType);
      }
    }
  }

  /**
   * Get error by ID
   */
  getError(errorId) {
    return this.errors.get(errorId);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 100) {
    return this.recentErrors.slice(-limit);
  }

  /**
   * Get errors by correlation ID
   */
  getCorrelatedErrors(correlationId) {
    const errorIds = this.errorCorrelations.get(correlationId) || [];
    return errorIds.map(id => this.errors.get(id)).filter(Boolean);
  }

  /**
   * Get error analysis
   */
  getErrorAnalysis() {
    return this.errorAnalysis;
  }

  /**
   * Get error statistics
   */
  getErrorStatistics() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    
    const recentErrors = this.recentErrors.filter(err => 
      new Date(err.timestamp).getTime() > now - oneHour
    );
    
    const dailyErrors = this.recentErrors.filter(err => 
      new Date(err.timestamp).getTime() > now - oneDay
    );

    return {
      total: this.recentErrors.length,
      lastHour: recentErrors.length,
      lastDay: dailyErrors.length,
      patterns: this.errorPatterns.size,
      correlations: this.errorCorrelations.size,
      topPatterns: Array.from(this.errorPatterns.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([pattern, data]) => ({ pattern, count: data.count }))
    };
  }

  /**
   * Generate error report
   */
  generateErrorReport(timeRange = '24h') {
    const now = Date.now();
    let cutoffTime;
    
    switch (timeRange) {
      case '1h':
        cutoffTime = now - 60 * 60 * 1000;
        break;
      case '6h':
        cutoffTime = now - 6 * 60 * 60 * 1000;
        break;
      case '24h':
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      case '7d':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        cutoffTime = now - 24 * 60 * 60 * 1000;
    }
    
    const errors = this.recentErrors.filter(err => 
      new Date(err.timestamp).getTime() > cutoffTime
    );

    return {
      timeRange,
      generatedAt: new Date().toISOString(),
      summary: {
        totalErrors: errors.length,
        uniquePatterns: new Set(errors.map(e => e.fingerprint)).size,
        severityBreakdown: this.getSeverityBreakdown(errors),
        categoryBreakdown: this.getCategoryBreakdown(errors)
      },
      topErrors: this.getTopErrorPatterns(errors),
      errorTrends: this.calculateErrorTrends(errors),
      correlatedErrors: this.findCorrelatedErrors(),
      analysis: this.errorAnalysis,
      recommendations: this.generateRecommendations(errors)
    };
  }

  /**
   * Get severity breakdown
   */
  getSeverityBreakdown(errors) {
    const breakdown = { critical: 0, high: 0, medium: 0, low: 0 };
    errors.forEach(err => {
      breakdown[err.severity] = (breakdown[err.severity] || 0) + 1;
    });
    return breakdown;
  }

  /**
   * Get category breakdown
   */
  getCategoryBreakdown(errors) {
    const breakdown = {};
    errors.forEach(err => {
      breakdown[err.category] = (breakdown[err.category] || 0) + 1;
    });
    return breakdown;
  }

  /**
   * Get top error patterns
   */
  getTopErrorPatterns(errors) {
    const patterns = new Map();
    errors.forEach(err => {
      const key = err.fingerprint;
      if (!patterns.has(key)) {
        patterns.set(key, {
          fingerprint: key,
          count: 0,
          message: err.message,
          type: err.type,
          category: err.category,
          severity: err.severity,
          examples: []
        });
      }
      const pattern = patterns.get(key);
      pattern.count++;
      if (pattern.examples.length < 3) {
        pattern.examples.push({
          id: err.id,
          timestamp: err.timestamp,
          path: err.path,
          userId: err.userId
        });
      }
    });
    
    return Array.from(patterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Generate recommendations based on error patterns
   */
  generateRecommendations(errors) {
    const recommendations = [];
    
    // High error rate recommendation
    if (errors.length > 50) {
      recommendations.push({
        type: 'error_rate',
        priority: 'high',
        title: 'High Error Rate Detected',
        description: `${errors.length} errors detected in the selected time range`,
        actions: [
          'Review error patterns for common causes',
          'Check system resources and performance',
          'Implement additional error handling',
          'Consider scaling infrastructure'
        ]
      });
    }
    
    // Critical errors recommendation
    const criticalErrors = errors.filter(e => e.severity === 'critical');
    if (criticalErrors.length > 0) {
      recommendations.push({
        type: 'critical_errors',
        priority: 'critical',
        title: 'Critical Errors Require Immediate Attention',
        description: `${criticalErrors.length} critical errors detected`,
        actions: [
          'Investigate critical errors immediately',
          'Check database connectivity and health',
          'Verify external service dependencies',
          'Review security logs for potential issues'
        ]
      });
    }
    
    // Pattern-based recommendations
    const patterns = this.getTopErrorPatterns(errors);
    const topPattern = patterns[0];
    if (topPattern && topPattern.count > 10) {
      recommendations.push({
        type: 'error_pattern',
        priority: 'medium',
        title: 'Recurring Error Pattern Detected',
        description: `Error pattern "${topPattern.message}" occurred ${topPattern.count} times`,
        actions: [
          'Investigate root cause of recurring error',
          'Implement specific error handling for this pattern',
          'Add monitoring for this error type',
          'Consider code refactoring to prevent recurrence'
        ]
      });
    }
    
    return recommendations;
  }

  /**
   * Cleanup method to stop all intervals and timers
   * Used for testing and graceful shutdown
   */
  cleanup() {
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    // Remove all event listeners
    this.removeAllListeners();
    
    logger.info('Error Tracker cleaned up', {
      type: 'error_tracker',
      category: 'service_shutdown'
    });
  }
}

// Create singleton instance
const errorTracker = new ErrorTracker();

export default errorTracker;
export { ErrorTracker };