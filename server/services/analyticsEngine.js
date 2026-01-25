import { getDatabaseType, getDatabase } from '../database/init.js';
import cacheService from './cacheService.js';
import logger from './logger.js';

/**
 * Business Metrics and Analytics Engine
 * Tracks business metrics, provides predictive analytics, and detects anomalies
 */
class AnalyticsEngine {
  constructor() {
    this.metrics = {
      businessEvents: [],
      conversionRates: new Map(),
      revenue: new Map(),
      userBehavior: new Map(),
      systemUsage: new Map()
    };
    this.anomalyThresholds = {
      conversionRateChange: 0.3, // 30% change
      revenueChange: 0.4, // 40% change
      errorRateChange: 0.5, // 50% change
      responseTimeChange: 0.6 // 60% change
    };
    this.historicalData = [];
    this.predictions = new Map();
  }

  /**
   * Track business event
   */
  async trackBusinessEvent(eventType, eventData) {
    try {
      const event = {
        type: eventType,
        data: eventData,
        timestamp: new Date().toISOString(),
        userId: eventData.userId || null,
        sessionId: eventData.sessionId || null
      };

      this.metrics.businessEvents.push(event);

      // Keep only last 10000 events in memory
      if (this.metrics.businessEvents.length > 10000) {
        this.metrics.businessEvents = this.metrics.businessEvents.slice(-10000);
      }

      // Store in database
      const db = getDatabase();
      const dbType = getDatabaseType();

      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO business_events (event_type, event_data, user_id, session_id, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [eventType, JSON.stringify(eventData), eventData.userId, eventData.sessionId, event.timestamp]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO business_events (event_type, event_data, user_id, session_id, created_at)
            VALUES (?, ?, ?, ?, ?)
          `, [eventType, JSON.stringify(eventData), eventData.userId, eventData.sessionId, event.timestamp], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Update real-time metrics
      await this.updateMetrics(eventType, eventData);

      logger.info('Business event tracked', {
        type: 'analytics',
        eventType,
        userId: eventData.userId
      });

      return event;
    } catch (error) {
      logger.error('Failed to track business event', {
        type: 'analytics',
        error: error.message,
        eventType
      });
      throw error;
    }
  }

  /**
   * Update real-time metrics based on event
   */
  async updateMetrics(eventType, eventData) {
    const today = new Date().toISOString().split('T')[0];

    switch (eventType) {
      case 'business_discovered':
        await this.incrementMetric('businesses_discovered', today);
        break;
      
      case 'proposal_sent':
        await this.incrementMetric('proposals_sent', today);
        break;
      
      case 'proposal_accepted':
        await this.incrementMetric('proposals_accepted', today);
        await this.updateConversionRate(today);
        break;
      
      case 'project_completed':
        await this.incrementMetric('projects_completed', today);
        if (eventData.revenue) {
          await this.addRevenue(today, eventData.revenue);
        }
        break;
      
      case 'user_signup':
        await this.incrementMetric('user_signups', today);
        break;
      
      case 'user_login':
        await this.incrementMetric('user_logins', today);
        this.trackUserBehavior(eventData.userId, 'login');
        break;
      
      case 'api_call':
        await this.incrementMetric('api_calls', today);
        this.trackSystemUsage('api_calls', eventData);
        break;
      
      case 'error_occurred':
        await this.incrementMetric('errors', today);
        break;
    }

    // Cache updated metrics
    await this.cacheMetrics();
  }

  /**
   * Increment metric counter
   */
  async incrementMetric(metricName, date) {
    const db = getDatabase();
    const dbType = getDatabaseType();

    try {
      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO analytics_metrics (metric_name, metric_date, metric_value, updated_at)
          VALUES ($1, $2, 1, NOW())
          ON CONFLICT (metric_name, metric_date)
          DO UPDATE SET metric_value = analytics_metrics.metric_value + 1, updated_at = NOW()
        `, [metricName, date]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO analytics_metrics (metric_name, metric_date, metric_value, updated_at)
            VALUES (?, ?, 1, datetime('now'))
            ON CONFLICT(metric_name, metric_date)
            DO UPDATE SET metric_value = metric_value + 1, updated_at = datetime('now')
          `, [metricName, date], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      logger.error('Failed to increment metric', {
        type: 'analytics',
        error: error.message,
        metricName,
        date
      });
    }
  }

  /**
   * Add revenue
   */
  async addRevenue(date, amount) {
    const db = getDatabase();
    const dbType = getDatabaseType();

    try {
      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO analytics_metrics (metric_name, metric_date, metric_value, updated_at)
          VALUES ('revenue', $1, $2, NOW())
          ON CONFLICT (metric_name, metric_date)
          DO UPDATE SET metric_value = analytics_metrics.metric_value + $2, updated_at = NOW()
        `, [date, amount]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO analytics_metrics (metric_name, metric_date, metric_value, updated_at)
            VALUES ('revenue', ?, ?, datetime('now'))
            ON CONFLICT(metric_name, metric_date)
            DO UPDATE SET metric_value = metric_value + ?, updated_at = datetime('now')
          `, [date, amount, amount], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      this.metrics.revenue.set(date, (this.metrics.revenue.get(date) || 0) + amount);
    } catch (error) {
      logger.error('Failed to add revenue', {
        type: 'analytics',
        error: error.message,
        date,
        amount
      });
    }
  }

  /**
   * Update conversion rate
   */
  async updateConversionRate(date) {
    try {
      const proposalsSent = await this.getMetric('proposals_sent', date);
      const proposalsAccepted = await this.getMetric('proposals_accepted', date);

      if (proposalsSent > 0) {
        const conversionRate = (proposalsAccepted / proposalsSent) * 100;
        this.metrics.conversionRates.set(date, conversionRate);

        // Store conversion rate
        const db = getDatabase();
        const dbType = getDatabaseType();

        if (dbType === 'postgres') {
          await db.query(`
            INSERT INTO analytics_metrics (metric_name, metric_date, metric_value, updated_at)
            VALUES ('conversion_rate', $1, $2, NOW())
            ON CONFLICT (metric_name, metric_date)
            DO UPDATE SET metric_value = $2, updated_at = NOW()
          `, [date, conversionRate]);
        } else {
          await new Promise((resolve, reject) => {
            db.run(`
              INSERT INTO analytics_metrics (metric_name, metric_date, metric_value, updated_at)
              VALUES ('conversion_rate', ?, ?, datetime('now'))
              ON CONFLICT(metric_name, metric_date)
              DO UPDATE SET metric_value = ?, updated_at = datetime('now')
            `, [date, conversionRate, conversionRate], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
      }
    } catch (error) {
      logger.error('Failed to update conversion rate', {
        type: 'analytics',
        error: error.message,
        date
      });
    }
  }

  /**
   * Get metric value
   */
  async getMetric(metricName, date) {
    const db = getDatabase();
    const dbType = getDatabaseType();

    try {
      if (dbType === 'postgres') {
        const result = await db.query(`
          SELECT metric_value FROM analytics_metrics
          WHERE metric_name = $1 AND metric_date = $2
        `, [metricName, date]);
        return result.rows[0]?.metric_value || 0;
      } else {
        return await new Promise((resolve, reject) => {
          db.get(`
            SELECT metric_value FROM analytics_metrics
            WHERE metric_name = ? AND metric_date = ?
          `, [metricName, date], (err, row) => {
            if (err) reject(err);
            else resolve(row?.metric_value || 0);
          });
        });
      }
    } catch (error) {
      logger.error('Failed to get metric', {
        type: 'analytics',
        error: error.message,
        metricName,
        date
      });
      return 0;
    }
  }

  /**
   * Track user behavior
   */
  trackUserBehavior(userId, action) {
    if (!this.metrics.userBehavior.has(userId)) {
      this.metrics.userBehavior.set(userId, []);
    }

    const userActions = this.metrics.userBehavior.get(userId);
    userActions.push({
      action,
      timestamp: new Date().toISOString()
    });

    // Keep only last 100 actions per user
    if (userActions.length > 100) {
      this.metrics.userBehavior.set(userId, userActions.slice(-100));
    }
  }

  /**
   * Track system usage
   */
  trackSystemUsage(usageType, data) {
    if (!this.metrics.systemUsage.has(usageType)) {
      this.metrics.systemUsage.set(usageType, []);
    }

    const usageData = this.metrics.systemUsage.get(usageType);
    usageData.push({
      data,
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 usage records per type
    if (usageData.length > 1000) {
      this.metrics.systemUsage.set(usageType, usageData.slice(-1000));
    }
  }

  /**
   * Get business metrics summary
   */
  async getBusinessMetrics(startDate, endDate) {
    const db = getDatabase();
    const dbType = getDatabaseType();

    try {
      let query, params;
      
      if (dbType === 'postgres') {
        query = `
          SELECT 
            metric_name,
            metric_date,
            metric_value
          FROM analytics_metrics
          WHERE metric_date >= $1 AND metric_date <= $2
          ORDER BY metric_date DESC, metric_name
        `;
        params = [startDate, endDate];
      } else {
        query = `
          SELECT 
            metric_name,
            metric_date,
            metric_value
          FROM analytics_metrics
          WHERE metric_date >= ? AND metric_date <= ?
          ORDER BY metric_date DESC, metric_name
        `;
        params = [startDate, endDate];
      }

      const result = dbType === 'postgres' 
        ? await db.query(query, params)
        : await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
              if (err) reject(err);
              else resolve({ rows });
            });
          });

      // Organize metrics by date
      const metricsByDate = {};
      for (const row of result.rows) {
        if (!metricsByDate[row.metric_date]) {
          metricsByDate[row.metric_date] = {};
        }
        metricsByDate[row.metric_date][row.metric_name] = row.metric_value;
      }

      return {
        startDate,
        endDate,
        metrics: metricsByDate,
        summary: this.calculateSummary(result.rows)
      };
    } catch (error) {
      logger.error('Failed to get business metrics', {
        type: 'analytics',
        error: error.message,
        startDate,
        endDate
      });
      throw error;
    }
  }

  /**
   * Calculate metrics summary
   */
  calculateSummary(rows) {
    const summary = {
      totalBusinessesDiscovered: 0,
      totalProposalsSent: 0,
      totalProposalsAccepted: 0,
      totalProjectsCompleted: 0,
      totalRevenue: 0,
      averageConversionRate: 0,
      totalUserSignups: 0,
      totalApiCalls: 0,
      totalErrors: 0
    };

    const conversionRates = [];

    for (const row of rows) {
      switch (row.metric_name) {
        case 'businesses_discovered':
          summary.totalBusinessesDiscovered += row.metric_value;
          break;
        case 'proposals_sent':
          summary.totalProposalsSent += row.metric_value;
          break;
        case 'proposals_accepted':
          summary.totalProposalsAccepted += row.metric_value;
          break;
        case 'projects_completed':
          summary.totalProjectsCompleted += row.metric_value;
          break;
        case 'revenue':
          summary.totalRevenue += row.metric_value;
          break;
        case 'conversion_rate':
          conversionRates.push(row.metric_value);
          break;
        case 'user_signups':
          summary.totalUserSignups += row.metric_value;
          break;
        case 'api_calls':
          summary.totalApiCalls += row.metric_value;
          break;
        case 'errors':
          summary.totalErrors += row.metric_value;
          break;
      }
    }

    if (conversionRates.length > 0) {
      summary.averageConversionRate = conversionRates.reduce((a, b) => a + b, 0) / conversionRates.length;
    }

    return summary;
  }

  /**
   * Implement predictive analytics for forecasting
   */
  async predictFutureMetrics(metricName, daysAhead = 7) {
    try {
      // Get historical data for the metric
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const db = getDatabase();
      const dbType = getDatabaseType();

      let query, params;
      
      if (dbType === 'postgres') {
        query = `
          SELECT metric_date, metric_value
          FROM analytics_metrics
          WHERE metric_name = $1 AND metric_date >= $2 AND metric_date <= $3
          ORDER BY metric_date ASC
        `;
        params = [metricName, startDate, endDate];
      } else {
        query = `
          SELECT metric_date, metric_value
          FROM analytics_metrics
          WHERE metric_name = ? AND metric_date >= ? AND metric_date <= ?
          ORDER BY metric_date ASC
        `;
        params = [metricName, startDate, endDate];
      }

      const result = dbType === 'postgres'
        ? await db.query(query, params)
        : await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
              if (err) reject(err);
              else resolve({ rows });
            });
          });

      if (result.rows.length < 7) {
        return {
          metricName,
          prediction: null,
          message: 'Insufficient historical data for prediction (minimum 7 days required)'
        };
      }

      // Simple linear regression for prediction
      const values = result.rows.map(r => r.metric_value);
      const prediction = this.linearRegression(values, daysAhead);

      const predictionData = {
        metricName,
        historicalData: result.rows,
        prediction: prediction.map((value, index) => ({
          date: new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          predictedValue: Math.max(0, Math.round(value))
        })),
        confidence: this.calculateConfidence(values),
        trend: this.calculateTrend(values)
      };

      this.predictions.set(metricName, predictionData);

      logger.info('Prediction generated', {
        type: 'analytics',
        metricName,
        daysAhead,
        trend: predictionData.trend
      });

      return predictionData;
    } catch (error) {
      logger.error('Failed to predict future metrics', {
        type: 'analytics',
        error: error.message,
        metricName
      });
      throw error;
    }
  }

  /**
   * Simple linear regression
   */
  linearRegression(values, daysAhead) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict future values
    const predictions = [];
    for (let i = 0; i < daysAhead; i++) {
      const futureX = n + i;
      predictions.push(slope * futureX + intercept);
    }

    return predictions;
  }

  /**
   * Calculate confidence level
   */
  calculateConfidence(values) {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = (stdDev / mean) * 100;

    // Lower CV = higher confidence
    if (coefficientOfVariation < 10) return 0.95;
    if (coefficientOfVariation < 20) return 0.85;
    if (coefficientOfVariation < 30) return 0.75;
    if (coefficientOfVariation < 40) return 0.65;
    return 0.50;
  }

  /**
   * Calculate trend
   */
  calculateTrend(values) {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Detect anomalies in metrics
   */
  async detectAnomalies() {
    try {
      const anomalies = [];
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Check conversion rate anomaly
      const todayConversionRate = await this.getMetric('conversion_rate', today);
      const yesterdayConversionRate = await this.getMetric('conversion_rate', yesterday);

      if (yesterdayConversionRate > 0) {
        const conversionChange = Math.abs((todayConversionRate - yesterdayConversionRate) / yesterdayConversionRate);
        if (conversionChange > this.anomalyThresholds.conversionRateChange) {
          anomalies.push({
            type: 'conversion_rate_anomaly',
            severity: 'warning',
            message: `Conversion rate changed by ${(conversionChange * 100).toFixed(1)}%`,
            currentValue: todayConversionRate,
            previousValue: yesterdayConversionRate,
            change: conversionChange,
            date: today
          });
        }
      }

      // Check revenue anomaly
      const todayRevenue = await this.getMetric('revenue', today);
      const yesterdayRevenue = await this.getMetric('revenue', yesterday);

      if (yesterdayRevenue > 0) {
        const revenueChange = Math.abs((todayRevenue - yesterdayRevenue) / yesterdayRevenue);
        if (revenueChange > this.anomalyThresholds.revenueChange) {
          anomalies.push({
            type: 'revenue_anomaly',
            severity: todayRevenue < yesterdayRevenue ? 'critical' : 'info',
            message: `Revenue changed by ${(revenueChange * 100).toFixed(1)}%`,
            currentValue: todayRevenue,
            previousValue: yesterdayRevenue,
            change: revenueChange,
            date: today
          });
        }
      }

      // Check error rate anomaly
      const todayErrors = await this.getMetric('errors', today);
      const yesterdayErrors = await this.getMetric('errors', yesterday);

      if (yesterdayErrors > 0) {
        const errorChange = Math.abs((todayErrors - yesterdayErrors) / yesterdayErrors);
        if (errorChange > this.anomalyThresholds.errorRateChange) {
          anomalies.push({
            type: 'error_rate_anomaly',
            severity: 'critical',
            message: `Error count changed by ${(errorChange * 100).toFixed(1)}%`,
            currentValue: todayErrors,
            previousValue: yesterdayErrors,
            change: errorChange,
            date: today
          });
        }
      }

      // Log anomalies
      for (const anomaly of anomalies) {
        if (anomaly.severity === 'critical') {
          logger.error('Anomaly detected', {
            type: 'analytics',
            anomaly
          });
        } else {
          logger.warn('Anomaly detected', {
            type: 'analytics',
            anomaly
          });
        }
      }

      // Cache anomalies
      await cacheService.set('analytics', 'anomalies', anomalies, {}, 300);

      return anomalies;
    } catch (error) {
      logger.error('Failed to detect anomalies', {
        type: 'analytics',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Cache current metrics
   */
  async cacheMetrics() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const metrics = await this.getBusinessMetrics(today, today);
      await cacheService.set('analytics', 'current_metrics', metrics, {}, 60);
    } catch (error) {
      logger.error('Failed to cache metrics', {
        type: 'analytics',
        error: error.message
      });
    }
  }

  /**
   * Get analytics dashboard data
   */
  async getDashboardData(days = 30) {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const metrics = await this.getBusinessMetrics(startDate, endDate);
      const anomalies = await this.detectAnomalies();

      // Get predictions for key metrics
      const revenuePrediction = await this.predictFutureMetrics('revenue', 7);
      const conversionPrediction = await this.predictFutureMetrics('conversion_rate', 7);

      return {
        period: { startDate, endDate, days },
        metrics: metrics.metrics,
        summary: metrics.summary,
        anomalies,
        predictions: {
          revenue: revenuePrediction,
          conversionRate: conversionPrediction
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get dashboard data', {
        type: 'analytics',
        error: error.message
      });
      throw error;
    }
  }
}

// Singleton instance
const analyticsEngine = new AnalyticsEngine();

export default analyticsEngine;
