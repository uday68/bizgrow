/**
 * Tenant Isolation Middleware
 * Enforces tenant-specific access controls and data isolation
 * 
 * Requirements: 10.1, 10.2, 10.4
 * - Enforces tenant-specific access controls
 * - Maintains strict data separation during processing
 * - Validates tenant context for all requests
 */

import tenantDataAccess from '../services/tenantDataAccess.js';
import jwt from 'jsonwebtoken';

/**
 * Extract tenant from request
 * Supports multiple tenant identification methods:
 * 1. Subdomain (tenant.example.com)
 * 2. Header (X-Tenant-ID)
 * 3. JWT token claim
 * 4. Query parameter (for development)
 */
const extractTenantId = (req) => {
  // Method 1: From JWT token
  if (req.user && req.user.tenantId) {
    return req.user.tenantId;
  }

  // Method 2: From custom header
  const headerTenantId = req.headers['x-tenant-id'];
  if (headerTenantId) {
    return headerTenantId;
  }

  // Method 3: From subdomain
  const host = req.headers.host || '';
  const subdomain = host.split('.')[0];
  
  // Check if subdomain is a valid tenant slug (not 'www', 'api', etc.)
  if (subdomain && !['www', 'api', 'app', 'localhost'].includes(subdomain)) {
    return subdomain; // Will be resolved to tenant ID
  }

  // Method 4: From query parameter (development only)
  if (process.env.NODE_ENV === 'development' && req.query.tenantId) {
    return req.query.tenantId;
  }

  return null;
};

/**
 * Resolve tenant slug to tenant ID
 */
const resolveTenantId = async (identifier) => {
  // If it's already a UUID, return it
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(identifier)) {
    return identifier;
  }

  // Otherwise, treat it as a slug and look it up
  const tenant = await tenantDataAccess.getTenantBySlug(identifier);
  return tenant ? tenant.id : null;
};

/**
 * Tenant Isolation Middleware
 * Ensures all requests are properly scoped to a tenant
 */
export const tenantIsolation = async (req, res, next) => {
  try {
    // Extract tenant identifier
    const tenantIdentifier = extractTenantId(req);

    if (!tenantIdentifier) {
      return res.status(400).json({
        error: {
          type: 'TENANT_REQUIRED',
          code: 'TENANT_001',
          message: 'Tenant identification is required',
          details: 'Please provide tenant information via subdomain, header, or authentication token'
        }
      });
    }

    // Resolve to tenant ID
    const tenantId = await resolveTenantId(tenantIdentifier);

    if (!tenantId) {
      return res.status(404).json({
        error: {
          type: 'TENANT_NOT_FOUND',
          code: 'TENANT_002',
          message: 'Tenant not found',
          details: 'The specified tenant does not exist or is inactive'
        }
      });
    }

    // Get tenant information
    const tenant = await tenantDataAccess.getTenant(tenantId);

    if (!tenant) {
      return res.status(404).json({
        error: {
          type: 'TENANT_INACTIVE',
          code: 'TENANT_003',
          message: 'Tenant is not active',
          details: 'This tenant account is suspended or cancelled'
        }
      });
    }

    // Validate user has access to this tenant
    if (req.user && req.user.id) {
      const hasAccess = await tenantDataAccess.validateTenantAccess(tenantId, req.user.id);
      
      if (!hasAccess) {
        // Log unauthorized access attempt
        await tenantDataAccess.logAuditEvent(
          tenantId,
          req.user.id,
          'access_denied',
          'tenant',
          tenantId,
          {
            reason: 'User does not belong to tenant',
            ip: req.ip,
            userAgent: req.headers['user-agent']
          }
        );

        return res.status(403).json({
          error: {
            type: 'TENANT_ACCESS_DENIED',
            code: 'TENANT_004',
            message: 'Access denied to tenant',
            details: 'You do not have permission to access this tenant'
          }
        });
      }
    }

    // Validate IP access if tenant has IP restrictions
    if (tenant.allowed_ip_ranges && tenant.allowed_ip_ranges.length > 0) {
      const ipAllowed = await tenantDataAccess.validateIpAccess(tenantId, req.ip);
      
      if (!ipAllowed) {
        // Log IP restriction violation
        await tenantDataAccess.logAuditEvent(
          tenantId,
          req.user?.id,
          'access_denied',
          'tenant',
          tenantId,
          {
            reason: 'IP address not in allowed ranges',
            ip: req.ip,
            userAgent: req.headers['user-agent']
          }
        );

        return res.status(403).json({
          error: {
            type: 'IP_ACCESS_DENIED',
            code: 'TENANT_005',
            message: 'Access denied from this IP address',
            details: 'Your IP address is not in the allowed ranges for this tenant'
          }
        });
      }
    }

    // Set tenant context for this request
    await tenantDataAccess.setTenantContext(tenantId, req.user?.id);

    // Attach tenant information to request
    req.tenant = tenant;
    req.tenantId = tenantId;

    // Log successful access
    await tenantDataAccess.logAuditEvent(
      tenantId,
      req.user?.id,
      'access_granted',
      'tenant',
      tenantId,
      {
        path: req.path,
        method: req.method,
        ip: req.ip
      }
    );

    // Continue to next middleware
    next();
  } catch (error) {
    console.error('❌ Tenant isolation middleware error:', error);
    
    res.status(500).json({
      error: {
        type: 'TENANT_ERROR',
        code: 'TENANT_999',
        message: 'Failed to establish tenant context',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      }
    });
  }
};

/**
 * Tenant Quota Enforcement Middleware
 * Checks if tenant is within quota limits before allowing operations
 */
export const enforceQuota = (quotaType) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          error: {
            type: 'TENANT_REQUIRED',
            code: 'QUOTA_001',
            message: 'Tenant context required for quota enforcement'
          }
        });
      }

      // Check quota
      const withinQuota = await tenantDataAccess.checkTenantQuota(tenantId, quotaType);

      if (!withinQuota) {
        // Log quota exceeded event
        await tenantDataAccess.logAuditEvent(
          tenantId,
          req.user?.id,
          'quota_exceeded',
          quotaType,
          null,
          {
            quotaType,
            path: req.path,
            method: req.method
          }
        );

        return res.status(429).json({
          error: {
            type: 'QUOTA_EXCEEDED',
            code: 'QUOTA_002',
            message: `Tenant ${quotaType} quota exceeded`,
            details: `You have reached the maximum number of ${quotaType} for your plan`,
            meta: {
              quotaType,
              upgradeUrl: '/upgrade'
            }
          }
        });
      }

      next();
    } catch (error) {
      console.error('❌ Quota enforcement error:', error);
      
      res.status(500).json({
        error: {
          type: 'QUOTA_ERROR',
          code: 'QUOTA_999',
          message: 'Failed to check quota limits'
        }
      });
    }
  };
};

/**
 * Tenant Feature Flag Middleware
 * Checks if a feature is enabled for the tenant
 */
export const requireFeature = (featureName) => {
  return async (req, res, next) => {
    try {
      const tenant = req.tenant;

      if (!tenant) {
        return res.status(400).json({
          error: {
            type: 'TENANT_REQUIRED',
            code: 'FEATURE_001',
            message: 'Tenant context required for feature check'
          }
        });
      }

      // Check if feature is enabled
      const featureFlags = tenant.feature_flags || {};
      const isEnabled = featureFlags[featureName] === true;

      if (!isEnabled) {
        return res.status(403).json({
          error: {
            type: 'FEATURE_DISABLED',
            code: 'FEATURE_002',
            message: `Feature '${featureName}' is not enabled for this tenant`,
            details: 'This feature is not available on your current plan',
            meta: {
              feature: featureName,
              upgradeUrl: '/upgrade'
            }
          }
        });
      }

      next();
    } catch (error) {
      console.error('❌ Feature flag check error:', error);
      
      res.status(500).json({
        error: {
          type: 'FEATURE_ERROR',
          code: 'FEATURE_999',
          message: 'Failed to check feature availability'
        }
      });
    }
  };
};

/**
 * Tenant Role Authorization Middleware
 * Checks if user has required tenant role
 */
export const requireTenantRole = (requiredRoles) => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          error: {
            type: 'AUTHENTICATION_REQUIRED',
            code: 'ROLE_001',
            message: 'Authentication required'
          }
        });
      }

      const userRole = user.tenantRole || 'member';
      const allowedRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

      if (!allowedRoles.includes(userRole)) {
        // Log unauthorized role access attempt
        await tenantDataAccess.logAuditEvent(
          req.tenantId,
          user.id,
          'role_access_denied',
          'tenant',
          req.tenantId,
          {
            requiredRoles: allowedRoles,
            userRole,
            path: req.path,
            method: req.method
          }
        );

        return res.status(403).json({
          error: {
            type: 'INSUFFICIENT_PERMISSIONS',
            code: 'ROLE_002',
            message: 'Insufficient tenant permissions',
            details: `Required role: ${allowedRoles.join(' or ')}. Your role: ${userRole}`
          }
        });
      }

      next();
    } catch (error) {
      console.error('❌ Tenant role check error:', error);
      
      res.status(500).json({
        error: {
          type: 'ROLE_ERROR',
          code: 'ROLE_999',
          message: 'Failed to check tenant role'
        }
      });
    }
  };
};

/**
 * Cleanup middleware - Clear tenant context after request
 */
export const cleanupTenantContext = async (req, res, next) => {
  // Store original end function
  const originalEnd = res.end;

  // Override end function to cleanup context
  res.end = async function(...args) {
    try {
      await tenantDataAccess.clearTenantContext();
    } catch (error) {
      console.error('❌ Failed to cleanup tenant context:', error);
    }

    // Call original end function
    originalEnd.apply(res, args);
  };

  next();
};

export default {
  tenantIsolation,
  enforceQuota,
  requireFeature,
  requireTenantRole,
  cleanupTenantContext
};
