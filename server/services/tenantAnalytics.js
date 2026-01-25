/**
 * Tenant Analytics Service
 * Provides tenant-aware monitoring and analytics
 * 
 * Requirements: 10.5, 10.6
 * - Implements tenant-aware monitoring and analytics
 * - Tracks tenant-specific metrics and performance
 */

import postgresDb from '../database/postgres.js';
import tenantDataAccess from './tenantDataAccess.js';
import tenantCustomization from './tenantCustomization.js';

class TenantAnalyticsService {
  constructor() {
    this.metricTypes = {
      API_REQUEST: 'api_request',
      API_ERROR: 'api_error',
      API_RESPONSE_TIME: 'api_response_time',
      BUSINESS_DISCOVERED: 'business_discovered',
      PROPOSAL_GENERATED: 'proposal_generated',
      PROJECT_CREATED: 'project_created',
      USER_LOGIN: 'user_login',
      USER_ACTIVITY: 'user_activity',
      STORAGE_USED: 'storage_used',
      AI_AGENT_EXECUTION: 'ai_agent_execution',
      WEBHOOK_DELIVERY: 'webhook_delivery',
      CACHE_HIT: 'cache_hit',
      CACHE_MISS: 'cache_miss'
    };
  }

  /**
   * Track API request for tenant
   */
  async trackApiRequest(tenantId, endpoint, method, statusCode, responseTime, userId = null) {
    try {
      // Record API request metric
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.API_REQUEST,
        1,
        {
          endpoint,
          method,
          statusCode,
          responseTime,
          userId,
          timestamp: new Date().toISOString()
        }
      );

      // Record response time separately
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.API_RESPONSE_TIME,
        responseTime,
        {
          endpoint,
          method,
          statusCode
        }
      );

      // Track errors separately
      if (statusCode >= 400) {
        await tenantCustomization.recordTenantMetric(
          tenantId,
          this.metricTypes.API_ERROR,
          1,
          {
            endpoint,
            method,
            statusCode,
            userId
          }
        );
      }
    } catch (error) {
      console.error('❌ Failed to track API request:', error);
      // Don't throw - analytics should not break operations
    }
  }

  /**
   * Track business discovery for tenant
   */
  async trackBusinessDiscovery(tenantId, businessCount, userId) {
    try {
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.BUSINESS_DISCOVERED,
        businessCount,
        {
          userId,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Failed to track business discovery:', error);
    }
  }

  /**
   * Track proposal generation for tenant
   */
  async trackProposalGeneration(tenantId, proposalId, userId) {
    try {
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.PROPOSAL_GENERATED,
        1,
        {
          proposalId,
          userId,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Failed to track proposal generation:', error);
    }
  }

  /**
   * Track project creation for tenant
   */
  async trackProjectCreation(tenantId, projectId, userId) {
    try {
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.PROJECT_CREATED,
        1,
        {
          projectId,
          userId,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Failed to track project creation:', error);
    }
  }

  /**
   * Track user login for tenant
   */
  async trackUserLogin(tenantId, userId, ipAddress, userAgent) {
    try {
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.USER_LOGIN,
        1,
        {
          userId,
          ipAddress,
          userAgent,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Failed to track user login:', error);
    }
  }

  /**
   * Track user activity for tenant
   */
  async trackUserActivity(tenantId, userId, activityType, metadata = {}) {
    try {
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.USER_ACTIVITY,
        1,
        {
          userId,
          activityType,
          ...metadata,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Failed to track user activity:', error);
    }
  }

  /**
   * Track storage usage for tenant
   */
  async trackStorageUsage(tenantId, storageMb) {
    try {
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.STORAGE_USED,
        storageMb,
        {
          timestamp: new Date().toISOString()
        }
      );

      // Update tenant current storage
      await postgresDb.query(
        `UPDATE tenants 
         SET current_storage_mb = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [storageMb, tenantId]
      );
    } catch (error) {
      console.error('❌ Failed to track storage usage:', error);
    }
  }

  /**
   * Track AI agent execution for tenant
   */
  async trackAgentExecution(tenantId, agentType, executionTime, success, userId) {
    try {
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.AI_AGENT_EXECUTION,
        1,
        {
          agentType,
          executionTime,
          success,
          userId,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Failed to track agent execution:', error);
    }
  }

  /**
   * Track webhook delivery for tenant
   */
  async trackWebhookDelivery(tenantId, webhookId, success, responseTime) {
    try {
      await tenantCustomization.recordTenantMetric(
        tenantId,
        this.metricTypes.WEBHOOK_DELIVERY,
        1,
        {
          webhookId,
          success,
          responseTime,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Failed to track webhook delivery:', error);
    }
  }

  /**
   * Track cache performance for tenant
   */
  async trackCachePerformance(tenantId, hit) {
    try {
      const metricType = hit ? this.metricTypes.CACHE_HIT : this.metricTypes.CACHE_MISS;
      
      await tenantCustomization.recordTenantMetric(
        tenantId,
        metricType,
        1,
        {
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('❌ Failed to track cache performance:', error);
    }
  }

  /**
   * Get tenant analytics dashboard data
   */
  async getTenantDashboard(tenantId, startDate, endDate) {
    try {
      // Get metrics summary
      const metrics = await tenantCustomization.getTenantMetricsSummary(
        tenantId,
        startDate,
        endDate
      );

      // Get quota usage
      const quotas = await tenantCustomization.getTenantQuotaConfig(tenantId);

      // Get quota warnings
      const warnings = await tenantCustomization.checkQuotaWarnings(tenantId);

      // Calculate key performance indicators
      const kpis = this.calculateKPIs(metrics);

      // Get recent activity
      const recentActivity = await this.getRecentActivity(tenantId, 10);

      return {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        kpis,
        metrics,
        quotas,
        warnings,
        recentActivity
      };
    } catch (error) {
      console.error('❌ Failed to get tenant dashboard:', error);
      throw error;
    }
  }

  /**
   * Calculate key performance indicators from metrics
   */
  calculateKPIs(metrics) {
    const kpis = {
      totalApiRequests: 0,
      totalApiErrors: 0,
      avgResponseTime: 0,
      errorRate: 0,
      totalBusinesses: 0,
      totalProposals: 0,
      totalProjects: 0,
      totalLogins: 0,
      cacheHitRate: 0
    };

    for (const metric of metrics) {
      switch (metric.metric_type) {
        case this.metricTypes.API_REQUEST:
          kpis.totalApiRequests = parseInt(metric.total_value);
          break;
        case this.metricTypes.API_ERROR:
          kpis.totalApiErrors = parseInt(metric.total_value);
          break;
        case this.metricTypes.API_RESPONSE_TIME:
          kpis.avgResponseTime = parseFloat(metric.avg_value);
          break;
        case this.metricTypes.BUSINESS_DISCOVERED:
          kpis.totalBusinesses = parseInt(metric.total_value);
          break;
        case this.metricTypes.PROPOSAL_GENERATED:
          kpis.totalProposals = parseInt(metric.total_value);
          break;
        case this.metricTypes.PROJECT_CREATED:
          kpis.totalProjects = parseInt(metric.total_value);
          break;
        case this.metricTypes.USER_LOGIN:
          kpis.totalLogins = parseInt(metric.total_value);
          break;
        case this.metricTypes.CACHE_HIT:
          kpis.cacheHits = parseInt(metric.total_value);
          break;
        case this.metricTypes.CACHE_MISS:
          kpis.cacheMisses = parseInt(metric.total_value);
          break;
      }
    }

    // Calculate derived metrics
    if (kpis.totalApiRequests > 0) {
      kpis.errorRate = (kpis.totalApiErrors / kpis.totalApiRequests) * 100;
    }

    if (kpis.cacheHits && kpis.cacheMisses) {
      const totalCacheRequests = kpis.cacheHits + kpis.cacheMisses;
      kpis.cacheHitRate = (kpis.cacheHits / totalCacheRequests) * 100;
    }

    return kpis;
  }

  /**
   * Get recent activity for tenant
   */
  async getRecentActivity(tenantId, limit = 10) {
    try {
      const result = await postgresDb.query(
        `SELECT 
          action, resource_type, resource_id, details, created_at
         FROM tenant_audit_log
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenantId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get recent activity:', error);
      return [];
    }
  }

  /**
   * Get tenant performance trends
   */
  async getTenantPerformanceTrends(tenantId, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const result = await postgresDb.query(
        `SELECT 
          DATE(period_start) as date,
          metric_type,
          SUM(metric_value) as total_value,
          AVG(metric_value) as avg_value
         FROM tenant_usage_metrics
         WHERE tenant_id = $1
         AND period_start >= $2
         AND period_end <= $3
         GROUP BY DATE(period_start), metric_type
         ORDER BY date DESC, metric_type`,
        [tenantId, startDate, endDate]
      );

      // Group by date
      const trends = {};
      for (const row of result.rows) {
        const dateKey = row.date.toISOString().split('T')[0];
        if (!trends[dateKey]) {
          trends[dateKey] = {};
        }
        trends[dateKey][row.metric_type] = {
          total: parseFloat(row.total_value),
          average: parseFloat(row.avg_value)
        };
      }

      return trends;
    } catch (error) {
      console.error('❌ Failed to get performance trends:', error);
      throw error;
    }
  }

  /**
   * Get tenant usage comparison
   */
  async getTenantUsageComparison(tenantId, comparisonPeriodDays = 30) {
    try {
      const currentEnd = new Date();
      const currentStart = new Date(currentEnd.getTime() - comparisonPeriodDays * 24 * 60 * 60 * 1000);
      
      const previousEnd = new Date(currentStart.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - comparisonPeriodDays * 24 * 60 * 60 * 1000);

      // Get current period metrics
      const currentMetrics = await tenantCustomization.getTenantMetricsSummary(
        tenantId,
        currentStart,
        currentEnd
      );

      // Get previous period metrics
      const previousMetrics = await tenantCustomization.getTenantMetricsSummary(
        tenantId,
        previousStart,
        previousEnd
      );

      // Calculate changes
      const comparison = {};
      for (const current of currentMetrics) {
        const previous = previousMetrics.find(m => m.metric_type === current.metric_type);
        
        const currentValue = parseFloat(current.total_value);
        const previousValue = previous ? parseFloat(previous.total_value) : 0;
        
        const change = previousValue > 0 
          ? ((currentValue - previousValue) / previousValue) * 100 
          : 0;

        comparison[current.metric_type] = {
          current: currentValue,
          previous: previousValue,
          change: change,
          trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
        };
      }

      return {
        currentPeriod: {
          start: currentStart.toISOString(),
          end: currentEnd.toISOString()
        },
        previousPeriod: {
          start: previousStart.toISOString(),
          end: previousEnd.toISOString()
        },
        comparison
      };
    } catch (error) {
      console.error('❌ Failed to get usage comparison:', error);
      throw error;
    }
  }

  /**
   * Check tenant health status
   */
  async checkTenantHealth(tenantId) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

      const metrics = await tenantCustomization.getTenantMetricsSummary(
        tenantId,
        startDate,
        endDate
      );

      const kpis = this.calculateKPIs(metrics);
      const quotas = await tenantCustomization.getTenantQuotaConfig(tenantId);
      const warnings = await tenantCustomization.checkQuotaWarnings(tenantId);

      // Determine health status
      let healthStatus = 'healthy';
      const issues = [];

      // Check error rate
      if (kpis.errorRate > 5) {
        healthStatus = 'warning';
        issues.push({
          type: 'high_error_rate',
          severity: 'warning',
          message: `Error rate is ${kpis.errorRate.toFixed(2)}% (threshold: 5%)`
        });
      }

      if (kpis.errorRate > 10) {
        healthStatus = 'critical';
        issues[issues.length - 1].severity = 'critical';
      }

      // Check response time
      if (kpis.avgResponseTime > 2000) {
        healthStatus = healthStatus === 'critical' ? 'critical' : 'warning';
        issues.push({
          type: 'slow_response_time',
          severity: kpis.avgResponseTime > 5000 ? 'critical' : 'warning',
          message: `Average response time is ${kpis.avgResponseTime.toFixed(0)}ms (threshold: 2000ms)`
        });
      }

      // Check quota warnings
      if (warnings.length > 0) {
        const criticalWarnings = warnings.filter(w => w.severity === 'critical');
        if (criticalWarnings.length > 0) {
          healthStatus = 'critical';
        } else if (healthStatus === 'healthy') {
          healthStatus = 'warning';
        }
        
        issues.push(...warnings.map(w => ({
          type: 'quota_warning',
          severity: w.severity,
          message: w.message
        })));
      }

      return {
        status: healthStatus,
        timestamp: new Date().toISOString(),
        kpis,
        quotas,
        issues
      };
    } catch (error) {
      console.error('❌ Failed to check tenant health:', error);
      throw error;
    }
  }
}

// Singleton instance
const tenantAnalytics = new TenantAnalyticsService();

export default tenantAnalytics;
