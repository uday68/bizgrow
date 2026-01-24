import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import helmet from 'helmet';
import cors from 'cors';

// Redis client for rate limiting (optional - falls back to memory store)
let redisClient;
try {
  if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    redisClient.connect().catch(console.error);
  }
} catch (error) {
  console.warn('Redis not available, using memory store for rate limiting:', error.message);
}

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

// User roles hierarchy
const ROLES = {
  USER: 'user',
  DEVELOPER: 'developer', 
  ADMIN: 'admin'
};

const ROLE_HIERARCHY = {
  [ROLES.USER]: 1,
  [ROLES.DEVELOPER]: 2,
  [ROLES.ADMIN]: 3
};

// JWT Token Manager
export class JWTTokenManager {
  static generateTokens(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: this.getRolePermissions(user.role)
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'bizgrow-ai',
      audience: 'bizgrow-users'
    });

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' }, 
      JWT_SECRET, 
      { 
        expiresIn: JWT_REFRESH_EXPIRES_IN,
        issuer: 'bizgrow-ai',
        audience: 'bizgrow-users'
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: JWT_EXPIRES_IN,
      tokenType: 'Bearer'
    };
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET, {
        issuer: 'bizgrow-ai',
        audience: 'bizgrow-users'
      });
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  static refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token type');
      }
      
      // In production, fetch user from database using decoded.id
      const user = { id: decoded.id, email: 'user@example.com', role: ROLES.USER };
      return this.generateTokens(user);
    } catch (error) {
      throw new Error(`Refresh token verification failed: ${error.message}`);
    }
  }

  static getRolePermissions(role) {
    const permissions = {
      [ROLES.USER]: ['read:own-data', 'update:own-profile'],
      [ROLES.DEVELOPER]: ['read:own-data', 'update:own-profile', 'read:metrics', 'control:agents'],
      [ROLES.ADMIN]: ['*'] // All permissions
    };
    return permissions[role] || permissions[ROLES.USER];
  }
}

// Password Security Manager
export class PasswordManager {
  static async hashPassword(password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    return await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  static validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors = [];
    if (password.length < minLength) errors.push('Password must be at least 8 characters long');
    if (!hasUpperCase) errors.push('Password must contain at least one uppercase letter');
    if (!hasLowerCase) errors.push('Password must contain at least one lowercase letter');
    if (!hasNumbers) errors.push('Password must contain at least one number');
    if (!hasSpecialChar) errors.push('Password must contain at least one special character');

    return {
      isValid: errors.length === 0,
      errors,
      strength: this.calculatePasswordStrength(password)
    };
  }

  static calculatePasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
    
    if (score < 3) return 'weak';
    if (score < 5) return 'medium';
    return 'strong';
  }
}

// Enhanced JWT Authentication Middleware
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'MISSING_TOKEN',
      timestamp: new Date().toISOString()
    });
  }

  try {
    const decoded = JWTTokenManager.verifyToken(token);
    req.user = decoded;
    req.correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
    next();
  } catch (error) {
    return res.status(403).json({ 
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Role-based authorization middleware
export const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredRoleLevel = ROLE_HIERARCHY[requiredRole] || 0;

    if (userRoleLevel < requiredRoleLevel) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: requiredRole,
        current: req.user.role
      });
    }

    next();
  };
};

// Permission-based authorization middleware
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = userPermissions.includes('*') || userPermissions.includes(permission);

    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        required: permission,
        available: userPermissions
      });
    }

    next();
  };
};

// Generate correlation ID for request tracking
function generateCorrelationId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Advanced Rate Limiting Configuration
const RATE_LIMIT_CONFIG = {
  auth: { windowMs: 15 * 60 * 1000, max: 5, skipSuccessfulRequests: true },      // 5 attempts per 15 minutes
  api: { windowMs: 15 * 60 * 1000, max: 1000, skipSuccessfulRequests: false },   // 1000 requests per 15 minutes
  agents: { windowMs: 60 * 1000, max: 10, skipSuccessfulRequests: false },       // 10 operations per minute
  webhooks: { windowMs: 60 * 1000, max: 100, skipSuccessfulRequests: false },    // 100 webhooks per minute
  upload: { windowMs: 60 * 1000, max: 5, skipSuccessfulRequests: false },        // 5 uploads per minute
  search: { windowMs: 60 * 1000, max: 50, skipSuccessfulRequests: false }        // 50 searches per minute
};

// IP Whitelist for trusted sources
const TRUSTED_IPS = new Set([
  '127.0.0.1',
  '::1',
  ...(process.env.TRUSTED_IPS ? process.env.TRUSTED_IPS.split(',') : [])
]);

// Rate limiting store factory
const createRateLimitStore = () => {
  if (redisClient) {
    return new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:bizgrow:'
    });
  }
  return undefined; // Use default memory store
};

// Enhanced rate limiting with sliding window and IP tracking
export const createAdvancedRateLimit = (config, options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    skipSuccessfulRequests = false,
    keyGenerator = null,
    skip = null
  } = { ...config, ...options };

  return rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    store: createRateLimitStore(),
    
    // Custom key generator for more granular control
    keyGenerator: keyGenerator || ((req) => {
      // Use user ID if authenticated, otherwise IP
      if (req.user && req.user.id) {
        return `user:${req.user.id}`;
      }
      return `ip:${req.ip}`;
    }),

    // Skip function for whitelisted IPs and conditions
    skip: skip || ((req) => {
      // Skip rate limiting for trusted IPs
      if (TRUSTED_IPS.has(req.ip)) {
        return true;
      }
      
      // Skip for admin users (if authenticated)
      if (req.user && req.user.role === 'admin') {
        return true;
      }
      
      return false;
    }),

    // Enhanced error message with retry information
    message: (req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      return {
        error: 'Too many requests from this source, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
        limit: max,
        windowMs,
        remaining: 0,
        resetTime: new Date(Date.now() + windowMs).toISOString(),
        timestamp: new Date().toISOString()
      };
    },

    // Custom headers
    standardHeaders: true,
    legacyHeaders: false,
    
    // Handler for when limit is exceeded
    handler: (req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      
      // Log rate limit violation
      console.warn(`Rate limit exceeded for ${req.ip} on ${req.path}`, {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      res.status(429).json({
        error: 'Too many requests from this source, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
        limit: max,
        windowMs,
        remaining: 0,
        resetTime: new Date(Date.now() + windowMs).toISOString(),
        timestamp: new Date().toISOString()
      });
    }
  });
};

// Specific rate limiters for different endpoint categories
export const authLimiter = createAdvancedRateLimit(RATE_LIMIT_CONFIG.auth, {
  keyGenerator: (req) => `auth:${req.ip}`, // Always use IP for auth attempts
  skip: (req) => TRUSTED_IPS.has(req.ip) // Only skip for trusted IPs, not for admin users
});

export const apiLimiter = createAdvancedRateLimit(RATE_LIMIT_CONFIG.api);

export const agentLimiter = createAdvancedRateLimit(RATE_LIMIT_CONFIG.agents, {
  keyGenerator: (req) => `agent:${req.user?.id || req.ip}:${req.params.agentId || 'general'}`
});

export const webhookLimiter = createAdvancedRateLimit(RATE_LIMIT_CONFIG.webhooks, {
  keyGenerator: (req) => `webhook:${req.user?.id || req.ip}`
});

export const uploadLimiter = createAdvancedRateLimit(RATE_LIMIT_CONFIG.upload, {
  keyGenerator: (req) => `upload:${req.user?.id || req.ip}`
});

export const searchLimiter = createAdvancedRateLimit(RATE_LIMIT_CONFIG.search, {
  keyGenerator: (req) => `search:${req.user?.id || req.ip}`
});

// Dynamic rate limiting based on user behavior
export const createDynamicRateLimit = (baseConfig) => {
  return (req, res, next) => {
    let config = { ...baseConfig };
    
    // Increase limits for verified users
    if (req.user) {
      config.max = Math.floor(config.max * 1.5);
    }
    
    // Decrease limits for suspicious behavior
    if (req.headers['user-agent']?.includes('bot') && !TRUSTED_IPS.has(req.ip)) {
      config.max = Math.floor(config.max * 0.5);
    }
    
    // Apply the dynamic rate limit
    const dynamicLimiter = createAdvancedRateLimit(config);
    dynamicLimiter(req, res, next);
  };
};

// Rate limit monitoring and analytics
export const rateLimitAnalytics = {
  violations: new Map(),
  
  recordViolation(ip, path, userId = null) {
    const key = `${ip}:${path}`;
    const existing = this.violations.get(key) || { count: 0, firstSeen: Date.now(), lastSeen: Date.now(), userId };
    existing.count++;
    existing.lastSeen = Date.now();
    if (userId) existing.userId = userId;
    this.violations.set(key, existing);
    
    // Clean up old violations (older than 24 hours)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [violationKey, violation] of this.violations.entries()) {
      if (violation.lastSeen < dayAgo) {
        this.violations.delete(violationKey);
      }
    }
  },
  
  getViolations() {
    return Array.from(this.violations.entries()).map(([key, data]) => ({
      key,
      ...data
    }));
  },
  
  getSuspiciousIPs(threshold = 10) {
    const ipCounts = new Map();
    for (const [key, data] of this.violations.entries()) {
      const ip = key.split(':')[0];
      ipCounts.set(ip, (ipCounts.get(ip) || 0) + data.count);
    }
    
    return Array.from(ipCounts.entries())
      .filter(([ip, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1]);
  }
};

// Enhanced Security Headers with comprehensive protection
export const securityMiddleware = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "wss:", "https:", "https://api.gemini.com", "https://maps.googleapis.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      childSrc: ["'none'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    },
    reportOnly: process.env.NODE_ENV !== 'production'
  },
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny'
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection
  xssFilter: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: ['strict-origin-when-cross-origin']
  },
  
  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: false,
  
  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false
  },
  
  // Expect-CT
  expectCt: {
    maxAge: 86400,
    enforce: process.env.NODE_ENV === 'production'
  },
  
  // Cross-Origin-Embedder-Policy
  crossOriginEmbedderPolicy: false, // Disabled for compatibility
  
  // Cross-Origin-Opener-Policy
  crossOriginOpenerPolicy: {
    policy: 'same-origin'
  },
  
  // Cross-Origin-Resource-Policy
  crossOriginResourcePolicy: {
    policy: 'cross-origin'
  },
  
  // Hide X-Powered-By header
  hidePoweredBy: true
});

// HTTPS Enforcement Middleware
export const httpsEnforcement = (req, res, next) => {
  // Skip in development
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  // Check if request is secure
  const isSecure = req.secure || 
                   req.headers['x-forwarded-proto'] === 'https' ||
                   req.headers['x-forwarded-ssl'] === 'on';
  
  if (!isSecure) {
    const httpsUrl = `https://${req.get('host')}${req.url}`;
    return res.redirect(301, httpsUrl);
  }
  
  next();
};

// Input Validation and Sanitization Middleware
export const inputSanitization = (req, res, next) => {
  // Sanitize common XSS patterns
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/data:text\/html/gi, '') // Remove data URLs
      .replace(/vbscript:/gi, '') // Remove vbscript
      .trim();
  };
  
  // Recursively sanitize object
  const sanitizeObject = (obj) => {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[sanitizeString(key)] = sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  };
  
  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

// SQL Injection Protection Middleware
export const sqlInjectionProtection = (req, res, next) => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /(--|\/\*|\*\/|;)/g,
    /(\b(CHAR|NCHAR|VARCHAR|NVARCHAR)\s*\(\s*\d+\s*\))/gi,
    /(\b(CAST|CONVERT|SUBSTRING|ASCII|CHAR_LENGTH)\s*\()/gi
  ];
  
  const checkForSQLInjection = (value) => {
    if (typeof value !== 'string') return false;
    return sqlPatterns.some(pattern => pattern.test(value));
  };
  
  const checkObject = (obj) => {
    if (obj === null || obj === undefined) return false;
    
    if (typeof obj === 'string') {
      return checkForSQLInjection(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.some(checkObject);
    }
    
    if (typeof obj === 'object') {
      return Object.values(obj).some(checkObject);
    }
    
    return false;
  };
  
  // Check all input sources
  const hasSQLInjection = checkObject(req.body) || 
                         checkObject(req.query) || 
                         checkObject(req.params);
  
  if (hasSQLInjection) {
    console.warn('SQL injection attempt detected:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
      timestamp: new Date().toISOString()
    });
    
    return res.status(400).json({
      error: 'Invalid input detected',
      code: 'INVALID_INPUT',
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// Request Size Limiting Middleware
export const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxBytes = typeof maxSize === 'string' ? 
      parseInt(maxSize.replace(/mb/i, '')) * 1024 * 1024 :
      maxSize;
    
    if (contentLength > maxBytes) {
      return res.status(413).json({
        error: 'Request entity too large',
        code: 'REQUEST_TOO_LARGE',
        maxSize: maxSize,
        receivedSize: contentLength,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
};

// Security Event Logging Middleware
export const securityEventLogger = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Log security-relevant events
    if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
      console.warn('Security event:', {
        type: 'security_response',
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Enhanced CORS
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://bizgrow-ai-frontend.vercel.app',
      'https://biggrow-production.up.railway.app',
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

// Request Logging
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
  });
  
  next();
};

// Error Handler
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.message
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authentication credentials'
    });
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
};