/**
 * Tenant Management Routes
 * API endpoints for tenant administration and management
 * 
 * Requirements: 10.1, 10.2, 10.4
 */

import express from 'express';
import tenantDataAccess from '../services/tenantDataAccess.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenantRole, enforceQuota } from '../middleware/tenantIsolation.js';

const router = express.Router();

/**
 * GET /api/tenants/current
 * Get current tenant information
 */
router.get('/current', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        error: {
          type: 'TENANT_REQUIRED',
          message: 'User is not associated with a tenant'
        }
      });
    }

    const tenant = await tenantDataAccess.getTenant(tenantId);

    if (!tenant) {
      return res.status(404).json({
        error: {
          type: 'TENANT_NOT_FOUND',
          message: 'Tenant not found'
        }
      });
    }

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        planType: tenant.plan_type,
        featureFlags: tenant.feature_flags,
        brandingConfig: tenant.branding_config,
        createdAt: tenant.created_at
      }
    });
  } catch (error) {
    console.error('❌ Failed to get current tenant:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        message: 'Failed to retrieve tenant information'
      }
    });
  }
});

/**
 * GET /api/tenants/usage
 * Get tenant usage statistics
 */
router.get('/usage', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        error: {
          type: 'TENANT_REQUIRED',
          message: 'User is not associated with a tenant'
        }
      });
    }

    const usage = await tenantDataAccess.getTenantUsage(tenantId);

    if (!usage) {
      return res.status(404).json({
        error: {
          type: 'TENANT_NOT_FOUND',
          message: 'Tenant not found'
        }
      });
    }

    res.json({
      usage: {
        users: {
          current: usage.current_users,
          max: usage.max_users,
          percent: usage.users_percent
        },
        businesses: {
          current: usage.current_businesses,
          max: usage.max_businesses,
          percent: usage.businesses_percent
        },
        proposals: {
          current: usage.current_proposals,
          max: usage.max_proposals,
          percent: usage.proposals_percent
        },
        storage: {
          current: usage.current_storage_mb,
          max: usage.max_storage_mb,
          percent: usage.storage_percent
        }
      }
    });
  } catch (error) {
    console.error('❌ Failed to get tenant usage:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        message: 'Failed to retrieve usage statistics'
      }
    });
  }
});

/**
 * PUT /api/tenants/settings
 * Update tenant settings (owner/admin only)
 */
router.put('/settings', authenticate, requireTenantRole(['owner', 'admin']), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { featureFlags, customSettings, brandingConfig } = req.body;

    const updatedTenant = await tenantDataAccess.updateTenantSettings(tenantId, {
      featureFlags,
      customSettings,
      brandingConfig
    });

    if (!updatedTenant) {
      return res.status(400).json({
        error: {
          type: 'UPDATE_FAILED',
          message: 'No settings were updated'
        }
      });
    }

    // Log settings update
    await tenantDataAccess.logAuditEvent(
      tenantId,
      req.user.id,
      'update',
      'tenant_settings',
      tenantId,
      { updatedFields: Object.keys(req.body) }
    );

    res.json({
      message: 'Tenant settings updated successfully',
      tenant: {
        id: updatedTenant.id,
        name: updatedTenant.name,
        featureFlags: updatedTenant.feature_flags,
        customSettings: updatedTenant.custom_settings,
        brandingConfig: updatedTenant.branding_config
      }
    });
  } catch (error) {
    console.error('❌ Failed to update tenant settings:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        message: 'Failed to update tenant settings'
      }
    });
  }
});

/**
 * GET /api/tenants/metrics
 * Get tenant metrics (owner/admin only)
 */
router.get('/metrics', authenticate, requireTenantRole(['owner', 'admin']), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { startDate, endDate } = req.query;

    // Default to last 30 days if not specified
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const metrics = await tenantDataAccess.getTenantMetrics(tenantId, start, end);

    res.json({
      metrics,
      period: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Failed to get tenant metrics:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        message: 'Failed to retrieve tenant metrics'
      }
    });
  }
});

/**
 * GET /api/tenants/audit-log
 * Get tenant audit log (owner/admin only)
 */
router.get('/audit-log', authenticate, requireTenantRole(['owner', 'admin']), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { limit = 100, offset = 0, action, severity } = req.query;

    // Build query
    let query = `
      SELECT 
        id, user_id, action, resource_type, resource_id,
        ip_address, details, severity, created_at
      FROM tenant_audit_log
      WHERE tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    await tenantDataAccess.setTenantContext(tenantId, req.user.id);
    const logs = await tenantDataAccess.query(query, params);
    await tenantDataAccess.clearTenantContext();

    res.json({
      logs,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('❌ Failed to get audit log:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        message: 'Failed to retrieve audit log'
      }
    });
  }
});

/**
 * POST /api/tenants/users
 * Create new tenant user (owner/admin only)
 */
router.post('/users', 
  authenticate, 
  requireTenantRole(['owner', 'admin']),
  enforceQuota('users'),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { email, password, firstName, lastName, role, tenantRole } = req.body;

      // Validate required fields
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            message: 'Missing required fields',
            details: 'email, password, firstName, and lastName are required'
          }
        });
      }

      // Create user
      const user = await tenantDataAccess.createTenantUser(tenantId, {
        email,
        password,
        firstName,
        lastName,
        role: role || 'user',
        tenantRole: tenantRole || 'member'
      });

      // Log user creation
      await tenantDataAccess.logAuditEvent(
        tenantId,
        req.user.id,
        'create',
        'user',
        user.id,
        { email: user.email, role: user.role, tenantRole: user.tenant_role }
      );

      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          tenantRole: user.tenant_role,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      console.error('❌ Failed to create tenant user:', error);
      
      if (error.message.includes('quota exceeded')) {
        return res.status(429).json({
          error: {
            type: 'QUOTA_EXCEEDED',
            message: 'User quota exceeded for this tenant'
          }
        });
      }

      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Failed to create user'
        }
      });
    }
  }
);

/**
 * POST /api/tenants (System admin only - for creating new tenants)
 * Create new tenant
 */
router.post('/', authenticate, async (req, res) => {
  try {
    // Only system admins can create tenants
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          type: 'FORBIDDEN',
          message: 'Only system administrators can create tenants'
        }
      });
    }

    const { name, slug, planType, billingEmail, ownerEmail, ownerPassword } = req.body;

    // Validate required fields
    if (!name || !slug) {
      return res.status(400).json({
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Missing required fields',
          details: 'name and slug are required'
        }
      });
    }

    // Create tenant
    const tenant = await tenantDataAccess.createTenant({
      name,
      slug,
      planType: planType || 'free',
      billingEmail,
      ownerEmail,
      ownerPassword
    });

    res.status(201).json({
      message: 'Tenant created successfully',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        planType: tenant.plan_type,
        createdAt: tenant.created_at
      }
    });
  } catch (error) {
    console.error('❌ Failed to create tenant:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: {
          type: 'CONFLICT',
          message: 'Tenant slug already exists'
        }
      });
    }

    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        message: 'Failed to create tenant'
      }
    });
  }
});

export default router;
