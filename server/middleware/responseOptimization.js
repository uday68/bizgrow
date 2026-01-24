import zlib from 'zlib';
import { promisify } from 'util';

// Promisify compression functions
const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);
const brotliCompress = promisify(zlib.brotliCompress);

/**
 * Response Optimization Middleware
 * Implements compression, cache headers, and response time monitoring
 */

// Configuration
const COMPRESSION_CONFIG = {
  threshold: 1024, // 1KB minimum size for compression
  level: 6, // Compression level (1-9, 6 is default)
  chunkSize: 16 * 1024, // 16KB chunks
  windowBits: 15,
  memLevel: 8
};

const CACHE_HEADERS_CONFIG = {
  static: {
    maxAge: 31536000, // 1 year for static assets
    immutable: true
  },
  api: {
    maxAge: 300, // 5 minutes for API responses
    mustRevalidate: true
  },
  dynamic: {
    maxAge: 0, // No caching for dynamic content
    noCache: true
  }
};

// Response time tracking
const responseTimeMetrics = {
  totalRequests: 0,
  totalResponseTime: 0,
  slowRequests: 0,
  fastRequests: 0,
  averageResponseTime: 0,
  p95ResponseTime: 0,
  p99ResponseTime: 0,
  responseTimes: []
};

/**
 * Response compression middleware
 * Compresses responses larger than 1KB using gzip, deflate, or brotli
 */
export function responseCompression(options = {}) {
  const config = { ...COMPRESSION_CONFIG, ...options };

  return (req, res, next) => {
    // Skip compression for certain conditions
    if (shouldSkipCompression(req, res)) {
      return next();
    }

    // Store original methods
    const originalSend = res.send;
    const originalJson = res.json;

    // Override res.send
    res.send = async function(data) {
      try {
        const compressed = await compressResponse(data, req, res, config);
        if (compressed) {
          return originalSend.call(this, compressed.data);
        }
        return originalSend.call(this, data);
      } catch (error) {
        console.error('Compression error:', error);
        return originalSend.call(this, data);
      }
    };

    // Override res.json
    res.json = async function(data) {
      try {
        const jsonString = JSON.stringify(data);
        const compressed = await compressResponse(jsonString, req, res, config);
        if (compressed) {
          res.set('Content-Type', 'application/json');
          return originalSend.call(this, compressed.data);
        }
        return originalJson.call(this, data);
      } catch (error) {
        console.error('JSON compression error:', error);
        return originalJson.call(this, data);
      }
    };

    next();
  };
}

/**
 * Determine if compression should be skipped
 */
function shouldSkipCompression(req, res) {
  // Skip if already compressed
  if (res.get('Content-Encoding')) {
    return true;
  }

  // Skip for certain content types
  const contentType = res.get('Content-Type') || '';
  const skipTypes = [
    'image/',
    'video/',
    'audio/',
    'application/zip',
    'application/gzip',
    'application/x-rar-compressed'
  ];

  if (skipTypes.some(type => contentType.startsWith(type))) {
    return true;
  }

  // Skip if client doesn't support compression
  const acceptEncoding = req.get('Accept-Encoding') || '';
  if (!acceptEncoding.includes('gzip') && 
      !acceptEncoding.includes('deflate') && 
      !acceptEncoding.includes('br')) {
    return true;
  }

  return false;
}

/**
 * Compress response data
 */
async function compressResponse(data, req, res, config) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  
  // Skip compression if data is too small
  if (buffer.length < config.threshold) {
    return null;
  }

  const acceptEncoding = req.get('Accept-Encoding') || '';
  let compressed;
  let encoding;

  try {
    // Choose compression method based on client support and efficiency
    if (acceptEncoding.includes('br')) {
      // Brotli compression (best compression ratio)
      compressed = await brotliCompress(buffer, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: config.level,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length
        }
      });
      encoding = 'br';
    } else if (acceptEncoding.includes('gzip')) {
      // Gzip compression (widely supported)
      compressed = await gzip(buffer, {
        level: config.level,
        chunkSize: config.chunkSize,
        windowBits: config.windowBits,
        memLevel: config.memLevel
      });
      encoding = 'gzip';
    } else if (acceptEncoding.includes('deflate')) {
      // Deflate compression (fallback)
      compressed = await deflate(buffer, {
        level: config.level,
        chunkSize: config.chunkSize,
        windowBits: config.windowBits,
        memLevel: config.memLevel
      });
      encoding = 'deflate';
    } else {
      return null;
    }

    // Only use compression if it actually reduces size
    if (compressed.length >= buffer.length) {
      return null;
    }

    // Set compression headers
    res.set('Content-Encoding', encoding);
    res.set('Content-Length', compressed.length);
    res.set('Vary', 'Accept-Encoding');
    res.set('X-Compression-Ratio', ((1 - compressed.length / buffer.length) * 100).toFixed(2) + '%');
    res.set('X-Original-Size', buffer.length);
    res.set('X-Compressed-Size', compressed.length);

    return { data: compressed, encoding, originalSize: buffer.length, compressedSize: compressed.length };
  } catch (error) {
    console.error('Compression failed:', error);
    return null;
  }
}

/**
 * Cache headers middleware
 * Sets appropriate cache headers based on content type and route
 */
export function cacheHeaders(options = {}) {
  return (req, res, next) => {
    // Store original methods to add cache headers
    const originalSend = res.send;
    const originalJson = res.json;

    const setCacheHeaders = () => {
      const cacheConfig = determineCacheConfig(req, res, options);
      applyCacheHeaders(res, cacheConfig);
    };

    res.send = function(data) {
      setCacheHeaders();
      return originalSend.call(this, data);
    };

    res.json = function(data) {
      setCacheHeaders();
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Determine cache configuration based on request/response
 */
function determineCacheConfig(req, res, options) {
  const path = req.path;
  const method = req.method;
  const contentType = res.get('Content-Type') || '';

  // Static assets
  if (isStaticAsset(path, contentType)) {
    return { ...CACHE_HEADERS_CONFIG.static, ...options.static };
  }

  // API endpoints
  if (path.startsWith('/api/') && method === 'GET') {
    // Check for dynamic content indicators
    if (isDynamicContent(path, req)) {
      return { ...CACHE_HEADERS_CONFIG.dynamic, ...options.dynamic };
    }
    return { ...CACHE_HEADERS_CONFIG.api, ...options.api };
  }

  // Default to no caching for dynamic content
  return { ...CACHE_HEADERS_CONFIG.dynamic, ...options.dynamic };
}

/**
 * Check if request is for static assets
 */
function isStaticAsset(path, contentType) {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  const staticTypes = ['text/css', 'application/javascript', 'image/', 'font/'];
  
  return staticExtensions.some(ext => path.endsWith(ext)) ||
         staticTypes.some(type => contentType.startsWith(type));
}

/**
 * Check if content is dynamic (should not be cached)
 */
function isDynamicContent(path, req) {
  const dynamicPaths = [
    '/api/auth/',
    '/api/developer/metrics',
    '/api/database/metrics',
    '/api/database/performance'
  ];
  
  // Check for query parameters that indicate dynamic content
  const hasUserSpecificParams = req.query.userId || req.query.timestamp || req.query.random;
  
  return dynamicPaths.some(dynPath => path.startsWith(dynPath)) || hasUserSpecificParams;
}

/**
 * Apply cache headers to response
 */
function applyCacheHeaders(res, config) {
  if (config.noCache) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  } else {
    let cacheControl = `max-age=${config.maxAge}`;
    
    if (config.mustRevalidate) {
      cacheControl += ', must-revalidate';
    }
    
    if (config.immutable) {
      cacheControl += ', immutable';
    }
    
    if (config.public) {
      cacheControl += ', public';
    } else if (config.private) {
      cacheControl += ', private';
    }
    
    res.set('Cache-Control', cacheControl);
    
    // Set ETag for validation
    if (config.etag !== false) {
      // ETag will be set automatically by Express for most responses
      res.set('Vary', 'Accept-Encoding');
    }
    
    // Set Last-Modified if provided
    if (config.lastModified) {
      res.set('Last-Modified', config.lastModified);
    }
  }
}

/**
 * Response time monitoring middleware
 * Tracks response times and provides performance metrics
 */
export function responseTimeMonitoring(options = {}) {
  const config = {
    slowThreshold: 1000, // 1 second
    trackPercentiles: true,
    maxSamples: 10000,
    ...options
  };

  return (req, res, next) => {
    const startTime = Date.now();
    const startHrTime = process.hrtime();

    // Store original methods
    const originalSend = res.send;
    const originalJson = res.json;

    const recordResponseTime = () => {
      const endTime = Date.now();
      const endHrTime = process.hrtime(startHrTime);
      
      const responseTime = endTime - startTime;
      const preciseResponseTime = endHrTime[0] * 1000 + endHrTime[1] / 1000000;

      // Update metrics
      updateResponseTimeMetrics(responseTime, preciseResponseTime, req, res, config);

      // Add response time headers
      res.set('X-Response-Time', `${preciseResponseTime.toFixed(2)}ms`);
      res.set('X-Response-Time-Ms', responseTime);
    };

    res.send = function(data) {
      recordResponseTime();
      return originalSend.call(this, data);
    };

    res.json = function(data) {
      recordResponseTime();
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Update response time metrics
 */
function updateResponseTimeMetrics(responseTime, preciseResponseTime, req, res, config) {
  responseTimeMetrics.totalRequests++;
  responseTimeMetrics.totalResponseTime += responseTime;
  responseTimeMetrics.averageResponseTime = responseTimeMetrics.totalResponseTime / responseTimeMetrics.totalRequests;

  // Track slow vs fast requests
  if (responseTime > config.slowThreshold) {
    responseTimeMetrics.slowRequests++;
    
    // Log slow requests
    console.warn(`Slow request detected: ${req.method} ${req.path} - ${preciseResponseTime.toFixed(2)}ms`, {
      method: req.method,
      path: req.path,
      responseTime: preciseResponseTime,
      statusCode: res.statusCode,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id
    });
  } else {
    responseTimeMetrics.fastRequests++;
  }

  // Track percentiles if enabled
  if (config.trackPercentiles) {
    responseTimeMetrics.responseTimes.push(responseTime);
    
    // Keep only recent samples
    if (responseTimeMetrics.responseTimes.length > config.maxSamples) {
      responseTimeMetrics.responseTimes = responseTimeMetrics.responseTimes.slice(-config.maxSamples);
    }
    
    // Calculate percentiles
    const sorted = [...responseTimeMetrics.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    
    responseTimeMetrics.p95ResponseTime = sorted[p95Index] || 0;
    responseTimeMetrics.p99ResponseTime = sorted[p99Index] || 0;
  }
}

/**
 * API response caching strategies middleware
 */
export function apiResponseCaching(options = {}) {
  const config = {
    defaultTTL: 300, // 5 minutes
    varyByUser: false,
    varyByQuery: true,
    skipMethods: ['POST', 'PUT', 'DELETE', 'PATCH'],
    ...options
  };

  return (req, res, next) => {
    // Skip caching for certain methods
    if (config.skipMethods.includes(req.method)) {
      return next();
    }

    // Generate cache key
    const cacheKey = generateApiCacheKey(req, config);
    
    // Add cache key to response headers for debugging
    res.set('X-Cache-Key', cacheKey);
    
    // Set cache strategy headers
    setCacheStrategyHeaders(res, req, config);

    next();
  };
}

/**
 * Generate cache key for API responses
 */
function generateApiCacheKey(req, config) {
  const parts = [req.method, req.path];
  
  if (config.varyByQuery && Object.keys(req.query).length > 0) {
    const sortedQuery = Object.keys(req.query)
      .sort()
      .map(key => `${key}=${req.query[key]}`)
      .join('&');
    parts.push(sortedQuery);
  }
  
  if (config.varyByUser && req.user) {
    parts.push(`user:${req.user.id}`);
  }
  
  return parts.join('|');
}

/**
 * Set cache strategy headers
 */
function setCacheStrategyHeaders(res, req, config) {
  // Add Vary header for conditional caching
  const varyHeaders = ['Accept-Encoding'];
  
  if (config.varyByUser) {
    varyHeaders.push('Authorization');
  }
  
  res.set('Vary', varyHeaders.join(', '));
  
  // Add cache strategy information
  res.set('X-Cache-Strategy', 'api-response-caching');
  res.set('X-Cache-TTL', config.defaultTTL);
}

/**
 * Get response time metrics
 */
export function getResponseTimeMetrics() {
  return {
    ...responseTimeMetrics,
    slowRequestPercentage: responseTimeMetrics.totalRequests > 0 
      ? (responseTimeMetrics.slowRequests / responseTimeMetrics.totalRequests * 100).toFixed(2)
      : 0,
    fastRequestPercentage: responseTimeMetrics.totalRequests > 0
      ? (responseTimeMetrics.fastRequests / responseTimeMetrics.totalRequests * 100).toFixed(2)
      : 0
  };
}

/**
 * Reset response time metrics
 */
export function resetResponseTimeMetrics() {
  responseTimeMetrics.totalRequests = 0;
  responseTimeMetrics.totalResponseTime = 0;
  responseTimeMetrics.slowRequests = 0;
  responseTimeMetrics.fastRequests = 0;
  responseTimeMetrics.averageResponseTime = 0;
  responseTimeMetrics.p95ResponseTime = 0;
  responseTimeMetrics.p99ResponseTime = 0;
  responseTimeMetrics.responseTimes = [];
}

/**
 * Combined response optimization middleware
 * Applies compression, cache headers, and response time monitoring
 */
export function responseOptimization(options = {}) {
  const compressionOptions = options.compression || {};
  const cacheOptions = options.cache || {};
  const monitoringOptions = options.monitoring || {};
  const apiCachingOptions = options.apiCaching || {};

  return (req, res, next) => {
    // Apply all optimizations in sequence
    responseTimeMonitoring(monitoringOptions)(req, res, () => {
      cacheHeaders(cacheOptions)(req, res, () => {
        apiResponseCaching(apiCachingOptions)(req, res, () => {
          responseCompression(compressionOptions)(req, res, next);
        });
      });
    });
  };
}

/**
 * Performance monitoring endpoint data
 */
export function getPerformanceMetrics() {
  return {
    responseTime: getResponseTimeMetrics(),
    compression: {
      enabled: true,
      threshold: COMPRESSION_CONFIG.threshold,
      level: COMPRESSION_CONFIG.level
    },
    caching: {
      static: CACHE_HEADERS_CONFIG.static,
      api: CACHE_HEADERS_CONFIG.api,
      dynamic: CACHE_HEADERS_CONFIG.dynamic
    }
  };
}