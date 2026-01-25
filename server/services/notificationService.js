import EventEmitter from 'events';
import nodemailer from 'nodemailer';
import logger from './logger.js';
import cacheService from './cacheService.js';
import websocketServer from './websocketServer.js';
import { getDatabase, getDatabaseType } from '../database/init.js';

/**
 * Comprehensive Notification Service
 * Handles real-time WebSocket notifications, multi-channel delivery (email, in-app, webhooks),
 * delivery tracking, retry logic, and offline user queuing
 */
class NotificationService extends EventEmitter {
  constructor() {
    super();
    
    this.channels = {
      websocket: { enabled: true },
      email: { enabled: false, transporter: null },
      inApp: { enabled: true },
      webhook: { enabled: true }
    };

    this.deliveryQueue = [];
    this.offlineQueue = new Map(); // userId -> notifications[]
    this.isProcessingQueue = false;
    this.queueProcessingInterval = null;

    this.config = {
      maxQueueSize: 10000,
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      queueProcessingInterval: 2000, // 2 seconds
      rateLimitWindow: 60000, // 1 minute
      maxNotificationsPerWindow: 50
    };

    this.rateLimits = new Map(); // userId -> { count, resetAt }
    this.templates = new Map();
    this.deliveryTracking = new Map(); // notificationId -> delivery status

    this.metrics = {
      totalSent: 0,
      totalFailed: 0,
      totalQueued: 0,
      totalDelivered: 0,
      byChannel: {
        websocket: { sent: 0, failed: 0, delivered: 0 },
        email: { sent: 0, failed: 0, delivered: 0 },
        inApp: { sent: 0, failed: 0, delivered: 0 },
        webhook: { sent: 0, failed: 0, delivered: 0 }
      }
    };

    this.initializeEmailTransporter();
    this.loadTemplates();
  }

  /**
   * Initialize email transporter
   */
  initializeEmailTransporter() {
    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        this.channels.email.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        this.channels.email.enabled = true;

        logger.info('Email transporter initialized', {
          type: 'notification',
          host: process.env.SMTP_HOST
        });
      }
    } catch (error) {
      logger.error('Failed to initialize email transporter', {
        type: 'notification',
        error: error.message
      });
    }
  }

  /**
   * Load notification templates
   */
  loadTemplates() {
    // Default templates
    this.templates.set('business_discovered', {
      subject: 'New Business Discovered',
      body: 'A new business has been discovered: {{businessName}}',
      priority: 'normal'
    });

    this.templates.set('proposal_generated', {
      subject: 'Proposal Generated',
      body: 'A new proposal has been generated for {{businessName}}',
      priority: 'high'
    });

    this.templates.set('project_completed', {
      subject: 'Project Completed',
      body: 'Project for {{businessName}} has been completed',
      priority: 'high'
    });

    this.templates.set('system_alert', {
      subject: 'System Alert',
      body: 'System alert: {{message}}',
      priority: 'critical'
    });

    this.templates.set('agent_error', {
      subject: 'Agent Error',
      body: 'Agent {{agentName}} encountered an error: {{error}}',
      priority: 'high'
    });

    logger.info('Notification templates loaded', {
      type: 'notification',
      count: this.templates.size
    });
  }

  /**
   * Send notification
   */
  async sendNotification(notification) {
    try {
      const notificationId = this.generateNotificationId();
      const timestamp = new Date().toISOString();

      const enrichedNotification = {
        id: notificationId,
        ...notification,
        timestamp,
        status: 'pending',
        retryCount: 0,
        deliveryAttempts: []
      };

      // Check rate limiting
      if (notification.userId && !this.checkRateLimit(notification.userId)) {
        logger.warn('Notification rate limit exceeded', {
          type: 'notification',
          userId: notification.userId,
          notificationId
        });

        enrichedNotification.status = 'rate_limited';
        await this.storeNotification(enrichedNotification);
        return { success: false, reason: 'rate_limited', notificationId };
      }

      // Filter channels based on user preferences
      if (notification.userId && notification.channels) {
        const filteredChannels = [];
        for (const channel of notification.channels) {
          const shouldSend = await this.shouldSendNotification(
            notification.userId,
            notification.type,
            channel
          );
          if (shouldSend) {
            filteredChannels.push(channel);
          }
        }
        enrichedNotification.channels = filteredChannels;

        // If no channels remain after filtering, skip notification
        if (filteredChannels.length === 0) {
          logger.info('Notification skipped due to user preferences', {
            type: 'notification',
            userId: notification.userId,
            notificationId
          });
          enrichedNotification.status = 'skipped';
          await this.storeNotification(enrichedNotification);
          return { success: false, reason: 'user_preferences', notificationId };
        }
      }

      // Check if user is online
      const isOnline = await this.isUserOnline(notification.userId);

      if (!isOnline && notification.channels?.includes('websocket')) {
        // Queue for offline user
        return await this.queueForOfflineUser(enrichedNotification);
      }

      // Send through requested channels
      const results = await this.deliverNotification(enrichedNotification);

      // Update metrics
      this.updateMetrics(results);

      // Store notification
      await this.storeNotification(enrichedNotification);

      logger.info('Notification sent', {
        type: 'notification',
        notificationId,
        userId: notification.userId,
        channels: notification.channels,
        results
      });

      return {
        success: true,
        notificationId,
        results
      };
    } catch (error) {
      logger.error('Failed to send notification', {
        type: 'notification',
        error: error.message,
        notification
      });

      this.metrics.totalFailed++;
      throw error;
    }
  }

  /**
   * Deliver notification through channels
   */
  async deliverNotification(notification) {
    const channels = notification.channels || ['websocket', 'inApp'];
    const results = {};

    for (const channel of channels) {
      try {
        let result;

        switch (channel) {
          case 'websocket':
            result = await this.sendWebSocketNotification(notification);
            break;
          case 'email':
            result = await this.sendEmailNotification(notification);
            break;
          case 'inApp':
            result = await this.sendInAppNotification(notification);
            break;
          case 'webhook':
            result = await this.sendWebhookNotification(notification);
            break;
          default:
            result = { success: false, error: 'Unknown channel' };
        }

        results[channel] = result;

        // Track delivery attempt
        notification.deliveryAttempts.push({
          channel,
          timestamp: new Date().toISOString(),
          success: result.success,
          error: result.error
        });

        if (result.success) {
          this.metrics.byChannel[channel].delivered++;
        } else {
          this.metrics.byChannel[channel].failed++;
        }
      } catch (error) {
        results[channel] = { success: false, error: error.message };
        this.metrics.byChannel[channel].failed++;

        logger.error('Channel delivery failed', {
          type: 'notification',
          channel,
          notificationId: notification.id,
          error: error.message
        });
      }
    }

    // Update notification status
    const allSuccessful = Object.values(results).every(r => r.success);
    const anySuccessful = Object.values(results).some(r => r.success);

    if (allSuccessful) {
      notification.status = 'delivered';
      this.metrics.totalDelivered++;
    } else if (anySuccessful) {
      notification.status = 'partially_delivered';
    } else {
      notification.status = 'failed';
      this.metrics.totalFailed++;
    }

    return results;
  }

  /**
   * Send WebSocket notification
   */
  async sendWebSocketNotification(notification) {
    try {
      if (!this.channels.websocket.enabled) {
        return { success: false, error: 'WebSocket channel disabled' };
      }

      const payload = {
        type: 'notification',
        id: notification.id,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        priority: notification.priority,
        timestamp: notification.timestamp
      };

      // Send to specific user or broadcast
      if (notification.userId) {
        websocketServer.sendToUser(notification.userId, payload);
      } else {
        websocketServer.broadcast(payload);
      }

      this.metrics.byChannel.websocket.sent++;

      return { success: true, channel: 'websocket' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(notification) {
    try {
      if (!this.channels.email.enabled || !this.channels.email.transporter) {
        return { success: false, error: 'Email channel not configured' };
      }

      if (!notification.email) {
        return { success: false, error: 'Email address not provided' };
      }

      // Apply template if specified
      let subject = notification.title;
      let body = notification.message;

      if (notification.template) {
        const template = this.templates.get(notification.template);
        if (template) {
          subject = this.applyTemplate(template.subject, notification.data);
          body = this.applyTemplate(template.body, notification.data);
        }
      }

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: notification.email,
        subject,
        text: body,
        html: this.generateEmailHTML(subject, body, notification.data)
      };

      await this.channels.email.transporter.sendMail(mailOptions);

      this.metrics.byChannel.email.sent++;

      return { success: true, channel: 'email' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send in-app notification
   */
  async sendInAppNotification(notification) {
    try {
      if (!this.channels.inApp.enabled) {
        return { success: false, error: 'In-app channel disabled' };
      }

      // Store in database for in-app display
      const db = getDatabase();
      const dbType = getDatabaseType();

      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO notifications (user_id, title, message, data, priority, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          notification.userId,
          notification.title,
          notification.message,
          JSON.stringify(notification.data || {}),
          notification.priority || 'normal',
          'unread'
        ]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO notifications (user_id, title, message, data, priority, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            notification.userId,
            notification.title,
            notification.message,
            JSON.stringify(notification.data || {}),
            notification.priority || 'normal',
            'unread'
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      this.metrics.byChannel.inApp.sent++;

      return { success: true, channel: 'inApp' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhookNotification(notification) {
    try {
      if (!this.channels.webhook.enabled) {
        return { success: false, error: 'Webhook channel disabled' };
      }

      if (!notification.webhookUrl) {
        return { success: false, error: 'Webhook URL not provided' };
      }

      const payload = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        timestamp: notification.timestamp
      };

      const response = await fetch(notification.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Notification-Id': notification.id,
          'X-Notification-Signature': this.generateWebhookSignature(payload)
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      this.metrics.byChannel.webhook.sent++;

      return { success: true, channel: 'webhook' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue notification for offline user
   */
  async queueForOfflineUser(notification) {
    try {
      const userId = notification.userId;

      if (!this.offlineQueue.has(userId)) {
        this.offlineQueue.set(userId, []);
      }

      const userQueue = this.offlineQueue.get(userId);
      userQueue.push(notification);

      // Limit queue size per user
      if (userQueue.length > 100) {
        userQueue.shift(); // Remove oldest
      }

      notification.status = 'queued_offline';
      await this.storeNotification(notification);

      this.metrics.totalQueued++;

      logger.info('Notification queued for offline user', {
        type: 'notification',
        userId,
        notificationId: notification.id,
        queueSize: userQueue.length
      });

      return {
        success: true,
        status: 'queued',
        notificationId: notification.id
      };
    } catch (error) {
      logger.error('Failed to queue notification', {
        type: 'notification',
        error: error.message,
        userId: notification.userId
      });
      throw error;
    }
  }

  /**
   * Deliver queued notifications when user comes online
   */
  async deliverQueuedNotifications(userId) {
    try {
      if (!this.offlineQueue.has(userId)) {
        return { delivered: 0 };
      }

      const userQueue = this.offlineQueue.get(userId);
      const notifications = [...userQueue];
      
      // Clear queue
      this.offlineQueue.delete(userId);

      let delivered = 0;
      let failed = 0;

      for (const notification of notifications) {
        try {
          const results = await this.deliverNotification(notification);
          const success = Object.values(results).some(r => r.success);
          
          if (success) {
            delivered++;
            notification.status = 'delivered';
          } else {
            failed++;
            notification.status = 'failed';
          }

          await this.storeNotification(notification);
        } catch (error) {
          failed++;
          logger.error('Failed to deliver queued notification', {
            type: 'notification',
            notificationId: notification.id,
            error: error.message
          });
        }
      }

      logger.info('Queued notifications delivered', {
        type: 'notification',
        userId,
        total: notifications.length,
        delivered,
        failed
      });

      return { delivered, failed, total: notifications.length };
    } catch (error) {
      logger.error('Failed to deliver queued notifications', {
        type: 'notification',
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Retry failed notification
   */
  async retryNotification(notificationId) {
    try {
      const notification = await this.getNotification(notificationId);

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.retryCount >= this.config.maxRetries) {
        logger.warn('Max retries exceeded', {
          type: 'notification',
          notificationId
        });
        return { success: false, reason: 'max_retries_exceeded' };
      }

      notification.retryCount++;
      notification.status = 'retrying';

      const results = await this.deliverNotification(notification);
      await this.storeNotification(notification);

      logger.info('Notification retry completed', {
        type: 'notification',
        notificationId,
        retryCount: notification.retryCount,
        results
      });

      return { success: true, results };
    } catch (error) {
      logger.error('Failed to retry notification', {
        type: 'notification',
        error: error.message,
        notificationId
      });
      throw error;
    }
  }

  /**
   * Check rate limit for user
   */
  checkRateLimit(userId) {
    const now = Date.now();
    
    if (!this.rateLimits.has(userId)) {
      this.rateLimits.set(userId, {
        count: 1,
        resetAt: now + this.config.rateLimitWindow
      });
      return true;
    }

    const limit = this.rateLimits.get(userId);

    // Reset if window expired
    if (now >= limit.resetAt) {
      limit.count = 1;
      limit.resetAt = now + this.config.rateLimitWindow;
      return true;
    }

    // Check if under limit
    if (limit.count < this.config.maxNotificationsPerWindow) {
      limit.count++;
      return true;
    }

    return false;
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId) {
    if (!userId) return false;
    
    try {
      // Check WebSocket connections
      const connections = websocketServer.getUserConnections(userId);
      return connections && connections.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Apply template with data
   */
  applyTemplate(template, data) {
    if (!data) return template;

    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  /**
   * Generate email HTML
   */
  generateEmailHTML(subject, body, data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${subject}</h1>
          </div>
          <div class="content">
            <p>${body}</p>
          </div>
          <div class="footer">
            <p>BizGrow AI - Business Automation Platform</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate webhook signature
   */
  generateWebhookSignature(payload) {
    const crypto = require('crypto');
    const secret = process.env.WEBHOOK_SECRET || 'default-secret';
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Generate notification ID
   */
  generateNotificationId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store notification in database
   */
  async storeNotification(notification) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO notification_log 
          (notification_id, user_id, type, title, message, channels, status, retry_count, delivery_attempts, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (notification_id) 
          DO UPDATE SET status = $7, retry_count = $8, delivery_attempts = $9
        `, [
          notification.id,
          notification.userId,
          notification.type,
          notification.title,
          notification.message,
          JSON.stringify(notification.channels || []),
          notification.status,
          notification.retryCount,
          JSON.stringify(notification.deliveryAttempts || [])
        ]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT OR REPLACE INTO notification_log 
            (notification_id, user_id, type, title, message, channels, status, retry_count, delivery_attempts, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            notification.id,
            notification.userId,
            notification.type,
            notification.title,
            notification.message,
            JSON.stringify(notification.channels || []),
            notification.status,
            notification.retryCount,
            JSON.stringify(notification.deliveryAttempts || [])
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      logger.error('Failed to store notification', {
        type: 'notification',
        error: error.message,
        notificationId: notification.id
      });
    }
  }

  /**
   * Get notification by ID
   */
  async getNotification(notificationId) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      let query, params;
      
      if (dbType === 'postgres') {
        query = 'SELECT * FROM notification_log WHERE notification_id = $1';
        params = [notificationId];
      } else {
        query = 'SELECT * FROM notification_log WHERE notification_id = ?';
        params = [notificationId];
      }

      const result = dbType === 'postgres'
        ? await db.query(query, params)
        : await new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
              if (err) reject(err);
              else resolve({ rows: row ? [row] : [] });
            });
          });

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.notification_id,
        userId: row.user_id,
        type: row.type,
        title: row.title,
        message: row.message,
        channels: JSON.parse(row.channels),
        status: row.status,
        retryCount: row.retry_count,
        deliveryAttempts: JSON.parse(row.delivery_attempts || '[]')
      };
    } catch (error) {
      logger.error('Failed to get notification', {
        type: 'notification',
        error: error.message,
        notificationId
      });
      return null;
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, limit = 50, status = null) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      let query, params;
      
      if (dbType === 'postgres') {
        query = status
          ? 'SELECT * FROM notifications WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3'
          : 'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2';
        params = status ? [userId, status, limit] : [userId, limit];
      } else {
        query = status
          ? 'SELECT * FROM notifications WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?'
          : 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?';
        params = status ? [userId, status, limit] : [userId, limit];
      }

      const result = dbType === 'postgres'
        ? await db.query(query, params)
        : await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
              if (err) reject(err);
              else resolve({ rows: rows || [] });
            });
          });

      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        message: row.message,
        data: JSON.parse(row.data || '{}'),
        priority: row.priority,
        status: row.status,
        createdAt: row.created_at
      }));
    } catch (error) {
      logger.error('Failed to get user notifications', {
        type: 'notification',
        error: error.message,
        userId
      });
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      if (dbType === 'postgres') {
        await db.query(
          'UPDATE notifications SET status = $1 WHERE id = $2',
          ['read', notificationId]
        );
      } else {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE notifications SET status = ? WHERE id = ?',
            ['read', notificationId],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      return true;
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        type: 'notification',
        error: error.message,
        notificationId
      });
      return false;
    }
  }

  /**
   * Update metrics
   */
  updateMetrics(results) {
    this.metrics.totalSent++;
    
    const anySuccess = Object.values(results).some(r => r.success);
    if (anySuccess) {
      this.metrics.totalDelivered++;
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.deliveryQueue.length,
      offlineQueueSize: Array.from(this.offlineQueue.values()).reduce((sum, q) => sum + q.length, 0),
      offlineUsers: this.offlineQueue.size
    };
  }

  /**
   * Get configuration
   */
  getConfig() {
    return {
      ...this.config,
      channels: {
        websocket: this.channels.websocket.enabled,
        email: this.channels.email.enabled,
        inApp: this.channels.inApp.enabled,
        webhook: this.channels.webhook.enabled
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    this.config = {
      ...this.config,
      ...config
    };

    logger.info('Notification configuration updated', {
      type: 'notification',
      config: this.config
    });
  }

  /**
   * Add notification template
   */
  addTemplate(name, template) {
    this.templates.set(name, template);
    
    logger.info('Notification template added', {
      type: 'notification',
      name
    });
  }

  /**
   * Get template
   */
  getTemplate(name) {
    return this.templates.get(name);
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      let query, params;
      
      if (dbType === 'postgres') {
        query = 'SELECT * FROM notification_preferences WHERE user_id = $1';
        params = [userId];
      } else {
        query = 'SELECT * FROM notification_preferences WHERE user_id = ?';
        params = [userId];
      }

      const result = dbType === 'postgres'
        ? await db.query(query, params)
        : await new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
              if (err) reject(err);
              else resolve({ rows: row ? [row] : [] });
            });
          });

      if (result.rows.length === 0) {
        // Return default preferences
        return {
          userId,
          emailEnabled: true,
          websocketEnabled: true,
          inAppEnabled: true,
          webhookEnabled: false,
          webhookUrl: null,
          notificationTypes: {},
          quietHoursStart: null,
          quietHoursEnd: null
        };
      }

      const row = result.rows[0];
      return {
        userId: row.user_id,
        emailEnabled: row.email_enabled,
        websocketEnabled: row.websocket_enabled,
        inAppEnabled: row.in_app_enabled,
        webhookEnabled: row.webhook_enabled,
        webhookUrl: row.webhook_url,
        notificationTypes: JSON.parse(row.notification_types || '{}'),
        quietHoursStart: row.quiet_hours_start,
        quietHoursEnd: row.quiet_hours_end
      };
    } catch (error) {
      logger.error('Failed to get user preferences', {
        type: 'notification',
        error: error.message,
        userId
      });
      return null;
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      if (dbType === 'postgres') {
        await db.query(`
          INSERT INTO notification_preferences 
          (user_id, email_enabled, websocket_enabled, in_app_enabled, webhook_enabled, webhook_url, notification_types, quiet_hours_start, quiet_hours_end, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            email_enabled = $2,
            websocket_enabled = $3,
            in_app_enabled = $4,
            webhook_enabled = $5,
            webhook_url = $6,
            notification_types = $7,
            quiet_hours_start = $8,
            quiet_hours_end = $9,
            updated_at = NOW()
        `, [
          userId,
          preferences.emailEnabled !== undefined ? preferences.emailEnabled : true,
          preferences.websocketEnabled !== undefined ? preferences.websocketEnabled : true,
          preferences.inAppEnabled !== undefined ? preferences.inAppEnabled : true,
          preferences.webhookEnabled !== undefined ? preferences.webhookEnabled : false,
          preferences.webhookUrl || null,
          JSON.stringify(preferences.notificationTypes || {}),
          preferences.quietHoursStart || null,
          preferences.quietHoursEnd || null
        ]);
      } else {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT OR REPLACE INTO notification_preferences 
            (user_id, email_enabled, websocket_enabled, in_app_enabled, webhook_enabled, webhook_url, notification_types, quiet_hours_start, quiet_hours_end, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            userId,
            preferences.emailEnabled !== undefined ? preferences.emailEnabled : true,
            preferences.websocketEnabled !== undefined ? preferences.websocketEnabled : true,
            preferences.inAppEnabled !== undefined ? preferences.inAppEnabled : true,
            preferences.webhookEnabled !== undefined ? preferences.webhookEnabled : false,
            preferences.webhookUrl || null,
            JSON.stringify(preferences.notificationTypes || {}),
            preferences.quietHoursStart || null,
            preferences.quietHoursEnd || null
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      logger.info('User preferences updated', {
        type: 'notification',
        userId
      });

      return true;
    } catch (error) {
      logger.error('Failed to update user preferences', {
        type: 'notification',
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Check if notification should be sent based on user preferences
   */
  async shouldSendNotification(userId, notificationType, channel) {
    try {
      const preferences = await this.getUserPreferences(userId);
      
      if (!preferences) {
        return true; // Default to sending if preferences not found
      }

      // Check channel preferences
      if (channel === 'email' && !preferences.emailEnabled) return false;
      if (channel === 'websocket' && !preferences.websocketEnabled) return false;
      if (channel === 'inApp' && !preferences.inAppEnabled) return false;
      if (channel === 'webhook' && !preferences.webhookEnabled) return false;

      // Check notification type preferences
      if (preferences.notificationTypes[notificationType] === false) {
        return false;
      }

      // Check quiet hours
      if (preferences.quietHoursStart && preferences.quietHoursEnd) {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        if (currentTime >= preferences.quietHoursStart && currentTime <= preferences.quietHoursEnd) {
          // During quiet hours, only send critical notifications
          if (notificationType !== 'critical' && notificationType !== 'system_alert') {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to check notification preferences', {
        type: 'notification',
        error: error.message,
        userId
      });
      return true; // Default to sending on error
    }
  }

  /**
   * Get notification analytics
   */
  async getAnalytics(startDate, endDate, userId = null) {
    try {
      const db = getDatabase();
      const dbType = getDatabaseType();

      let query, params;
      
      if (dbType === 'postgres') {
        query = userId
          ? `SELECT 
              COUNT(*) as total,
              COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
              COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN status = 'queued_offline' THEN 1 END) as queued,
              COUNT(CASE WHEN status = 'rate_limited' THEN 1 END) as rate_limited,
              type,
              DATE(created_at) as date
            FROM notification_log
            WHERE created_at >= $1 AND created_at <= $2 AND user_id = $3
            GROUP BY type, DATE(created_at)
            ORDER BY date DESC`
          : `SELECT 
              COUNT(*) as total,
              COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
              COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN status = 'queued_offline' THEN 1 END) as queued,
              COUNT(CASE WHEN status = 'rate_limited' THEN 1 END) as rate_limited,
              type,
              DATE(created_at) as date
            FROM notification_log
            WHERE created_at >= $1 AND created_at <= $2
            GROUP BY type, DATE(created_at)
            ORDER BY date DESC`;
        params = userId ? [startDate, endDate, userId] : [startDate, endDate];
      } else {
        query = userId
          ? `SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
              SUM(CASE WHEN status = 'queued_offline' THEN 1 ELSE 0 END) as queued,
              SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) as rate_limited,
              type,
              DATE(created_at) as date
            FROM notification_log
            WHERE created_at >= ? AND created_at <= ? AND user_id = ?
            GROUP BY type, DATE(created_at)
            ORDER BY date DESC`
          : `SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
              SUM(CASE WHEN status = 'queued_offline' THEN 1 ELSE 0 END) as queued,
              SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) as rate_limited,
              type,
              DATE(created_at) as date
            FROM notification_log
            WHERE created_at >= ? AND created_at <= ?
            GROUP BY type, DATE(created_at)
            ORDER BY date DESC`;
        params = userId ? [startDate, endDate, userId] : [startDate, endDate];
      }

      const result = dbType === 'postgres'
        ? await db.query(query, params)
        : await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
              if (err) reject(err);
              else resolve({ rows: rows || [] });
            });
          });

      return result.rows;
    } catch (error) {
      logger.error('Failed to get notification analytics', {
        type: 'notification',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get notification report
   */
  async getReport(startDate, endDate) {
    try {
      const analytics = await this.getAnalytics(startDate, endDate);
      
      // Aggregate data
      const summary = {
        totalNotifications: 0,
        delivered: 0,
        failed: 0,
        queued: 0,
        rateLimited: 0,
        deliveryRate: 0,
        byType: {},
        byDate: {}
      };

      for (const row of analytics) {
        summary.totalNotifications += parseInt(row.total);
        summary.delivered += parseInt(row.delivered);
        summary.failed += parseInt(row.failed);
        summary.queued += parseInt(row.queued);
        summary.rateLimited += parseInt(row.rate_limited);

        // By type
        if (!summary.byType[row.type]) {
          summary.byType[row.type] = {
            total: 0,
            delivered: 0,
            failed: 0
          };
        }
        summary.byType[row.type].total += parseInt(row.total);
        summary.byType[row.type].delivered += parseInt(row.delivered);
        summary.byType[row.type].failed += parseInt(row.failed);

        // By date
        if (!summary.byDate[row.date]) {
          summary.byDate[row.date] = {
            total: 0,
            delivered: 0,
            failed: 0
          };
        }
        summary.byDate[row.date].total += parseInt(row.total);
        summary.byDate[row.date].delivered += parseInt(row.delivered);
        summary.byDate[row.date].failed += parseInt(row.failed);
      }

      // Calculate delivery rate
      if (summary.totalNotifications > 0) {
        summary.deliveryRate = (summary.delivered / summary.totalNotifications) * 100;
      }

      return summary;
    } catch (error) {
      logger.error('Failed to generate notification report', {
        type: 'notification',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get all templates
   */
  getAllTemplates() {
    return Array.from(this.templates.entries()).map(([name, template]) => ({
      name,
      ...template
    }));
  }
}

// Singleton instance
const notificationService = new NotificationService();

export default notificationService;
