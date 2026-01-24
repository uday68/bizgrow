import express from 'express';
import { requireRole } from '../middleware/auth.js';
import rateLimitService from '../services/rateLimitService.js';

const router = express.Router();

// Get rate limiting analytics (admin only)
router.get('/analytics', requireRole('admin'), async (req, res) => {
  try {
    const analytics = await rateLimitService.getAnalytics();
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting rate limit analytics:', error);
    res.status(500).json({
      error: 'Failed to get rate limit analytics',
      code: 'ANALYTICS_ERROR'
    });
  }
});

// Get rate limit status for a specific key (admin only)
router.get('/status/:key', requireRole('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const status = await rateLimitService.getRateLimitStatus(key);
    res.json({
      success: true,
      key,
      status
    });
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    res.status(500).json({
      error: 'Failed to get rate limit status',
      code: 'STATUS_ERROR'
    });
  }
});

// Reset rate limit for a specific key (admin only)
router.post('/reset/:key', requireRole('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const result = await rateLimitService.resetRateLimit(key);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        error: result.message,
        code: 'RESET_FAILED'
      });
    }
  } catch (error) {
    console.error('Error resetting rate limit:', error);
    res.status(500).json({
      error: 'Failed to reset rate limit',
      code: 'RESET_ERROR'
    });
  }
});

// Whitelist management routes (admin only)
router.get('/whitelist', requireRole('admin'), async (req, res) => {
  try {
    const whitelist = await rateLimitService.getWhitelist();
    res.json({
      success: true,
      data: whitelist
    });
  } catch (error) {
    console.error('Error getting whitelist:', error);
    res.status(500).json({
      error: 'Failed to get whitelist',
      code: 'WHITELIST_ERROR'
    });
  }
});

router.post('/whitelist', requireRole('admin'), async (req, res) => {
  try {
    const { ip, reason } = req.body;
    
    if (!ip) {
      return res.status(400).json({
        error: 'IP address is required',
        code: 'MISSING_IP'
      });
    }

    // Basic IP validation
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    if (!ipRegex.test(ip)) {
      return res.status(400).json({
        error: 'Invalid IP address format',
        code: 'INVALID_IP'
      });
    }

    const result = await rateLimitService.addToWhitelist(ip, reason || 'Added via API');
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        error: result.message,
        code: 'WHITELIST_ADD_FAILED'
      });
    }
  } catch (error) {
    console.error('Error adding to whitelist:', error);
    res.status(500).json({
      error: 'Failed to add to whitelist',
      code: 'WHITELIST_ADD_ERROR'
    });
  }
});

router.delete('/whitelist/:ip', requireRole('admin'), async (req, res) => {
  try {
    const { ip } = req.params;
    const result = await rateLimitService.removeFromWhitelist(ip);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        error: result.message,
        code: 'WHITELIST_REMOVE_FAILED'
      });
    }
  } catch (error) {
    console.error('Error removing from whitelist:', error);
    res.status(500).json({
      error: 'Failed to remove from whitelist',
      code: 'WHITELIST_REMOVE_ERROR'
    });
  }
});

// Health check for rate limiting service (admin only)
router.get('/health', requireRole('admin'), async (req, res) => {
  try {
    const health = await rateLimitService.healthCheck();
    res.json({
      success: true,
      health
    });
  } catch (error) {
    console.error('Error checking rate limit service health:', error);
    res.status(500).json({
      error: 'Failed to check service health',
      code: 'HEALTH_CHECK_ERROR'
    });
  }
});

// Cleanup expired rate limit data (admin only)
router.post('/cleanup', requireRole('admin'), async (req, res) => {
  try {
    const result = await rateLimitService.cleanup();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        error: result.message,
        code: 'CLEANUP_FAILED'
      });
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({
      error: 'Failed to cleanup rate limit data',
      code: 'CLEANUP_ERROR'
    });
  }
});

export default router;