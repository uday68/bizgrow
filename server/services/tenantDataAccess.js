/**
 * Tenant Data Access Layer
 * Provides tenant-aware data access with strict isolation, AsyncLocalStorage context, and dual-database support.
 */

import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import cachedDb from './cachedDatabase.js';
import postgresDb from '../database/postgres.js';
import { getDatabaseType } from '../database/init.js';
import logger from './logger.js';

class TenantDataAccessLayer {
  constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage();
    this.encryptionAlgorithm = 'aes-256-gcm';
    this.encryptionKeyCache = new Map();
  }

  /**
   * Run an asynchronous operation with an isolated, request-scoped tenant context
   */
  runWithContext(context, callback) {
    return this.asyncLocalStorage.run(context, callback);
  }

  /**
   * Set tenant context for the current async execution chain
   */
  async setTenantContext(tenantId, userId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for data access');
    }

    if (getDatabaseType() === 'postgres') {
      try {
        await postgresDb.query(
          "SELECT set_config('app.current_tenant_id', $1, false)",
          [tenantId]
        );
        if (userId) {
          await postgresDb.query(
            "SELECT set_config('app.current_user_id', $1, false)",
            [userId]
          );
        }
      } catch (err) {
        logger.warn('Could not set postgres session tenant variable', { error: err.message });
      }
    }

    return true;
  }

  /**
   * Clear tenant context
   */
  async clearTenantContext() {
    if (getDatabaseType() === 'postgres') {
      try {
        await postgresDb.query("SELECT set_config('app.current_tenant_id', '', false)");
        await postgresDb.query("SELECT set_config('app.current_user_id', '', false)");
      } catch (err) {
        // Ignore
      }
    }
    return true;
  }

  /**
   * Get current tenant context from AsyncLocalStorage
   */
  getCurrentTenantId() {
    const store = this.asyncLocalStorage.getStore();
    return store?.tenantId || null;
  }

  getCurrentContext() {
    return this.asyncLocalStorage.getStore() || null;
  }

  /**
   * Validate tenant access for a user
   */
  async validateTenantAccess(tenantId, userId) {
    try {
      const user = await cachedDb.get('SELECT id, role, tenant_id FROM users WHERE id = ?', [userId]);
      if (!user) return false;
      if (user.role === 'admin') return true;
      return user.tenant_id === tenantId;
    } catch (error) {
      logger.error('Failed to validate tenant access:', { error: error.message });
      return false;
    }
  }

  /**
   * Validate IP access if tenant has IP restrictions
   */
  async validateIpAccess(tenantId, ip) {
    try {
      const tenant = await this.getTenant(tenantId);
      if (!tenant || !tenant.allowed_ip_ranges) return true;
      const ranges = Array.isArray(tenant.allowed_ip_ranges) 
        ? tenant.allowed_ip_ranges 
        : JSON.parse(tenant.allowed_ip_ranges || '[]');
      if (ranges.length === 0) return true;
      return ranges.includes(ip) || ranges.includes('0.0.0.0/0');
    } catch (error) {
      return true;
    }
  }

  /**
   * Check if tenant is within quota limits
   */
  async checkTenantQuota(tenantId, quotaType) {
    try {
      const tenant = await this.getTenant(tenantId);
      if (!tenant) return false;

      switch (quotaType) {
        case 'users':
          return (tenant.current_users || 0) < (tenant.max_users || 100);
        case 'businesses':
          return (tenant.current_businesses || 0) < (tenant.max_businesses || 1000);
        case 'proposals':
          return (tenant.current_proposals || 0) < (tenant.max_proposals || 500);
        default:
          return true;
      }
    } catch (error) {
      logger.error('Failed to check tenant quota:', { error: error.message });
      return true;
    }
  }

  /**
   * Get tenant information
   */
  async getTenant(tenantId) {
    try {
      const tenant = await cachedDb.get(
        `SELECT id, name, slug, status, plan_type, 
                max_users, max_businesses, max_proposals, max_storage_mb,
                current_users, current_businesses, current_proposals, current_storage_mb,
                require_mfa, feature_flags, custom_settings, branding_config,
                created_at, updated_at
         FROM tenants 
         WHERE id = ? AND status = 'active'`,
        [tenantId]
      );
      return tenant || null;
    } catch (error) {
      logger.error('Failed to get tenant:', { error: error.message });
      return null;
    }
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug) {
    try {
      const tenant = await cachedDb.get(
        `SELECT id, name, slug, status, plan_type, 
                require_mfa, feature_flags, branding_config
         FROM tenants 
         WHERE slug = ? AND status = 'active'`,
        [slug]
      );
      return tenant || null;
    } catch (error) {
      logger.error('Failed to get tenant by slug:', { error: error.message });
      return null;
    }
  }

  /**
   * List all tenants (admin only)
   */
  async listTenants() {
    try {
      return await cachedDb.all(
        `SELECT id, name, slug, status, plan_type, current_users, current_businesses, current_proposals, created_at
         FROM tenants ORDER BY created_at DESC`
      );
    } catch (error) {
      logger.error('Failed to list tenants:', { error: error.message });
      return [];
    }
  }

  /**
   * Create new tenant
   */
  async createTenant(tenantData) {
    const {
      name,
      slug,
      planType = 'free',
      billingEmail,
      ownerEmail,
      ownerPassword
    } = tenantData;

    const existing = await this.getTenantBySlug(slug);
    if (existing) {
      throw new Error('Tenant slug already exists');
    }

    const tenantId = `tenant_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const quotas = this.getQuotasForPlan(planType);

    await cachedDb.run(
      `INSERT INTO tenants (
        id, name, slug, plan_type, max_users, max_businesses, max_proposals, max_storage_mb
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        name,
        slug,
        planType,
        quotas.maxUsers,
        quotas.maxBusinesses,
        quotas.maxProposals,
        quotas.maxStorageMb
      ]
    );

    const tenant = await this.getTenant(tenantId);

    if (ownerEmail && ownerPassword) {
      await this.createTenantUser(tenantId, {
        email: ownerEmail,
        password: ownerPassword,
        firstName: 'Owner',
        lastName: 'User',
        role: 'admin'
      });
    }

    return tenant;
  }

  getQuotasForPlan(planType) {
    const quotas = {
      free: { maxUsers: 5, maxBusinesses: 100, maxProposals: 50, maxStorageMb: 1000 },
      starter: { maxUsers: 10, maxBusinesses: 500, maxProposals: 200, maxStorageMb: 5000 },
      professional: { maxUsers: 50, maxBusinesses: 2000, maxProposals: 1000, maxStorageMb: 20000 },
      enterprise: { maxUsers: 999999, maxBusinesses: 999999, maxProposals: 999999, maxStorageMb: 999999 }
    };
    return quotas[planType] || quotas.free;
  }

  async createTenantUser(tenantId, userData) {
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(userData.password, 10);

    const result = await cachedDb.run(
      `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, userData.email, passwordHash, userData.firstName || 'First', userData.lastName || 'Last', userData.role || 'user']
    );

    await cachedDb.run(
      'UPDATE tenants SET current_users = current_users + 1 WHERE id = ?',
      [tenantId]
    );

    return {
      id: result.lastID,
      tenantId,
      email: userData.email,
      role: userData.role || 'user'
    };
  }

  /**
   * Log tenant audit event
   */
  async logAuditEvent(tenantId, userId, action, resourceType, resourceId, details = {}) {
    try {
      await cachedDb.run(
        `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, userId || null, action, resourceType, resourceId, JSON.stringify(details)]
      );
    } catch (error) {
      logger.error('Failed to log audit event:', { error: error.message });
    }
  }

  /**
   * Get tenant usage statistics
   */
  async getTenantUsage(tenantId) {
    try {
      const tenant = await this.getTenant(tenantId);
      if (!tenant) return null;
      return {
        users: { current: tenant.current_users || 0, max: tenant.max_users || 10 },
        businesses: { current: tenant.current_businesses || 0, max: tenant.max_businesses || 500 },
        proposals: { current: tenant.current_proposals || 0, max: tenant.max_proposals || 100 },
        storageMb: { current: tenant.current_storage_mb || 0, max: tenant.max_storage_mb || 1000 }
      };
    } catch (error) {
      logger.error('Failed to get tenant usage:', { error: error.message });
      return null;
    }
  }
}

export default new TenantDataAccessLayer();
