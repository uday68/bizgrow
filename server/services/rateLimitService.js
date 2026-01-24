import { createClient } from 'redis';
import { rateLimitAnalytics } from '../middleware/auth.js';

class RateLimitService {
  constructor() {
    this.redisClient = null;
    this.initRedis();
  }

  async initRedis() {
    try {
      if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') {
        this.redisClient = createClient({
          url: process.env.REDIS_URL || 'redis://localhost:6379'
        });
        await this.redisClient.connect();
        console.log('✅ Redis connected for rate limiting');
      }
    } catch (error) {
      console.warn('⚠️ Redis not available for rate limiting:', error.message);
    }
  }

  // Get current rate limit status for a key
  async getRateLimitStatus(key) {
    if (!this.redisClient) {
      return { available: true, remaining: null, resetTime: null };
    }

    try {
      const current = await this.redisClient.get(`rl:bizgrow:${key}`);
      if (!current) {
        return { available: true, remaining: null, resetTime: null };
      }

      const data = JSON.parse(current);
      const now = Date.now();
      const windowStart = data.windowStart || now;
      const windowMs = data.windowMs || 15 * 60 * 1000;
      const max = data.max || 100;
      const count = data.count || 0;

      // Check if window has expired
      if (now - windowStart > windowMs) {
        return { available: true, remaining: max, resetTime: null };
      }

      const remaining = Math.max(0, max - count);
      const resetTime = new Date(windowStart + windowMs);

      return {
        available: remaining > 0,
        remaining,
        resetTime,
        limit: max,
        used: count,
        windowMs
      };
    } catch (error) {
      console.error('Error getting rate limit status:', error);
      return { available: true, remaining: null, resetTime: null };
    }
  }

  // Manually reset rate limit for a key (admin function)
  async resetRateLimit(key) {
    if (!this.redisClient) {
      return { success: false, message: 'Redis not available' };
    }

    try {
      await this.redisClient.del(`rl:bizgrow:${key}`);
      return { success: true, message: `Rate limit reset for ${key}` };
    } catch (error) {
      console.error('Error resetting rate limit:', error);
      return { success: false, message: error.message };
    }
  }

  // Get rate limit analytics
  async getAnalytics() {
    const violations = rateLimitAnalytics.getViolations();
    const suspiciousIPs = rateLimitAnalytics.getSuspiciousIPs();
    
    // Get current active rate limits from Redis
    let activeRateLimits = [];
    if (this.redisClient) {
      try {
        const keys = await this.redisClient.keys('rl:bizgrow:*');
        activeRateLimits = await Promise.all(
          keys.map(async (key) => {
            const data = await this.redisClient.get(key);
            return {
              key: key.replace('rl:bizgrow:', ''),
              data: JSON.parse(data || '{}')
            };
          })
        );
      } catch (error) {
        console.error('Error getting active rate limits:', error);
      }
    }

    return {
      violations: violations.slice(0, 100), // Limit to 100 most recent
      suspiciousIPs: suspiciousIPs.slice(0, 20), // Top 20 suspicious IPs
      activeRateLimits: activeRateLimits.slice(0, 50), // 50 most recent active limits
      summary: {
        totalViolations: violations.length,
        uniqueIPs: new Set(violations.map(v => v.key.split(':')[0])).size,
        suspiciousIPCount: suspiciousIPs.length,
        activeRateLimitCount: activeRateLimits.length
      }
    };
  }

  // Whitelist management
  async addToWhitelist(ip, reason = 'Manual addition') {
    // This would typically be stored in database
    // For now, we'll use Redis with a special key
    if (!this.redisClient) {
      return { success: false, message: 'Redis not available' };
    }

    try {
      const whitelistKey = `whitelist:${ip}`;
      await this.redisClient.setEx(whitelistKey, 86400 * 30, JSON.stringify({
        ip,
        reason,
        addedAt: new Date().toISOString(),
        addedBy: 'system' // In real implementation, would be the admin user
      }));

      return { success: true, message: `IP ${ip} added to whitelist` };
    } catch (error) {
      console.error('Error adding to whitelist:', error);
      return { success: false, message: error.message };
    }
  }

  async removeFromWhitelist(ip) {
    if (!this.redisClient) {
      return { success: false, message: 'Redis not available' };
    }

    try {
      const whitelistKey = `whitelist:${ip}`;
      await this.redisClient.del(whitelistKey);
      return { success: true, message: `IP ${ip} removed from whitelist` };
    } catch (error) {
      console.error('Error removing from whitelist:', error);
      return { success: false, message: error.message };
    }
  }

  async getWhitelist() {
    if (!this.redisClient) {
      return [];
    }

    try {
      const keys = await this.redisClient.keys('whitelist:*');
      const whitelist = await Promise.all(
        keys.map(async (key) => {
          const data = await this.redisClient.get(key);
          return JSON.parse(data || '{}');
        })
      );
      return whitelist;
    } catch (error) {
      console.error('Error getting whitelist:', error);
      return [];
    }
  }

  // Health check for rate limiting service
  async healthCheck() {
    const health = {
      redis: false,
      analytics: true,
      timestamp: new Date().toISOString()
    };

    if (this.redisClient) {
      try {
        await this.redisClient.ping();
        health.redis = true;
      } catch (error) {
        health.redis = false;
        health.redisError = error.message;
      }
    }

    return health;
  }

  // Cleanup old data
  async cleanup() {
    if (!this.redisClient) {
      return { success: false, message: 'Redis not available' };
    }

    try {
      // Clean up expired rate limit keys
      const keys = await this.redisClient.keys('rl:bizgrow:*');
      let cleanedCount = 0;

      for (const key of keys) {
        const data = await this.redisClient.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          const now = Date.now();
          const windowStart = parsed.windowStart || now;
          const windowMs = parsed.windowMs || 15 * 60 * 1000;

          // If window has expired, delete the key
          if (now - windowStart > windowMs) {
            await this.redisClient.del(key);
            cleanedCount++;
          }
        }
      }

      return { 
        success: true, 
        message: `Cleaned up ${cleanedCount} expired rate limit keys` 
      };
    } catch (error) {
      console.error('Error during cleanup:', error);
      return { success: false, message: error.message };
    }
  }
}

// Singleton instance
const rateLimitService = new RateLimitService();

export default rateLimitService;