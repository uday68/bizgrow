import cacheService from '../services/cacheService.js';
import { createHash } from 'crypto';

/**
 * Cache middleware for Express routes
 * Provides automatic caching based on route patterns and strategies
 */

/**
 * Generate cache key from request
 */
function generateRequestKey(req) {
  const { method, path, query, user } = req;
  const keyData = {
    method,
    path,
    query: Object.keys(query).length > 0 ? query : undefined,
    userId: user?.id
  };
  
  const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
  return createHash('md5').update(keyString).digest('hex');
}

/**
 * Generic cache middleware
 */
export function cacheMiddleware(namespace, ttl = null, keyGenerator = null) {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = keyGenerator ? keyGenerator(req) : generateRequestKey(req);
      const cached = await cacheService.get(namespace, cacheKey);

      if (cached) {
        // Cache hit - return cached response
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);
        return res.json(cached);
      }

      // Cache miss - continue to route handler
      res.set('X-Cache', 'MISS');
      res.set('X-Cache-Key', cacheKey);

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data) {
        // Cache the response data
        cacheService.set(namespace, cacheKey, data, {}, ttl)
          .catch(error => console.error('Cache set error in middleware:', error));
        
        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Business data caching middleware
 */
export const businessCache = cacheMiddleware('businesses', 3600); // 1 hour

/**
 * Analytics data caching middleware
 */
export const analyticsCache = cacheMiddleware('analytics', 300); // 5 minutes

/**
 * User data caching middleware
 */
export const userCache = cacheMiddleware('users', 1800); // 30 minutes

/**
 * Agent status caching middleware
 */
export const agentCache = cacheMiddleware('agents', 120); // 2 minutes

/**
 * Query result caching middleware
 */
export const queryCache = cacheMiddleware('queries', 600); // 10 minutes

/**
 * Session caching middleware
 */
export function sessionCache(req, res, next) {
  if (!req.user) {
    return next();
  }

  const sessionKey = `session_${req.user.id}`;
  
  // Try to get session data from cache
  cacheService.get('sessions', sessionKey)
    .then(sessionData => {
      if (sessionData) {
        req.cachedSession = sessionData;
      }
      next();
    })
    .catch(error => {
      console.error('Session cache error:', error);
      next();
    });
}

/**
 * Cache invalidation middleware
 */
export function invalidateCache(namespaces) {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Override response methods to invalidate cache after successful operations
    const invalidateAfterResponse = function(data) {
      // Only invalidate on successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        Promise.all(
          namespaces.map(namespace => cacheService.invalidateNamespace(namespace))
        ).catch(error => console.error('Cache invalidation error:', error));
      }
      return data;
    };

    res.json = function(data) {
      const result = originalJson.call(this, data);
      invalidateAfterResponse(data);
      return result;
    };

    res.send = function(data) {
      const result = originalSend.call(this, data);
      invalidateAfterResponse(data);
      return result;
    };

    next();
  };
}

/**
 * Cache warming middleware - preloads frequently accessed data
 */
export function warmCache() {
  return async (req, res, next) => {
    try {
      // Warm up common cache entries in background
      setImmediate(async () => {
        try {
          // Example: Warm up agent status cache
          const agentKey = 'agent_status_all';
          const cached = await cacheService.get('agents', agentKey);
          
          if (!cached) {
            // This would typically fetch from database
            const agentData = { status: 'warming', timestamp: Date.now() };
            await cacheService.set('agents', agentKey, agentData);
          }
        } catch (error) {
          console.error('Cache warming error:', error);
        }
      });
    } catch (error) {
      console.error('Cache warm middleware error:', error);
    }
    
    next();
  };
}

/**
 * Cache metrics middleware - adds cache metrics to response headers
 */
export function cacheMetrics(req, res, next) {
  const originalJson = res.json;
  
  res.json = function(data) {
    const metrics = cacheService.getMetrics();
    res.set('X-Cache-Hit-Rate', metrics.hitRate);
    res.set('X-Cache-Total-Requests', metrics.totalRequests);
    res.set('X-Cache-Connected', metrics.isConnected);
    
    return originalJson.call(this, data);
  };
  
  next();
}

/**
 * Conditional caching based on user role
 */
export function conditionalCache(namespace, conditions = {}) {
  return async (req, res, next) => {
    // Check conditions
    if (conditions.roles && req.user) {
      if (!conditions.roles.includes(req.user.role)) {
        return next(); // Skip caching for this role
      }
    }

    if (conditions.skipForAdmin && req.user?.role === 'admin') {
      return next(); // Skip caching for admin users
    }

    // Apply caching
    return cacheMiddleware(namespace, conditions.ttl)(req, res, next);
  };
}

/**
 * Cache-aside pattern helper for database queries
 */
export async function cacheAsideQuery(namespace, key, queryFunction, ttl = null, params = {}) {
  return await cacheService.getOrSet(namespace, key, queryFunction, params, ttl);
}

/**
 * Write-through pattern helper for database writes
 */
export async function writeThroughUpdate(namespace, key, data, updateFunction, ttl = null, params = {}) {
  return await cacheService.writeThrough(namespace, key, data, updateFunction, params, ttl);
}

/**
 * Write-behind pattern helper for database writes
 */
export async function writeBehindUpdate(namespace, key, data, updateFunction, ttl = null, params = {}) {
  return await cacheService.writeBehind(namespace, key, data, updateFunction, params, ttl);
}

/**
 * Batch cache operations
 */
export async function batchCacheGet(namespace, keys, params = {}) {
  return await cacheService.mget(namespace, keys, params);
}

export async function batchCacheSet(namespace, keyValuePairs, params = {}, ttl = null) {
  return await cacheService.mset(namespace, keyValuePairs, params, ttl);
}

/**
 * Cache health check endpoint helper
 */
export async function getCacheHealth() {
  return await cacheService.healthCheck();
}

/**
 * Cache cleanup helper
 */
export async function cleanupCache() {
  return await cacheService.cleanup();
}

/**
 * Get cache metrics
 */
export function getCacheMetrics() {
  return cacheService.getMetrics();
}

/**
 * Get cache info
 */
export async function getCacheInfo() {
  return await cacheService.getCacheInfo();
}