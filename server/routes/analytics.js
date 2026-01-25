import express from 'express';
import analyticsEngine from '../services/analyticsEngine.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * Track business event
 * POST /api/analytics/track
 * Requires: authentication
 */
router.post('/track', authenticateToken, async (req, res) => {
  try {
    const { eventType, eventData } = req.body;

    if (!eventType) {
      return res.status(400).json({
        success: false,
        error: 'Event type is required'
      });
    }

    // Add user context to event data
    const enrichedEventData = {
      ...eventData,
      userId: req.user?.id,
      userRole: req.user?.role
    };

    const event = await analyticsEngine.trackBusinessEvent(eventType, enrichedEventData);

    res.json({
      success: true,
      event,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to track event', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to track event',
      message: error.message
    });
  }
});

/**
 * Get business metrics
 * GET /api/analytics/metrics
 * Requires: developer role
 */
router.get('/metrics', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const metrics = await analyticsEngine.getBusinessMetrics(startDate, endDate);

    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get metrics', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics',
      message: error.message
    });
  }
});

/**
 * Get dashboard data
 * GET /api/analytics/dashboard
 * Requires: developer role
 */
router.get('/dashboard', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const dashboardData = await analyticsEngine.getDashboardData(days);

    res.json({
      success: true,
      dashboard: dashboardData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get dashboard data', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard data',
      message: error.message
    });
  }
});

/**
 * Get predictions
 * GET /api/analytics/predictions/:metricName
 * Requires: developer role
 */
router.get('/predictions/:metricName', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { metricName } = req.params;
    const daysAhead = parseInt(req.query.daysAhead) || 7;

    const prediction = await analyticsEngine.predictFutureMetrics(metricName, daysAhead);

    res.json({
      success: true,
      prediction,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get predictions', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id,
      metricName: req.params.metricName
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get predictions',
      message: error.message
    });
  }
});

/**
 * Detect anomalies
 * GET /api/analytics/anomalies
 * Requires: developer role
 */
router.get('/anomalies', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const anomalies = await analyticsEngine.detectAnomalies();

    res.json({
      success: true,
      anomalies,
      count: anomalies.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to detect anomalies', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to detect anomalies',
      message: error.message
    });
  }
});

/**
 * Get conversion rate
 * GET /api/analytics/conversion-rate
 * Requires: developer role
 */
router.get('/conversion-rate', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const metrics = await analyticsEngine.getBusinessMetrics(startDate, endDate);
    
    const conversionRates = Object.entries(metrics.metrics)
      .filter(([date, data]) => data.conversion_rate !== undefined)
      .map(([date, data]) => ({
        date,
        conversionRate: data.conversion_rate,
        proposalsSent: data.proposals_sent || 0,
        proposalsAccepted: data.proposals_accepted || 0
      }));

    res.json({
      success: true,
      conversionRates,
      averageConversionRate: metrics.summary.averageConversionRate,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get conversion rate', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get conversion rate',
      message: error.message
    });
  }
});

/**
 * Get revenue metrics
 * GET /api/analytics/revenue
 * Requires: admin role
 */
router.get('/revenue', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const metrics = await analyticsEngine.getBusinessMetrics(startDate, endDate);
    
    const revenueData = Object.entries(metrics.metrics)
      .filter(([date, data]) => data.revenue !== undefined)
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        projectsCompleted: data.projects_completed || 0
      }));

    res.json({
      success: true,
      revenueData,
      totalRevenue: metrics.summary.totalRevenue,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get revenue metrics', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get revenue metrics',
      message: error.message
    });
  }
});

/**
 * Export analytics data
 * GET /api/analytics/export
 * Requires: admin role
 */
router.get('/export', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const metrics = await analyticsEngine.getBusinessMetrics(startDate, endDate);

    if (format === 'csv') {
      // Convert to CSV
      const csvRows = [];
      csvRows.push('Date,Metric,Value');

      for (const [date, data] of Object.entries(metrics.metrics)) {
        for (const [metric, value] of Object.entries(data)) {
          csvRows.push(`${date},${metric},${value}`);
        }
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics_${startDate}_${endDate}.csv`);
      res.send(csvRows.join('\n'));
    } else {
      // Return JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=analytics_${startDate}_${endDate}.json`);
      res.json(metrics);
    }

    logger.info('Analytics data exported', {
      type: 'analytics',
      format,
      startDate,
      endDate,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
  } catch (error) {
    logger.error('Failed to export analytics data', {
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to export analytics data',
      message: error.message
    });
  }
});

export default router;
