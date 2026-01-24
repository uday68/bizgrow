import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import logger from './logger.js';

// Log aggregation and analysis service
class LogAggregationService {
  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.logFiles = {
      application: path.join(this.logsDir, 'application.log'),
      error: path.join(this.logsDir, 'error.log'),
      security: path.join(this.logsDir, 'security.log'),
      performance: path.join(this.logsDir, 'performance.log'),
      exceptions: path.join(this.logsDir, 'exceptions.log'),
      rejections: path.join(this.logsDir, 'rejections.log')
    };
    
    this.metrics = {
      totalLogs: 0,
      errorCount: 0,
      warningCount: 0,
      securityEvents: 0,
      performanceIssues: 0,
      lastUpdated: Date.now()
    };
    
    this.alerts = [];
    this.patterns = this.initializePatterns();
    
    // Start periodic analysis
    this.startPeriodicAnalysis();
  }

  // Initialize log analysis patterns
  initializePatterns() {
    return {
      security: [
        /authentication.*(failed|failure|denied)/i,
        /suspicious.*activity/i,
        /rate.*limit.*exceeded/i,
        /sql.*injection/i,
        /xss.*attempt/i,
        /unauthorized.*access/i
      ],
      performance: [
        /slow.*request/i,
        /timeout/i,
        /memory.*usage.*high/i,
        /cpu.*usage.*high/i,
        /database.*slow/i,
        /response.*time.*exceeded/i
      ],
      errors: [
        /error/i,
        /exception/i,
        /failed/i,
        /crash/i,
        /fatal/i
      ],
      business: [
        /business.*discovered/i,
        /proposal.*sent/i,
        /project.*built/i,
        /conversion/i,
        /revenue/i
      ]
    };
  }

  // Start periodic log analysis
  startPeriodicAnalysis() {
    // Analyze logs every 5 minutes
    setInterval(() => {
      this.analyzeRecentLogs().catch(error => {
        logger.error('Log analysis failed', { error: error.message });
      });
    }, 5 * 60 * 1000);

    // Generate daily reports
    setInterval(() => {
      this.generateDailyReport().catch(error => {
        logger.error('Daily report generation failed', { error: error.message });
      });
    }, 24 * 60 * 60 * 1000);
  }

  // Analyze recent logs for patterns and anomalies
  async analyzeRecentLogs(timeWindow = 5 * 60 * 1000) { // 5 minutes
    const cutoffTime = Date.now() - timeWindow;
    const analysis = {
      timestamp: new Date().toISOString(),
      timeWindow: `${timeWindow / 1000 / 60} minutes`,
      findings: {
        security: [],
        performance: [],
        errors: [],
        business: []
      },
      metrics: {
        totalLogs: 0,
        errorRate: 0,
        securityEvents: 0,
        performanceIssues: 0
      },
      alerts: []
    };

    try {
      // Analyze each log file
      for (const [type, filePath] of Object.entries(this.logFiles)) {
        if (fs.existsSync(filePath)) {
          const recentLogs = await this.readRecentLogs(filePath, cutoffTime);
          const typeAnalysis = await this.analyzeLogEntries(recentLogs, type);
          
          // Merge findings
          Object.keys(analysis.findings).forEach(category => {
            if (typeAnalysis.findings[category]) {
              analysis.findings[category].push(...typeAnalysis.findings[category]);
            }
          });
          
          // Update metrics
          analysis.metrics.totalLogs += typeAnalysis.metrics.totalLogs;
          analysis.metrics.errorRate += typeAnalysis.metrics.errorRate;
          analysis.metrics.securityEvents += typeAnalysis.metrics.securityEvents;
          analysis.metrics.performanceIssues += typeAnalysis.metrics.performanceIssues;
        }
      }

      // Calculate final metrics
      if (analysis.metrics.totalLogs > 0) {
        analysis.metrics.errorRate = (analysis.metrics.errorRate / analysis.metrics.totalLogs * 100).toFixed(2);
      }

      // Generate alerts based on findings
      analysis.alerts = this.generateAlerts(analysis);

      // Store analysis results
      await this.storeAnalysis(analysis);

      // Log analysis summary
      logger.info('Log analysis completed', {
        type: 'log_analysis',
        totalLogs: analysis.metrics.totalLogs,
        errorRate: analysis.metrics.errorRate,
        securityEvents: analysis.metrics.securityEvents,
        alertsGenerated: analysis.alerts.length
      });

      return analysis;
    } catch (error) {
      logger.error('Log analysis failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  // Read recent log entries from a file
  async readRecentLogs(filePath, cutoffTime) {
    const logs = [];
    
    if (!fs.existsSync(filePath)) {
      return logs;
    }

    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        const logEntry = JSON.parse(line);
        const logTime = new Date(logEntry.timestamp).getTime();
        
        if (logTime >= cutoffTime) {
          logs.push(logEntry);
        }
      } catch (error) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return logs;
  }

  // Analyze log entries for patterns
  async analyzeLogEntries(logs, logType) {
    const analysis = {
      findings: {
        security: [],
        performance: [],
        errors: [],
        business: []
      },
      metrics: {
        totalLogs: logs.length,
        errorRate: 0,
        securityEvents: 0,
        performanceIssues: 0
      }
    };

    for (const log of logs) {
      // Count errors
      if (log.level === 'ERROR') {
        analysis.metrics.errorRate++;
      }

      // Analyze message content
      const message = log.message?.toLowerCase() || '';
      
      // Check security patterns
      for (const pattern of this.patterns.security) {
        if (pattern.test(message)) {
          analysis.findings.security.push({
            timestamp: log.timestamp,
            message: log.message,
            correlationId: log.correlationId,
            severity: this.determineSeverity(log, 'security'),
            pattern: pattern.source
          });
          analysis.metrics.securityEvents++;
          break;
        }
      }

      // Check performance patterns
      for (const pattern of this.patterns.performance) {
        if (pattern.test(message)) {
          analysis.findings.performance.push({
            timestamp: log.timestamp,
            message: log.message,
            correlationId: log.correlationId,
            duration: log.duration || log.responseTime,
            severity: this.determineSeverity(log, 'performance'),
            pattern: pattern.source
          });
          analysis.metrics.performanceIssues++;
          break;
        }
      }

      // Check error patterns
      for (const pattern of this.patterns.errors) {
        if (pattern.test(message)) {
          analysis.findings.errors.push({
            timestamp: log.timestamp,
            message: log.message,
            correlationId: log.correlationId,
            error: log.error || log.errorMessage,
            severity: this.determineSeverity(log, 'error'),
            pattern: pattern.source
          });
          break;
        }
      }

      // Check business patterns
      for (const pattern of this.patterns.business) {
        if (pattern.test(message)) {
          analysis.findings.business.push({
            timestamp: log.timestamp,
            message: log.message,
            correlationId: log.correlationId,
            value: log.value || log.count,
            pattern: pattern.source
          });
          break;
        }
      }
    }

    return analysis;
  }

  // Determine severity based on log content
  determineSeverity(log, category) {
    const level = log.level?.toUpperCase();
    const message = log.message?.toLowerCase() || '';

    // Base severity on log level
    let severity = 'low';
    if (level === 'ERROR') severity = 'high';
    else if (level === 'WARN') severity = 'medium';

    // Adjust based on category and content
    if (category === 'security') {
      if (message.includes('sql injection') || message.includes('xss')) {
        severity = 'critical';
      } else if (message.includes('unauthorized') || message.includes('failed')) {
        severity = 'high';
      }
    } else if (category === 'performance') {
      const duration = log.duration || log.responseTime || 0;
      if (duration > 5000) severity = 'high';
      else if (duration > 2000) severity = 'medium';
    }

    return severity;
  }

  // Generate alerts based on analysis findings
  generateAlerts(analysis) {
    const alerts = [];
    const now = new Date().toISOString();

    // Security alerts
    const criticalSecurity = analysis.findings.security.filter(f => f.severity === 'critical');
    if (criticalSecurity.length > 0) {
      alerts.push({
        id: `security_critical_${Date.now()}`,
        type: 'security',
        severity: 'critical',
        title: 'Critical Security Events Detected',
        message: `${criticalSecurity.length} critical security events detected`,
        timestamp: now,
        details: criticalSecurity.slice(0, 5), // Include first 5 events
        actionRequired: true
      });
    }

    // High error rate alert
    if (parseFloat(analysis.metrics.errorRate) > 10) {
      alerts.push({
        id: `error_rate_${Date.now()}`,
        type: 'error',
        severity: 'high',
        title: 'High Error Rate Detected',
        message: `Error rate is ${analysis.metrics.errorRate}%`,
        timestamp: now,
        details: { errorRate: analysis.metrics.errorRate, totalLogs: analysis.metrics.totalLogs },
        actionRequired: true
      });
    }

    // Performance issues alert
    if (analysis.metrics.performanceIssues > 10) {
      alerts.push({
        id: `performance_${Date.now()}`,
        type: 'performance',
        severity: 'medium',
        title: 'Performance Issues Detected',
        message: `${analysis.metrics.performanceIssues} performance issues detected`,
        timestamp: now,
        details: analysis.findings.performance.slice(0, 5),
        actionRequired: false
      });
    }

    // Store alerts
    this.alerts.push(...alerts);

    // Keep only recent alerts (last 24 hours)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(alert => 
      new Date(alert.timestamp).getTime() > dayAgo
    );

    return alerts;
  }

  // Store analysis results
  async storeAnalysis(analysis) {
    const analysisFile = path.join(this.logsDir, 'analysis.json');
    
    try {
      let existingAnalysis = [];
      if (fs.existsSync(analysisFile)) {
        const content = fs.readFileSync(analysisFile, 'utf8');
        existingAnalysis = JSON.parse(content);
      }

      // Keep only last 100 analyses
      existingAnalysis.push(analysis);
      if (existingAnalysis.length > 100) {
        existingAnalysis = existingAnalysis.slice(-100);
      }

      fs.writeFileSync(analysisFile, JSON.stringify(existingAnalysis, null, 2));
    } catch (error) {
      logger.error('Failed to store analysis results', { error: error.message });
    }
  }

  // Generate daily report
  async generateDailyReport() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const report = {
      date: yesterday.toISOString().split('T')[0],
      generatedAt: new Date().toISOString(),
      summary: {
        totalLogs: 0,
        errors: 0,
        warnings: 0,
        securityEvents: 0,
        performanceIssues: 0,
        businessEvents: 0
      },
      topErrors: [],
      securitySummary: [],
      performanceSummary: [],
      businessMetrics: [],
      recommendations: []
    };

    try {
      // Analyze logs from yesterday
      const cutoffTime = yesterday.getTime();
      const endTime = today.getTime();

      for (const [type, filePath] of Object.entries(this.logFiles)) {
        if (fs.existsSync(filePath)) {
          const logs = await this.readLogsByTimeRange(filePath, cutoffTime, endTime);
          const analysis = await this.analyzeLogEntries(logs, type);
          
          // Update summary
          report.summary.totalLogs += analysis.metrics.totalLogs;
          report.summary.errors += analysis.metrics.errorRate;
          report.summary.securityEvents += analysis.metrics.securityEvents;
          report.summary.performanceIssues += analysis.metrics.performanceIssues;
          
          // Collect findings
          report.topErrors.push(...analysis.findings.errors);
          report.securitySummary.push(...analysis.findings.security);
          report.performanceSummary.push(...analysis.findings.performance);
          report.businessMetrics.push(...analysis.findings.business);
        }
      }

      // Generate recommendations
      report.recommendations = this.generateRecommendations(report);

      // Save daily report
      const reportsDir = path.join(this.logsDir, 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const reportFile = path.join(reportsDir, `daily-report-${report.date}.json`);
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

      logger.info('Daily report generated', {
        type: 'daily_report',
        date: report.date,
        totalLogs: report.summary.totalLogs,
        errors: report.summary.errors,
        securityEvents: report.summary.securityEvents
      });

      return report;
    } catch (error) {
      logger.error('Daily report generation failed', { error: error.message });
      throw error;
    }
  }

  // Read logs by time range
  async readLogsByTimeRange(filePath, startTime, endTime) {
    const logs = [];
    
    if (!fs.existsSync(filePath)) {
      return logs;
    }

    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        const logEntry = JSON.parse(line);
        const logTime = new Date(logEntry.timestamp).getTime();
        
        if (logTime >= startTime && logTime < endTime) {
          logs.push(logEntry);
        }
      } catch (error) {
        continue;
      }
    }

    return logs;
  }

  // Generate recommendations based on report data
  generateRecommendations(report) {
    const recommendations = [];

    // Error rate recommendations
    const errorRate = report.summary.totalLogs > 0 ? 
      (report.summary.errors / report.summary.totalLogs * 100) : 0;
    
    if (errorRate > 5) {
      recommendations.push({
        type: 'error_rate',
        priority: 'high',
        title: 'High Error Rate',
        description: `Error rate is ${errorRate.toFixed(2)}%. Consider investigating recent errors.`,
        action: 'Review error logs and fix underlying issues'
      });
    }

    // Security recommendations
    if (report.summary.securityEvents > 10) {
      recommendations.push({
        type: 'security',
        priority: 'high',
        title: 'Security Events',
        description: `${report.summary.securityEvents} security events detected.`,
        action: 'Review security logs and strengthen security measures'
      });
    }

    // Performance recommendations
    if (report.summary.performanceIssues > 20) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Performance Issues',
        description: `${report.summary.performanceIssues} performance issues detected.`,
        action: 'Optimize slow endpoints and database queries'
      });
    }

    // Log volume recommendations
    if (report.summary.totalLogs > 100000) {
      recommendations.push({
        type: 'log_volume',
        priority: 'low',
        title: 'High Log Volume',
        description: `${report.summary.totalLogs} logs generated. Consider adjusting log levels.`,
        action: 'Review log levels and reduce verbose logging in production'
      });
    }

    return recommendations;
  }

  // Get current alerts
  getActiveAlerts() {
    return this.alerts.filter(alert => {
      const alertTime = new Date(alert.timestamp).getTime();
      const hourAgo = Date.now() - 60 * 60 * 1000;
      return alertTime > hourAgo;
    });
  }

  // Get log metrics
  getMetrics() {
    return {
      ...this.metrics,
      activeAlerts: this.getActiveAlerts().length,
      lastAnalysis: this.metrics.lastUpdated
    };
  }

  // Search logs by criteria
  async searchLogs(criteria = {}) {
    const {
      level,
      type,
      correlationId,
      userId,
      timeRange = '1h',
      limit = 100,
      pattern
    } = criteria;

    const results = [];
    const timeRangeMs = this.parseTimeRange(timeRange);
    const cutoffTime = Date.now() - timeRangeMs;

    try {
      for (const [logType, filePath] of Object.entries(this.logFiles)) {
        if (fs.existsSync(filePath)) {
          const logs = await this.readRecentLogs(filePath, cutoffTime);
          
          const filtered = logs.filter(log => {
            if (level && log.level !== level.toUpperCase()) return false;
            if (type && log.type !== type) return false;
            if (correlationId && log.correlationId !== correlationId) return false;
            if (userId && log.userId !== userId) return false;
            if (pattern && !new RegExp(pattern, 'i').test(log.message)) return false;
            return true;
          });

          results.push(...filtered);
        }
      }

      // Sort by timestamp and limit results
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return results.slice(0, limit);
    } catch (error) {
      logger.error('Log search failed', { error: error.message, criteria });
      throw error;
    }
  }

  // Parse time range string to milliseconds
  parseTimeRange(timeRange) {
    const match = timeRange.match(/^(\d+)([smhd])$/);
    if (!match) return 60 * 60 * 1000; // Default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }
}

// Create and export singleton instance
const logAggregationService = new LogAggregationService();

export default logAggregationService;
export { LogAggregationService };