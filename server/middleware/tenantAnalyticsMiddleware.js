/**
 * Tenant Analytics Middleware
 * Automatically tracks tenant-specific metrics for all requests
 * 
 * Requirements: 10.5, 10.6
 * - Tracks tenant-aware monitoring and analytics
 * - Records performance metrics per tenant
 */

import tenantAnalytics from '../services/tenantAnalytics.js';

/**
 * Tenant Analytics Tracking Middleware
 * Automatically tracks API requests and performance for each tenant
 */
export const trackTenantAnalytics = (req, res, next) => {
  // Skip analytics for health check and static endpoints
  const skipPaths = ['/health', '/favicon.ico', '/static'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Record request start time
  const startTime = Date.now();

  // Store original end function
  const originalEnd = res.end;

  // Override end function to track analytics
  res.end = async function(...args) {
    try {
      // Calculate response time
      const responseTime = Date.now() - startTime;

      // Track analytics if tenant context is available
      if (req.tenantId) {
        await tenantAnalytics.trackApiRequest(
          req.tenantId,
          req.path,
          req.method,
          res.statusCode,
          responseTime,
          req.user?.id
        );
      }
    } catch (error) {
      console.error('❌ Failed to track tenant analytics:', error);
      // Don't throw - analytics should not break operations
    }

    // Call original end function
    originalEnd.apply(res, args);
  };

  next();
};

/**
 * Track user login analytics
 */
export const trackLoginAnalytics = async (req, res, next) => {
  try {
    if (req.user && req.tenantId) {
      await tenantAnalytics.trackUserLogin(
        req.tenantId,
        req.user.id,
        req.ip,
        req.headers['user-agent']
      );
    }
  } catch (error) {
    console.error('❌ Failed to track login analytics:', error);
  }

  next();
};

/**
 * Track business discovery analytics
 */
export const trackBusinessDiscoveryAnalytics = (businessCount) => {
  return async (req, res, next) => {
    try {
      if (req.tenantId && req.user) {
        await tenantAnalytics.trackBusinessDiscovery(
          req.tenantId,
          businessCount,
          req.user.id
        );
      }
    } catch (error) {
      console.error('❌ Failed to track business discovery analytics:', error);
    }

    next();
  };
};

/**
 * Track proposal generation analytics
 */
export const trackProposalAnalytics = async (req, res, next) => {
  // Store original json function
  const originalJson = res.json;

  // Override json function to track analytics
  res.json = async function(data) {
    try {
      // Track if proposal was created successfully
      if (req.tenantId && req.user && data.proposal && data.proposal.id) {
        await tenantAnalytics.trackProposalGeneration(
          req.tenantId,
          data.proposal.id,
          req.user.id
        );
      }
    } catch (error) {
      console.error('❌ Failed to track proposal analytics:', error);
    }

    // Call original json function
    originalJson.call(res, data);
  };

  next();
};

/**
 * Track project creation analytics
 */
export const trackProjectAnalytics = async (req, res, next) => {
  // Store original json function
  const originalJson = res.json;

  // Override json function to track analytics
  res.json = async function(data) {
    try {
      // Track if project was created successfully
      if (req.tenantId && req.user && data.project && data.project.id) {
        await tenantAnalytics.trackProjectCreation(
          req.tenantId,
          data.project.id,
          req.user.id
        );
      }
    } catch (error) {
      console.error('❌ Failed to track project analytics:', error);
    }

    // Call original json function
    originalJson.call(res, data);
  };

  next();
};

/**
 * Track AI agent execution analytics
 */
export const trackAgentAnalytics = (agentType) => {
  return async (executionTime, success, tenantId, userId) => {
    try {
      if (tenantId) {
        await tenantAnalytics.trackAgentExecution(
          tenantId,
          agentType,
          executionTime,
          success,
          userId
        );
      }
    } catch (error) {
      console.error('❌ Failed to track agent analytics:', error);
    }
  };
};

/**
 * Track cache performance analytics
 */
export const trackCacheAnalytics = async (tenantId, hit) => {
  try {
    if (tenantId) {
      await tenantAnalytics.trackCachePerformance(tenantId, hit);
    }
  } catch (error) {
    console.error('❌ Failed to track cache analytics:', error);
  }
};

export default {
  trackTenantAnalytics,
  trackLoginAnalytics,
  trackBusinessDiscoveryAnalytics,
  trackProposalAnalytics,
  trackProjectAnalytics,
  trackAgentAnalytics,
  trackCacheAnalytics
};
