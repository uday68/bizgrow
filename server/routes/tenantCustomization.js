/**
 * Tenant Customization Routes
 * API endpoints for tenant branding, configuration, and customization
 * 
 * Requirements: 10.3, 10.5, 10.6, 10.7
 */

import express from 'express';
import tenantCustomization from '../services/tenantCustomization.js';
import tenantDataAccess from '../services/tenantDataAccess.js';
import { authenticate } from '../middleware/auth.js';
import { tenantIsolation, requireTenantRole } from '../middleware/tenantIsolation.js';

const router = express.Router();

/**
 * GET /api/tenant-customization/branding
 * Get tenant branding configuration
 */
router.get('/branding', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const branding = await tenantCustomization.getTenantBranding(tenantId);

    res.json({
      branding,
      theme: tenantCustomization.applyTenantTheme(branding)
    });
  } catch (error) {
    console.error('❌ Failed to get tenant branding:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'BRANDING_001',
        message: 'Failed to retrieve tenant branding'
      }
    });
  }
});

/**
 * PUT /api/tenant-customization/branding
 * Update tenant branding configuration (owner/admin only)
 */
router.put('/branding', 
  authenticate, 
  tenantIsolation, 
  requireTenantRole(['owner', 'admin']), 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const brandingConfig = req.body;

      const updatedBranding = await tenantCustomization.updateTenantBranding(
        tenantId,
        brandingConfig
      );

      // Log branding update
      await tenantDataAccess.logAuditEvent(
        tenantId,
        req.user.id,
        'update',
        'tenant_branding',
        tenantId,
        { updatedFields: Object.keys(brandingConfig) }
      );

      res.json({
        message: 'Tenant branding updated successfully',
        branding: updatedBranding,
        theme: tenantCustomization.applyTenantTheme(updatedBranding)
      });
    } catch (error) {
      console.error('❌ Failed to update tenant branding:', error);
      
      if (error.message.includes('not available')) {
        return res.status(403).json({
          error: {
            type: 'FEATURE_DISABLED',
            code: 'BRANDING_002',
            message: error.message,
            meta: {
              upgradeUrl: '/upgrade'
            }
          }
        });
      }

      if (error.message.includes('Invalid')) {
        return res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            code: 'BRANDING_003',
            message: error.message
          }
        });
      }

      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'BRANDING_999',
          message: 'Failed to update tenant branding'
        }
      });
    }
  }
);

/**
 * GET /api/tenant-customization/features
 * Get tenant feature flags
 */
router.get('/features', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const featureFlags = await tenantCustomization.getTenantFeatureFlags(tenantId);

    res.json({
      features: featureFlags
    });
  } catch (error) {
    console.error('❌ Failed to get tenant features:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'FEATURES_001',
        message: 'Failed to retrieve tenant features'
      }
    });
  }
});

/**
 * PUT /api/tenant-customization/features
 * Update tenant feature flags (owner/admin only)
 */
router.put('/features', 
  authenticate, 
  tenantIsolation, 
  requireTenantRole(['owner', 'admin']), 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const featureFlags = req.body;

      const updatedFlags = await tenantCustomization.updateTenantFeatureFlags(
        tenantId,
        featureFlags
      );

      // Log feature flags update
      await tenantDataAccess.logAuditEvent(
        tenantId,
        req.user.id,
        'update',
        'tenant_features',
        tenantId,
        { updatedFeatures: Object.keys(featureFlags) }
      );

      res.json({
        message: 'Tenant feature flags updated successfully',
        features: updatedFlags
      });
    } catch (error) {
      console.error('❌ Failed to update tenant features:', error);
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'FEATURES_999',
          message: 'Failed to update tenant features'
        }
      });
    }
  }
);

/**
 * GET /api/tenant-customization/features/:featureName
 * Check if a specific feature is enabled
 */
router.get('/features/:featureName', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { featureName } = req.params;

    const isEnabled = await tenantCustomization.checkFeatureEnabled(tenantId, featureName);

    res.json({
      feature: featureName,
      enabled: isEnabled
    });
  } catch (error) {
    console.error('❌ Failed to check feature:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'FEATURES_002',
        message: 'Failed to check feature status'
      }
    });
  }
});

/**
 * GET /api/tenant-customization/settings
 * Get tenant custom settings
 */
router.get('/settings', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const settings = await tenantCustomization.getTenantSettings(tenantId);

    res.json({
      settings
    });
  } catch (error) {
    console.error('❌ Failed to get tenant settings:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'SETTINGS_001',
        message: 'Failed to retrieve tenant settings'
      }
    });
  }
});

/**
 * PUT /api/tenant-customization/settings
 * Update tenant custom settings (owner/admin only)
 */
router.put('/settings', 
  authenticate, 
  tenantIsolation, 
  requireTenantRole(['owner', 'admin']), 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const settings = req.body;

      const updatedSettings = await tenantCustomization.updateTenantSettings(
        tenantId,
        settings
      );

      // Log settings update
      await tenantDataAccess.logAuditEvent(
        tenantId,
        req.user.id,
        'update',
        'tenant_settings',
        tenantId,
        { updatedSettings: Object.keys(settings) }
      );

      res.json({
        message: 'Tenant settings updated successfully',
        settings: updatedSettings
      });
    } catch (error) {
      console.error('❌ Failed to update tenant settings:', error);
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'SETTINGS_999',
          message: 'Failed to update tenant settings'
        }
      });
    }
  }
);

/**
 * GET /api/tenant-customization/analytics-config
 * Get tenant analytics configuration
 */
router.get('/analytics-config', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const analyticsConfig = await tenantCustomization.getTenantAnalyticsConfig(tenantId);

    res.json({
      analytics: analyticsConfig
    });
  } catch (error) {
    console.error('❌ Failed to get analytics config:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'ANALYTICS_001',
        message: 'Failed to retrieve analytics configuration'
      }
    });
  }
});

/**
 * PUT /api/tenant-customization/analytics-config
 * Update tenant analytics configuration (owner/admin only)
 */
router.put('/analytics-config', 
  authenticate, 
  tenantIsolation, 
  requireTenantRole(['owner', 'admin']), 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const analyticsConfig = req.body;

      const updatedConfig = await tenantCustomization.updateTenantAnalyticsConfig(
        tenantId,
        analyticsConfig
      );

      // Log analytics config update
      await tenantDataAccess.logAuditEvent(
        tenantId,
        req.user.id,
        'update',
        'analytics_config',
        tenantId,
        { updatedFields: Object.keys(analyticsConfig) }
      );

      res.json({
        message: 'Analytics configuration updated successfully',
        analytics: updatedConfig
      });
    } catch (error) {
      console.error('❌ Failed to update analytics config:', error);
      
      if (error.message.includes('not available')) {
        return res.status(403).json({
          error: {
            type: 'FEATURE_DISABLED',
            code: 'ANALYTICS_002',
            message: error.message,
            meta: {
              upgradeUrl: '/upgrade'
            }
          }
        });
      }

      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'ANALYTICS_999',
          message: 'Failed to update analytics configuration'
        }
      });
    }
  }
);

/**
 * GET /api/tenant-customization/quotas
 * Get tenant quota configuration and usage
 */
router.get('/quotas', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const quotas = await tenantCustomization.getTenantQuotaConfig(tenantId);
    const warnings = await tenantCustomization.checkQuotaWarnings(tenantId);

    res.json({
      quotas,
      warnings
    });
  } catch (error) {
    console.error('❌ Failed to get tenant quotas:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'QUOTAS_001',
        message: 'Failed to retrieve tenant quotas'
      }
    });
  }
});

/**
 * PUT /api/tenant-customization/quotas
 * Update tenant quota limits (system admin only)
 */
router.put('/quotas', authenticate, async (req, res) => {
  try {
    // Only system admins can update quota limits
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          type: 'FORBIDDEN',
          code: 'QUOTAS_002',
          message: 'Only system administrators can update quota limits'
        }
      });
    }

    const { tenantId, quotaLimits } = req.body;

    if (!tenantId || !quotaLimits) {
      return res.status(400).json({
        error: {
          type: 'VALIDATION_ERROR',
          code: 'QUOTAS_003',
          message: 'tenantId and quotaLimits are required'
        }
      });
    }

    const updatedQuotas = await tenantCustomization.updateTenantQuotaLimits(
      tenantId,
      quotaLimits
    );

    // Log quota update
    await tenantDataAccess.logAuditEvent(
      tenantId,
      req.user.id,
      'update',
      'tenant_quotas',
      tenantId,
      { updatedLimits: quotaLimits }
    );

    res.json({
      message: 'Tenant quota limits updated successfully',
      quotas: updatedQuotas
    });
  } catch (error) {
    console.error('❌ Failed to update tenant quotas:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'QUOTAS_999',
        message: 'Failed to update tenant quotas'
      }
    });
  }
});

/**
 * GET /api/tenant-customization/monitoring-config
 * Get tenant monitoring configuration
 */
router.get('/monitoring-config', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const monitoringConfig = await tenantCustomization.getTenantMonitoringConfig(tenantId);

    res.json({
      monitoring: monitoringConfig
    });
  } catch (error) {
    console.error('❌ Failed to get monitoring config:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'MONITORING_001',
        message: 'Failed to retrieve monitoring configuration'
      }
    });
  }
});

/**
 * PUT /api/tenant-customization/monitoring-config
 * Update tenant monitoring configuration (owner/admin only)
 */
router.put('/monitoring-config', 
  authenticate, 
  tenantIsolation, 
  requireTenantRole(['owner', 'admin']), 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const monitoringConfig = req.body;

      const updatedConfig = await tenantCustomization.updateTenantMonitoringConfig(
        tenantId,
        monitoringConfig
      );

      // Log monitoring config update
      await tenantDataAccess.logAuditEvent(
        tenantId,
        req.user.id,
        'update',
        'monitoring_config',
        tenantId,
        { updatedFields: Object.keys(monitoringConfig) }
      );

      res.json({
        message: 'Monitoring configuration updated successfully',
        monitoring: updatedConfig
      });
    } catch (error) {
      console.error('❌ Failed to update monitoring config:', error);
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'MONITORING_999',
          message: 'Failed to update monitoring configuration'
        }
      });
    }
  }
);

/**
 * POST /api/tenant-customization/metrics
 * Record a tenant metric
 */
router.post('/metrics', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { metricType, metricValue, metadata } = req.body;

    if (!metricType || metricValue === undefined) {
      return res.status(400).json({
        error: {
          type: 'VALIDATION_ERROR',
          code: 'METRICS_001',
          message: 'metricType and metricValue are required'
        }
      });
    }

    await tenantCustomization.recordTenantMetric(
      tenantId,
      metricType,
      metricValue,
      metadata
    );

    res.json({
      message: 'Metric recorded successfully'
    });
  } catch (error) {
    console.error('❌ Failed to record metric:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'METRICS_999',
        message: 'Failed to record metric'
      }
    });
  }
});

/**
 * GET /api/tenant-customization/metrics
 * Get tenant metrics summary
 */
router.get('/metrics', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate } = req.query;

    // Default to last 30 days if not specified
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const metrics = await tenantCustomization.getTenantMetricsSummary(
      tenantId,
      start,
      end
    );

    res.json({
      metrics,
      period: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Failed to get metrics summary:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'METRICS_002',
        message: 'Failed to retrieve metrics summary'
      }
    });
  }
});

/**
 * GET /api/tenant-customization/summary
 * Get complete tenant customization summary
 */
router.get('/summary', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const summary = await tenantCustomization.getTenantCustomizationSummary(tenantId);

    res.json(summary);
  } catch (error) {
    console.error('❌ Failed to get customization summary:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'SUMMARY_001',
        message: 'Failed to retrieve customization summary'
      }
    });
  }
});

export default router;
