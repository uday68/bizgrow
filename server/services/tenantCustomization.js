/**
 * Tenant Customization Service
 * Manages tenant-specific branding, configuration, and customization
 * 
 * Requirements: 10.3, 10.5, 10.6, 10.7
 * - Implements tenant-specific branding and customization
 * - Manages tenant-specific feature flags and configuration
 * - Provides tenant-aware monitoring and analytics
 * - Enforces tenant usage quotas and restrictions
 */

import postgresDb from '../database/postgres.js';
import tenantDataAccess from './tenantDataAccess.js';

class TenantCustomizationService {
  constructor() {
    this.defaultBranding = {
      primaryColor: '#3B82F6',
      secondaryColor: '#10B981',
      accentColor: '#F59E0B',
      logoUrl: null,
      faviconUrl: null,
      companyName: 'BizGrow AI',
      tagline: 'Grow Your Business with AI',
      customCss: null,
      emailTemplate: 'default',
      dashboardLayout: 'default'
    };

    this.defaultFeatureFlags = {
      aiAgents: true,
      businessDiscovery: true,
      proposalGeneration: true,
      projectBuilder: true,
      analytics: true,
      apiAccess: false,
      webhooks: false,
      customBranding: false,
      advancedReporting: false,
      ssoIntegration: false,
      ipRestrictions: false,
      auditLogs: true,
      dataExport: false,
      customDomain: false,
      whiteLabel: false
    };

    this.planFeatures = {
      free: {
        aiAgents: true,
        businessDiscovery: true,
        proposalGeneration: true,
        projectBuilder: false,
        analytics: false,
        apiAccess: false,
        webhooks: false,
        customBranding: false,
        advancedReporting: false,
        ssoIntegration: false,
        ipRestrictions: false,
        auditLogs: false,
        dataExport: false,
        customDomain: false,
        whiteLabel: false
      },
      starter: {
        aiAgents: true,
        businessDiscovery: true,
        proposalGeneration: true,
        projectBuilder: true,
        analytics: true,
        apiAccess: false,
        webhooks: false,
        customBranding: false,
        advancedReporting: false,
        ssoIntegration: false,
        ipRestrictions: false,
        auditLogs: true,
        dataExport: false,
        customDomain: false,
        whiteLabel: false
      },
      professional: {
        aiAgents: true,
        businessDiscovery: true,
        proposalGeneration: true,
        projectBuilder: true,
        analytics: true,
        apiAccess: true,
        webhooks: true,
        customBranding: true,
        advancedReporting: true,
        ssoIntegration: false,
        ipRestrictions: true,
        auditLogs: true,
        dataExport: true,
        customDomain: false,
        whiteLabel: false
      },
      enterprise: {
        aiAgents: true,
        businessDiscovery: true,
        proposalGeneration: true,
        projectBuilder: true,
        analytics: true,
        apiAccess: true,
        webhooks: true,
        customBranding: true,
        advancedReporting: true,
        ssoIntegration: true,
        ipRestrictions: true,
        auditLogs: true,
        dataExport: true,
        customDomain: true,
        whiteLabel: true
      }
    };
  }

  /**
   * Get tenant branding configuration
   */
  async getTenantBranding(tenantId) {
    try {
      const tenant = await tenantDataAccess.getTenant(tenantId);
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Merge default branding with tenant-specific branding
      const branding = {
        ...this.defaultBranding,
        ...(tenant.branding_config || {})
      };

      return branding;
    } catch (error) {
      console.error('❌ Failed to get tenant branding:', error);
      throw error;
    }
  }

  /**
   * Update tenant branding configuration
   */
  async updateTenantBranding(tenantId, brandingConfig) {
    try {
      // Validate tenant has custom branding feature
      const hasFeature = await this.checkFeatureEnabled(tenantId, 'customBranding');
      
      if (!hasFeature) {
        throw new Error('Custom branding is not available on your current plan');
      }

      // Validate branding configuration
      this.validateBrandingConfig(brandingConfig);

      // Update tenant branding
      const result = await postgresDb.query(
        `UPDATE tenants 
         SET branding_config = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, name, branding_config`,
        [JSON.stringify(brandingConfig), tenantId]
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to update tenant branding');
      }

      console.log(`✅ Updated branding for tenant: ${tenantId}`);
      return result.rows[0].branding_config;
    } catch (error) {
      console.error('❌ Failed to update tenant branding:', error);
      throw error;
    }
  }

  /**
   * Validate branding configuration
   */
  validateBrandingConfig(config) {
    const validKeys = Object.keys(this.defaultBranding);
    
    for (const key of Object.keys(config)) {
      if (!validKeys.includes(key)) {
        throw new Error(`Invalid branding configuration key: ${key}`);
      }
    }

    // Validate color formats
    const colorKeys = ['primaryColor', 'secondaryColor', 'accentColor'];
    for (const key of colorKeys) {
      if (config[key] && !/^#[0-9A-F]{6}$/i.test(config[key])) {
        throw new Error(`Invalid color format for ${key}. Use hex format: #RRGGBB`);
      }
    }

    // Validate URLs
    const urlKeys = ['logoUrl', 'faviconUrl'];
    for (const key of urlKeys) {
      if (config[key] && !this.isValidUrl(config[key])) {
        throw new Error(`Invalid URL format for ${key}`);
      }
    }

    return true;
  }

  /**
   * Check if URL is valid
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get tenant feature flags
   */
  async getTenantFeatureFlags(tenantId) {
    try {
      const tenant = await tenantDataAccess.getTenant(tenantId);
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Get plan-based features
      const planFeatures = this.planFeatures[tenant.plan_type] || this.planFeatures.free;

      // Merge with tenant-specific overrides
      const featureFlags = {
        ...planFeatures,
        ...(tenant.feature_flags || {})
      };

      return featureFlags;
    } catch (error) {
      console.error('❌ Failed to get tenant feature flags:', error);
      throw error;
    }
  }

  /**
   * Update tenant feature flags (admin override)
   */
  async updateTenantFeatureFlags(tenantId, featureFlags) {
    try {
      // Get current tenant
      const tenant = await tenantDataAccess.getTenant(tenantId);
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Merge with existing flags
      const currentFlags = tenant.feature_flags || {};
      const updatedFlags = {
        ...currentFlags,
        ...featureFlags
      };

      // Update tenant feature flags
      const result = await postgresDb.query(
        `UPDATE tenants 
         SET feature_flags = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, name, feature_flags`,
        [JSON.stringify(updatedFlags), tenantId]
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to update tenant feature flags');
      }

      console.log(`✅ Updated feature flags for tenant: ${tenantId}`);
      return result.rows[0].feature_flags;
    } catch (error) {
      console.error('❌ Failed to update tenant feature flags:', error);
      throw error;
    }
  }

  /**
   * Check if a feature is enabled for tenant
   */
  async checkFeatureEnabled(tenantId, featureName) {
    try {
      const featureFlags = await this.getTenantFeatureFlags(tenantId);
      return featureFlags[featureName] === true;
    } catch (error) {
      console.error('❌ Failed to check feature enabled:', error);
      return false;
    }
  }

  /**
   * Get tenant custom settings
   */
  async getTenantSettings(tenantId) {
    try {
      const tenant = await tenantDataAccess.getTenant(tenantId);
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      return tenant.custom_settings || {};
    } catch (error) {
      console.error('❌ Failed to get tenant settings:', error);
      throw error;
    }
  }

  /**
   * Update tenant custom settings
   */
  async updateTenantSettings(tenantId, settings) {
    try {
      // Get current settings
      const currentSettings = await this.getTenantSettings(tenantId);

      // Merge with new settings
      const updatedSettings = {
        ...currentSettings,
        ...settings
      };

      // Update tenant settings
      const result = await postgresDb.query(
        `UPDATE tenants 
         SET custom_settings = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, name, custom_settings`,
        [JSON.stringify(updatedSettings), tenantId]
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to update tenant settings');
      }

      console.log(`✅ Updated settings for tenant: ${tenantId}`);
      return result.rows[0].custom_settings;
    } catch (error) {
      console.error('❌ Failed to update tenant settings:', error);
      throw error;
    }
  }

  /**
   * Get tenant analytics configuration
   */
  async getTenantAnalyticsConfig(tenantId) {
    try {
      const settings = await this.getTenantSettings(tenantId);
      
      return settings.analytics || {
        enabled: true,
        trackingEnabled: true,
        retentionDays: 90,
        customDashboards: [],
        alertThresholds: {
          conversionRate: 0.05,
          errorRate: 0.01,
          responseTime: 1000
        }
      };
    } catch (error) {
      console.error('❌ Failed to get tenant analytics config:', error);
      throw error;
    }
  }

  /**
   * Update tenant analytics configuration
   */
  async updateTenantAnalyticsConfig(tenantId, analyticsConfig) {
    try {
      // Validate tenant has analytics feature
      const hasFeature = await this.checkFeatureEnabled(tenantId, 'analytics');
      
      if (!hasFeature) {
        throw new Error('Analytics is not available on your current plan');
      }

      // Get current settings
      const settings = await this.getTenantSettings(tenantId);

      // Update analytics configuration
      settings.analytics = {
        ...(settings.analytics || {}),
        ...analyticsConfig
      };

      await this.updateTenantSettings(tenantId, settings);

      console.log(`✅ Updated analytics config for tenant: ${tenantId}`);
      return settings.analytics;
    } catch (error) {
      console.error('❌ Failed to update tenant analytics config:', error);
      throw error;
    }
  }

  /**
   * Get tenant quota configuration
   */
  async getTenantQuotaConfig(tenantId) {
    try {
      const tenant = await tenantDataAccess.getTenant(tenantId);
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      return {
        users: {
          current: tenant.current_users || 0,
          max: tenant.max_users,
          percent: Math.round((tenant.current_users / tenant.max_users) * 100)
        },
        businesses: {
          current: tenant.current_businesses || 0,
          max: tenant.max_businesses,
          percent: Math.round((tenant.current_businesses / tenant.max_businesses) * 100)
        },
        proposals: {
          current: tenant.current_proposals || 0,
          max: tenant.max_proposals,
          percent: Math.round((tenant.current_proposals / tenant.max_proposals) * 100)
        },
        storage: {
          current: tenant.current_storage_mb || 0,
          max: tenant.max_storage_mb,
          percent: Math.round((tenant.current_storage_mb / tenant.max_storage_mb) * 100)
        }
      };
    } catch (error) {
      console.error('❌ Failed to get tenant quota config:', error);
      throw error;
    }
  }

  /**
   * Update tenant quota limits (admin only)
   */
  async updateTenantQuotaLimits(tenantId, quotaLimits) {
    try {
      const updates = [];
      const params = [tenantId];
      let paramIndex = 2;

      if (quotaLimits.maxUsers !== undefined) {
        updates.push(`max_users = $${paramIndex}`);
        params.push(quotaLimits.maxUsers);
        paramIndex++;
      }

      if (quotaLimits.maxBusinesses !== undefined) {
        updates.push(`max_businesses = $${paramIndex}`);
        params.push(quotaLimits.maxBusinesses);
        paramIndex++;
      }

      if (quotaLimits.maxProposals !== undefined) {
        updates.push(`max_proposals = $${paramIndex}`);
        params.push(quotaLimits.maxProposals);
        paramIndex++;
      }

      if (quotaLimits.maxStorageMb !== undefined) {
        updates.push(`max_storage_mb = $${paramIndex}`);
        params.push(quotaLimits.maxStorageMb);
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new Error('No quota limits to update');
      }

      const result = await postgresDb.query(
        `UPDATE tenants 
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, name, max_users, max_businesses, max_proposals, max_storage_mb`,
        params
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to update tenant quota limits');
      }

      console.log(`✅ Updated quota limits for tenant: ${tenantId}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to update tenant quota limits:', error);
      throw error;
    }
  }

  /**
   * Check if tenant is approaching quota limits
   */
  async checkQuotaWarnings(tenantId) {
    try {
      const quotas = await this.getTenantQuotaConfig(tenantId);
      const warnings = [];

      // Check each quota type
      for (const [type, quota] of Object.entries(quotas)) {
        if (quota.percent >= 90) {
          warnings.push({
            type,
            severity: 'critical',
            message: `${type} quota at ${quota.percent}% (${quota.current}/${quota.max})`,
            current: quota.current,
            max: quota.max,
            percent: quota.percent
          });
        } else if (quota.percent >= 75) {
          warnings.push({
            type,
            severity: 'warning',
            message: `${type} quota at ${quota.percent}% (${quota.current}/${quota.max})`,
            current: quota.current,
            max: quota.max,
            percent: quota.percent
          });
        }
      }

      return warnings;
    } catch (error) {
      console.error('❌ Failed to check quota warnings:', error);
      throw error;
    }
  }

  /**
   * Get tenant monitoring configuration
   */
  async getTenantMonitoringConfig(tenantId) {
    try {
      const settings = await this.getTenantSettings(tenantId);
      
      return settings.monitoring || {
        enabled: true,
        metricsRetentionDays: 30,
        alertChannels: ['email'],
        alertThresholds: {
          errorRate: 0.05,
          responseTime: 2000,
          quotaUsage: 90
        },
        customMetrics: []
      };
    } catch (error) {
      console.error('❌ Failed to get tenant monitoring config:', error);
      throw error;
    }
  }

  /**
   * Update tenant monitoring configuration
   */
  async updateTenantMonitoringConfig(tenantId, monitoringConfig) {
    try {
      // Get current settings
      const settings = await this.getTenantSettings(tenantId);

      // Update monitoring configuration
      settings.monitoring = {
        ...(settings.monitoring || {}),
        ...monitoringConfig
      };

      await this.updateTenantSettings(tenantId, settings);

      console.log(`✅ Updated monitoring config for tenant: ${tenantId}`);
      return settings.monitoring;
    } catch (error) {
      console.error('❌ Failed to update tenant monitoring config:', error);
      throw error;
    }
  }

  /**
   * Record tenant metric
   */
  async recordTenantMetric(tenantId, metricType, metricValue, metadata = {}) {
    try {
      await postgresDb.query(
        `INSERT INTO tenant_usage_metrics (
          tenant_id, metric_type, metric_value, metadata, period_start, period_end
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
        [tenantId, metricType, metricValue, JSON.stringify(metadata)]
      );

      console.log(`✅ Recorded metric ${metricType} for tenant: ${tenantId}`);
    } catch (error) {
      console.error('❌ Failed to record tenant metric:', error);
      // Don't throw - metric recording should not break operations
    }
  }

  /**
   * Get tenant metrics summary
   */
  async getTenantMetricsSummary(tenantId, startDate, endDate) {
    try {
      const result = await postgresDb.query(
        `SELECT 
          metric_type,
          COUNT(*) as data_points,
          SUM(metric_value) as total_value,
          AVG(metric_value) as avg_value,
          MIN(metric_value) as min_value,
          MAX(metric_value) as max_value,
          STDDEV(metric_value) as stddev_value
         FROM tenant_usage_metrics
         WHERE tenant_id = $1
         AND period_start >= $2
         AND period_end <= $3
         GROUP BY metric_type
         ORDER BY metric_type`,
        [tenantId, startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get tenant metrics summary:', error);
      throw error;
    }
  }

  /**
   * Get tenant customization summary
   */
  async getTenantCustomizationSummary(tenantId) {
    try {
      const [branding, featureFlags, settings, quotas, warnings] = await Promise.all([
        this.getTenantBranding(tenantId),
        this.getTenantFeatureFlags(tenantId),
        this.getTenantSettings(tenantId),
        this.getTenantQuotaConfig(tenantId),
        this.checkQuotaWarnings(tenantId)
      ]);

      return {
        branding,
        featureFlags,
        settings,
        quotas,
        warnings
      };
    } catch (error) {
      console.error('❌ Failed to get tenant customization summary:', error);
      throw error;
    }
  }

  /**
   * Apply tenant theme to response
   */
  applyTenantTheme(branding) {
    return {
      theme: {
        colors: {
          primary: branding.primaryColor,
          secondary: branding.secondaryColor,
          accent: branding.accentColor
        },
        branding: {
          logo: branding.logoUrl,
          favicon: branding.faviconUrl,
          companyName: branding.companyName,
          tagline: branding.tagline
        },
        customCss: branding.customCss,
        layout: branding.dashboardLayout
      }
    };
  }
}

// Singleton instance
const tenantCustomization = new TenantCustomizationService();

export default tenantCustomization;
