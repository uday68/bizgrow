/**
 * Tenant Isolation Middleware
 * Enforces tenant-specific access controls, context isolation, and ownership boundaries.
 */

import tenantDataAccess from '../services/tenantDataAccess.js';
import logger from '../services/logger.js';

const extractTenantIdentifier = (req) => {
  // Method 1: If user is authenticated, user's bound tenantId takes precedence
  if (req.user && req.user.tenantId) {
    const requestedHeader = req.headers['x-tenant-id'];
    // Non-admin users cannot override their token's tenant
    if (requestedHeader && requestedHeader !== req.user.tenantId) {
      if (req.user.role !== 'admin') {
        return { error: 'FORBIDDEN_CROSS_TENANT' };
      }
      return { id: requestedHeader };
    }
    return { id: req.user.tenantId };
  }

  // Method 2: Header (for unauthenticated public tenant discovery/login)
  const headerTenantId = req.headers['x-tenant-id'];
  if (headerTenantId) {
    return { id: headerTenantId };
  }

  // Method 3: Subdomain (tenant.example.com)
  const host = req.headers.host || '';
  const subdomain = host.split('.')[0];
  if (subdomain && !['www', 'api', 'app', 'localhost', '127'].includes(subdomain)) {
    return { id: subdomain };
  }

  // Default fallback for development/testing if no tenant provided
  if (process.env.NODE_ENV !== 'production') {
    return { id: req.query.tenantId || 'default' };
  }

  return { id: null };
};

export const tenantIsolation = async (req, res, next) => {
  try {
    const extraction = extractTenantIdentifier(req);

    if (extraction.error === 'FORBIDDEN_CROSS_TENANT') {
      logger.warn('Forbidden cross-tenant access attempt', {
        userId: req.user?.id,
        userTenant: req.user?.tenantId,
        requestedTenant: req.headers['x-tenant-id'],
        path: req.path
      });
      return res.status(403).json({
        error: {
          type: 'TENANT_ACCESS_DENIED',
          code: 'CROSS_TENANT_FORBIDDEN',
          message: 'Access denied: Cannot access resources across tenant boundaries'
        }
      });
    }

    let tenantIdentifier = extraction.id;

    if (!tenantIdentifier) {
      return res.status(400).json({
        error: {
          type: 'TENANT_REQUIRED',
          code: 'TENANT_001',
          message: 'Tenant identification is required'
        }
      });
    }

    // Resolve tenant by ID or slug
    let tenant = await tenantDataAccess.getTenant(tenantIdentifier);
    if (!tenant) {
      tenant = await tenantDataAccess.getTenantBySlug(tenantIdentifier);
    }

    if (!tenant) {
      // If default tenant in dev/test doesn't exist yet, allow graceful fallback
      if (tenantIdentifier === 'default' && process.env.NODE_ENV !== 'production') {
        tenant = { id: 'default', name: 'Default Enterprise', slug: 'default', status: 'active' };
      } else {
        return res.status(404).json({
          error: {
            type: 'TENANT_NOT_FOUND',
            code: 'TENANT_002',
            message: 'Tenant not found or inactive'
          }
        });
      }
    }

    const tenantId = tenant.id;

    // Validate authenticated user has access to this tenant
    if (req.user && req.user.id) {
      const hasAccess = await tenantDataAccess.validateTenantAccess(tenantId, req.user.id);
      if (!hasAccess && req.user.tenantId !== tenantId) {
        await tenantDataAccess.logAuditEvent(
          tenantId,
          req.user.id,
          'access_denied',
          'tenant',
          tenantId,
          { reason: 'User not authorized for tenant', path: req.path }
        );

        return res.status(403).json({
          error: {
            type: 'TENANT_ACCESS_DENIED',
            code: 'TENANT_004',
            message: 'Access denied to this tenant'
          }
        });
      }
    }

    // Attach to request
    req.tenant = tenant;
    req.tenantId = tenantId;

    // Run the remainder of request inside request-scoped AsyncLocalStorage
    tenantDataAccess.runWithContext({ tenantId, userId: req.user?.id, tenant }, () => {
      next();
    });
  } catch (error) {
    logger.error('Tenant isolation middleware error:', { error: error.message });
    res.status(500).json({
      error: {
        type: 'SERVER_ERROR',
        message: 'Internal error resolving tenant context'
      }
    });
  }
};

export default tenantIsolation;
