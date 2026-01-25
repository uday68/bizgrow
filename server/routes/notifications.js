import express from 'express';
import notificationService from '../services/notificationService.js';
import logger from '../services/logger.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * Send notification
 */
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const notification = req.body;
    
    if (!notification.title || !notification.message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
    }

    const result = await notificationService.sendNotification(notification);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Failed to send notification', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get user notifications
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;

    // Check if user is requesting their own notifications or is admin
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const notifications = await notificationService.getUserNotifications(
      userId,
      limit,
      status
    );
    
    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    logger.error('Failed to get user notifications', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Mark notification as read
 */
router.post('/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const result = await notificationService.markAsRead(notificationId);
    
    res.json({
      success: result,
      message: result ? 'Notification marked as read' : 'Failed to mark as read'
    });
  } catch (error) {
    logger.error('Failed to mark notification as read', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Retry failed notification
 */
router.post('/:notificationId/retry', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const result = await notificationService.retryNotification(notificationId);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Failed to retry notification', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get notification metrics
 */
router.get('/metrics', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const metrics = notificationService.getMetrics();
    
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    logger.error('Failed to get notification metrics', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get notification configuration
 */
router.get('/config', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const config = notificationService.getConfig();
    
    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Failed to get notification config', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update notification configuration
 */
router.post('/config', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const config = req.body;
    
    notificationService.updateConfig(config);
    
    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: notificationService.getConfig()
    });
  } catch (error) {
    logger.error('Failed to update notification config', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all notification templates
 */
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const templates = notificationService.getAllTemplates();
    
    res.json({
      success: true,
      templates
    });
  } catch (error) {
    logger.error('Failed to get notification templates', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get specific notification template
 */
router.get('/templates/:name', authenticateToken, async (req, res) => {
  try {
    const { name } = req.params;
    const template = notificationService.getTemplate(name);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }
    
    res.json({
      success: true,
      template
    });
  } catch (error) {
    logger.error('Failed to get notification template', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add notification template
 */
router.post('/templates', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, template } = req.body;
    
    if (!name || !template || !template.subject || !template.body) {
      return res.status(400).json({
        success: false,
        error: 'Name, subject, and body are required'
      });
    }
    
    notificationService.addTemplate(name, template);
    
    res.json({
      success: true,
      message: 'Template added successfully'
    });
  } catch (error) {
    logger.error('Failed to add notification template', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Deliver queued notifications for user
 */
router.post('/deliver-queued/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user is requesting their own notifications or is admin
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const result = await notificationService.deliverQueuedNotifications(userId);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Failed to deliver queued notifications', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test notification (admin only)
 */
router.post('/test', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { userId, channels } = req.body;
    
    const testNotification = {
      userId: userId || req.user.id,
      title: 'Test Notification',
      message: 'This is a test notification from BizGrow AI',
      type: 'test',
      channels: channels || ['websocket', 'inApp'],
      priority: 'normal',
      data: {
        timestamp: new Date().toISOString()
      }
    };

    const result = await notificationService.sendNotification(testNotification);
    
    res.json({
      success: true,
      message: 'Test notification sent',
      result
    });
  } catch (error) {
    logger.error('Failed to send test notification', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get user notification preferences
 */
router.get('/preferences/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user is requesting their own preferences or is admin
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const preferences = await notificationService.getUserPreferences(userId);
    
    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    logger.error('Failed to get user preferences', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update user notification preferences
 */
router.post('/preferences/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const preferences = req.body;

    // Check if user is updating their own preferences or is admin
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const result = await notificationService.updateUserPreferences(userId, preferences);
    
    res.json({
      success: result,
      message: result ? 'Preferences updated successfully' : 'Failed to update preferences'
    });
  } catch (error) {
    logger.error('Failed to update user preferences', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get notification analytics
 */
router.get('/analytics', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();
    const userId = req.query.userId ? parseInt(req.query.userId) : null;

    const analytics = await notificationService.getAnalytics(startDate, endDate, userId);
    
    res.json({
      success: true,
      analytics,
      period: {
        start: startDate,
        end: endDate
      }
    });
  } catch (error) {
    logger.error('Failed to get notification analytics', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get notification report
 */
router.get('/report', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const report = await notificationService.getReport(startDate, endDate);
    
    res.json({
      success: true,
      report,
      period: {
        start: startDate,
        end: endDate
      }
    });
  } catch (error) {
    logger.error('Failed to generate notification report', {
      type: 'notification_api',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
