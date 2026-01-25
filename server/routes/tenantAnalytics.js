/**
 * Tenant Analytics Routes
 * API endpoints for tenant-specific analytics and monitoring
 * 
 * Requirements: 10.5, 10.6
 */

import express from 'express';
import tenantAnalytics from '../services/tenantAnalytics.js';
import { authenticate } from '../middleware/auth.js';
import { tenantIsolation, requireTenantRole } from '../middleware/tenantIsolation.js';

const router = express.Router();

/**
 * GET /api/tenant-analytics/dashboard
 * Get tenant analytics dashboard data
 */
router.get('/dashboard', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate } = req.query;

    // Default to last 30 days if not specified
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const dashboard = await tenantAnalytics.getTenantDashboard(tenantId, start, end);

    res.json(dashboard);
  } catch (error) {
    console.error('❌ Failed to get tenant dashboard:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'DASHBOARD_001',
        message: 'Failed to retrieve tenant dashboard'
      }
    });
  }
});

/**
 * GET /api/tenant-analytics/trends
 * Get tenant performance trends
 */
router.get('/trends', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { days = 30 } = req.query;

    const trends = await tenantAnalytics.getTenantPerformanceTrends(
      tenantId,
      parseInt(days)
    );

    res.json({
      trends,
      period: {
        days: parseInt(days)
      }
    });
  } catch (error) {
    console.error('❌ Failed to get performance trends:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'TRENDS_001',
        message: 'Failed to retrieve performance trends'
      }
    });
  }
});

/**
 * GET /api/tenant-analytics/comparison
 * Get tenant usage comparison between periods
 */
router.get('/comparison', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { days = 30 } = req.query;

    const comparison = await tenantAnalytics.getTenantUsageComparison(
      tenantId,
      parseInt(days)
    );

    res.json(comparison);
  } catch (error) {
    console.error('❌ Failed to get usage comparison:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'COMPARISON_001',
        message: 'Failed to retrieve usage comparison'
      }
    });
  }
});

/**
 * GET /api/tenant-analytics/health
 * Get tenant health status
 */
router.get('/health', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const health = await tenantAnalytics.checkTenantHealth(tenantId);

    res.json(health);
  } catch (error) {
    console.error('❌ Failed to check tenant health:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'HEALTH_001',
        message: 'Failed to check tenant health'
      }
    });
  }
});

/**
 * POST /api/tenant-analytics/track/business-discovery
 * Manually track business discovery event
 */
router.post('/track/business-discovery', 
  authenticate, 
  tenantIsolation, 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const { businessCount } = req.body;

      if (!businessCount || businessCount < 1) {
        return res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            code: 'TRACK_001',
            message: 'businessCount must be a positive number'
          }
        });
      }

      await tenantAnalytics.trackBusinessDiscovery(
        tenantId,
        businessCount,
        req.user.id
      );

      res.json({
        message: 'Business discovery tracked successfully'
      });
    } catch (error) {
      console.error('❌ Failed to track business discovery:', error);
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'TRACK_999',
          message: 'Failed to track business discovery'
        }
      });
    }
  }
);

/**
 * POST /api/tenant-analytics/track/proposal
 * Manually track proposal generation event
 */
router.post('/track/proposal', 
  authenticate, 
  tenantIsolation, 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const { proposalId } = req.body;

      if (!proposalId) {
        return res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            code: 'TRACK_002',
            message: 'proposalId is required'
          }
        });
      }

      await tenantAnalytics.trackProposalGeneration(
        tenantId,
        proposalId,
        req.user.id
      );

      res.json({
        message: 'Proposal generation tracked successfully'
      });
    } catch (error) {
      console.error('❌ Failed to track proposal:', error);
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'TRACK_999',
          message: 'Failed to track proposal'
        }
      });
    }
  }
);

/**
 * POST /api/tenant-analytics/track/project
 * Manually track project creation event
 */
router.post('/track/project', 
  authenticate, 
  tenantIsolation, 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const { projectId } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            code: 'TRACK_003',
            message: 'projectId is required'
          }
        });
      }

      await tenantAnalytics.trackProjectCreation(
        tenantId,
        projectId,
        req.user.id
      );

      res.json({
        message: 'Project creation tracked successfully'
      });
    } catch (error) {
      console.error('❌ Failed to track project:', error);
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'TRACK_999',
          message: 'Failed to track project'
        }
      });
    }
  }
);

/**
 * POST /api/tenant-analytics/track/activity
 * Track custom user activity
 */
router.post('/track/activity', 
  authenticate, 
  tenantIsolation, 
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const { activityType, metadata } = req.body;

      if (!activityType) {
        return res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            code: 'TRACK_004',
            message: 'activityType is required'
          }
        });
      }

      await tenantAnalytics.trackUserActivity(
        tenantId,
        req.user.id,
        activityType,
        metadata || {}
      );

      res.json({
        message: 'User activity tracked successfully'
      });
    } catch (error) {
      console.error('❌ Failed to track activity:', error);
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          code: 'TRACK_999',
          message: 'Failed to track activity'
        }
      });
    }
  }
);

/**
 * GET /api/tenant-analytics/recent-activity
 * Get recent tenant activity
 */
router.get('/recent-activity', authenticate, tenantIsolation, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { limit = 10 } = req.query;

    const activity = await tenantAnalytics.getRecentActivity(
      tenantId,
      parseInt(limit)
    );

    res.json({
      activity,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('❌ Failed to get recent activity:', error);
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        code: 'ACTIVITY_001',
        message: 'Failed to retrieve recent activity'
      }
    });
  }
});

export default router;
