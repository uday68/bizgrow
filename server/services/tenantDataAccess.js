/**
 * Tenant Data Access Layer
 * Provides tenant-aware data access with strict isolation and security
 * 
 * Requirements: 10.1, 10.2, 10.4
 * - Implements tenant isolation for data and configuration
 * - Enforces tenant-specific access controls
 * - Maintains strict data separation during processing
 */

import postgresDb from '../database/postgres.js';
import crypto from 'crypto';

class TenantDataAccessLayer {
  constructor() {
    this.currentTenantContext = new Map(); // Thread-local tenant context
    this.encryptionAlgorithm = 'aes-256-gcm';
    this.encryptionKeyCache = new Map(); // Cache for tenant encryption keys
  }

  /**
   * Set tenant context for current operation
   * This ensures all subsequent queries are scoped to the tenant
   */
  async setTenantContext(tenantId, userId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for data access');
    }

    try {
      // Set PostgreSQL session variable for RLS
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

      // Store in local context
      this.currentTenantContext.set('tenantId', tenantId);
      this.currentTenantContext.set('userId', userId);

      return true;
    } catch (error) {
      console.error('❌ Failed to set tenant context:', error);
      throw new Error('Failed to establish tenant context');
    }
  }

  /**
   * Clear tenant context
   */
  async clearTenantContext() {
    try {
      await postgresDb.query(
        "SELECT set_config('app.current_tenant_id', '', false)"
      );
      await postgresDb.query(
        "SELECT set_config('app.current_user_id', '', false)"
      );

      this.currentTenantContext.clear();
      return true;
    } catch (error) {
      console.error('❌ Failed to clear tenant context:', error);
      throw error;
    }
  }

  /**
   * Get current tenant context
   */
  getCurrentTenantId() {
    return this.currentTenantContext.get('tenantId');
  }

  /**
   * Validate tenant access for a user
   */
  async validateTenantAccess(tenantId, userId) {
    try {
      const result = await postgresDb.query(
        'SELECT validate_tenant_access($1, $2) as has_access',
        [tenantId, userId]
      );

      return result.rows[0]?.has_access || false;
    } catch (error) {
      console.error('❌ Failed to validate tenant access:', error);
      return false;
    }
  }

  /**
   * Check if tenant is within quota limits
   */
  async checkTenantQuota(tenantId, quotaType) {
    try {
      const result = await postgresDb.query(
        'SELECT check_tenant_quota($1, $2) as within_quota',
        [tenantId, quotaType]
      );

      return result.rows[0]?.within_quota || false;
    } catch (error) {
      console.error('❌ Failed to check tenant quota:', error);
      return false;
    }
  }

  /**
   * Get tenant information
   */
  async getTenant(tenantId) {
    try {
      const result = await postgresDb.query(
        `SELECT id, name, slug, status, plan_type, 
                max_users, max_businesses, max_proposals, max_storage_mb,
                current_users, current_businesses, current_proposals, current_storage_mb,
                require_mfa, feature_flags, custom_settings, branding_config,
                created_at, updated_at, trial_ends_at
         FROM tenants 
         WHERE id = $1 AND status = 'active'`,
        [tenantId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Failed to get tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug) {
    try {
      const result = await postgresDb.query(
        `SELECT id, name, slug, status, plan_type, 
                require_mfa, feature_flags, branding_config
         FROM tenants 
         WHERE slug = $1 AND status = 'active'`,
        [slug]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Failed to get tenant by slug:', error);
      throw error;
    }
  }

  /**
   * Create new tenant
   */
  async createTenant(tenantData) {
    try {
      const {
        name,
        slug,
        planType = 'free',
        billingEmail,
        ownerEmail,
        ownerPassword
      } = tenantData;

      // Validate slug uniqueness
      const existing = await this.getTenantBySlug(slug);
      if (existing) {
        throw new Error('Tenant slug already exists');
      }

      // Set quota limits based on plan
      const quotas = this.getQuotasForPlan(planType);

      // Create tenant
      const tenantResult = await postgresDb.query(
        `INSERT INTO tenants (
          name, slug, plan_type, billing_email,
          max_users, max_businesses, max_proposals, max_storage_mb,
          encryption_key_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, name, slug, status, plan_type, created_at`,
        [
          name,
          slug,
          planType,
          billingEmail,
          quotas.maxUsers,
          quotas.maxBusinesses,
          quotas.maxProposals,
          quotas.maxStorageMb,
          crypto.randomBytes(32).toString('hex') // Generate encryption key ID
        ]
      );

      const tenant = tenantResult.rows[0];

      // Create owner user if provided
      if (ownerEmail && ownerPassword) {
        await this.createTenantUser(tenant.id, {
          email: ownerEmail,
          password: ownerPassword,
          firstName: 'Owner',
          lastName: 'User',
          role: 'admin',
          tenantRole: 'owner'
        });
      }

      console.log(`✅ Created tenant: ${tenant.name} (${tenant.slug})`);
      return tenant;
    } catch (error) {
      console.error('❌ Failed to create tenant:', error);
      throw error;
    }
  }

  /**
   * Get quota limits for a plan type
   */
  getQuotasForPlan(planType) {
    const quotas = {
      free: {
        maxUsers: 5,
        maxBusinesses: 100,
        maxProposals: 50,
        maxStorageMb: 1000
      },
      starter: {
        maxUsers: 10,
        maxBusinesses: 500,
        maxProposals: 200,
        maxStorageMb: 5000
      },
      professional: {
        maxUsers: 50,
        maxBusinesses: 2000,
        maxProposals: 1000,
        maxStorageMb: 20000
      },
      enterprise: {
        maxUsers: 999999,
        maxBusinesses: 999999,
        maxProposals: 999999,
        maxStorageMb: 999999
      }
    };

    return quotas[planType] || quotas.free;
  }

  /**
   * Create tenant user with proper isolation
   */
  async createTenantUser(tenantId, userData) {
    try {
      // Set tenant context
      await this.setTenantContext(tenantId);

      // Check quota
      const withinQuota = await this.checkTenantQuota(tenantId, 'users');
      if (!withinQuota) {
        throw new Error('Tenant user quota exceeded');
      }

      const {
        email,
        password,
        firstName,
        lastName,
        role = 'user',
        tenantRole = 'member'
      } = userData;

      // Hash password (using bcrypt in actual implementation)
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(password, 12);

      const result = await postgresDb.query(
        `INSERT INTO users (
          tenant_id, email, password_hash, first_name, last_name, role, tenant_role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, email, first_name, last_name, role, tenant_role, created_at`,
        [tenantId, email, passwordHash, firstName, lastName, role, tenantRole]
      );

      await this.clearTenantContext();
      return result.rows[0];
    } catch (error) {
      await this.clearTenantContext();
      console.error('❌ Failed to create tenant user:', error);
      throw error;
    }
  }

  /**
   * Query with automatic tenant isolation
   * All queries are automatically scoped to the current tenant
   */
  async query(sql, params = []) {
    const tenantId = this.getCurrentTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not set. Call setTenantContext() first.');
    }

    try {
      const result = await postgresDb.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('❌ Tenant-scoped query failed:', error);
      throw error;
    }
  }

  /**
   * Execute transaction with tenant isolation
   */
  async transaction(tenantId, callback) {
    const client = await postgresDb.pool.connect();

    try {
      await client.query('BEGIN');

      // Set tenant context for this transaction
      await client.query(
        "SELECT set_config('app.current_tenant_id', $1, true)", // true = transaction-local
        [tenantId]
      );

      const result = await callback(client);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Tenant transaction failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Encrypt sensitive tenant data
   */
  encryptData(data, tenantId) {
    try {
      const encryptionKey = this.getTenantEncryptionKey(tenantId);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.encryptionAlgorithm, encryptionKey, iv);

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.error('❌ Failed to encrypt data:', error);
      throw error;
    }
  }

  /**
   * Decrypt sensitive tenant data
   */
  decryptData(encryptedData, tenantId) {
    try {
      const encryptionKey = this.getTenantEncryptionKey(tenantId);
      const decipher = crypto.createDecipheriv(
        this.encryptionAlgorithm,
        encryptionKey,
        Buffer.from(encryptedData.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      console.error('❌ Failed to decrypt data:', error);
      throw error;
    }
  }

  /**
   * Get or generate tenant encryption key
   */
  getTenantEncryptionKey(tenantId) {
    // Check cache first
    if (this.encryptionKeyCache.has(tenantId)) {
      return this.encryptionKeyCache.get(tenantId);
    }

    // In production, this should retrieve from a secure key management service
    // For now, derive from tenant ID and master key
    const masterKey = process.env.TENANT_MASTER_KEY || 'default-master-key-change-in-production';
    const key = crypto.pbkdf2Sync(
      tenantId,
      masterKey,
      100000,
      32,
      'sha256'
    );

    this.encryptionKeyCache.set(tenantId, key);
    return key;
  }

  /**
   * Log tenant audit event
   */
  async logAuditEvent(tenantId, userId, action, resourceType, resourceId, details = {}) {
    try {
      await postgresDb.query(
        `INSERT INTO tenant_audit_log (
          tenant_id, user_id, action, resource_type, resource_id, details
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, userId, action, resourceType, resourceId, JSON.stringify(details)]
      );
    } catch (error) {
      console.error('❌ Failed to log audit event:', error);
      // Don't throw - audit logging should not break operations
    }
  }

  /**
   * Get tenant usage statistics
   */
  async getTenantUsage(tenantId) {
    try {
      const result = await postgresDb.query(
        `SELECT 
          current_users, max_users,
          current_businesses, max_businesses,
          current_proposals, max_proposals,
          current_storage_mb, max_storage_mb,
          ROUND((current_users::DECIMAL / NULLIF(max_users, 0)) * 100, 2) as users_percent,
          ROUND((current_businesses::DECIMAL / NULLIF(max_businesses, 0)) * 100, 2) as businesses_percent,
          ROUND((current_proposals::DECIMAL / NULLIF(max_proposals, 0)) * 100, 2) as proposals_percent,
          ROUND((current_storage_mb::DECIMAL / NULLIF(max_storage_mb, 0)) * 100, 2) as storage_percent
         FROM tenants 
         WHERE id = $1`,
        [tenantId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Failed to get tenant usage:', error);
      throw error;
    }
  }

  /**
   * Update tenant settings
   */
  async updateTenantSettings(tenantId, settings) {
    try {
      const { featureFlags, customSettings, brandingConfig } = settings;

      const updates = [];
      const params = [tenantId];
      let paramIndex = 2;

      if (featureFlags !== undefined) {
        updates.push(`feature_flags = $${paramIndex}`);
        params.push(JSON.stringify(featureFlags));
        paramIndex++;
      }

      if (customSettings !== undefined) {
        updates.push(`custom_settings = $${paramIndex}`);
        params.push(JSON.stringify(customSettings));
        paramIndex++;
      }

      if (brandingConfig !== undefined) {
        updates.push(`branding_config = $${paramIndex}`);
        params.push(JSON.stringify(brandingConfig));
        paramIndex++;
      }

      if (updates.length === 0) {
        return null;
      }

      const result = await postgresDb.query(
        `UPDATE tenants 
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, name, feature_flags, custom_settings, branding_config`,
        params
      );

      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to update tenant settings:', error);
      throw error;
    }
  }

  /**
   * Validate IP access for tenant
   */
  async validateIpAccess(tenantId, ipAddress) {
    try {
      const tenant = await this.getTenant(tenantId);
      
      if (!tenant || !tenant.allowed_ip_ranges || tenant.allowed_ip_ranges.length === 0) {
        // No IP restrictions
        return true;
      }

      // Check if IP is in allowed ranges
      const result = await postgresDb.query(
        `SELECT EXISTS(
          SELECT 1 FROM tenants 
          WHERE id = $1 
          AND $2::inet <<= ANY(allowed_ip_ranges)
        ) as allowed`,
        [tenantId, ipAddress]
      );

      return result.rows[0]?.allowed || false;
    } catch (error) {
      console.error('❌ Failed to validate IP access:', error);
      return false;
    }
  }

  /**
   * Get tenant metrics for monitoring
   */
  async getTenantMetrics(tenantId, startDate, endDate) {
    try {
      const result = await postgresDb.query(
        `SELECT 
          metric_type,
          SUM(metric_value) as total_value,
          AVG(metric_value) as avg_value,
          MAX(metric_value) as max_value,
          COUNT(*) as data_points
         FROM tenant_usage_metrics
         WHERE tenant_id = $1
         AND period_start >= $2
         AND period_end <= $3
         GROUP BY metric_type`,
        [tenantId, startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get tenant metrics:', error);
      throw error;
    }
  }
}

// Singleton instance
const tenantDataAccess = new TenantDataAccessLayer();

export default tenantDataAccess;
