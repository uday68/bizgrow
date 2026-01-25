# Comprehensive Notification System

## Overview

The Notification System provides real-time, multi-channel notification delivery with tracking, retry logic, and offline user queuing for the BizGrow AI platform.

## Features

### 1. Multi-Channel Delivery
- **WebSocket**: Real-time notifications via WebSocket connections
- **Email**: Email notifications with HTML templates
- **In-App**: Persistent notifications in user inbox
- **Webhook**: External system integration via webhooks

### 2. User Preferences
- **Channel Preferences**: Enable/disable specific channels per user
- **Notification Type Filtering**: Control which notification types to receive
- **Quiet Hours**: Set quiet hours to suppress non-critical notifications
- **Webhook Configuration**: Custom webhook URLs per user

### 3. Delivery Tracking
- **Status Tracking**: Track notification status (pending, delivered, failed, etc.)
- **Delivery Attempts**: Log all delivery attempts with timestamps
- **Channel Results**: Track success/failure per channel
- **Metrics**: Comprehensive metrics for monitoring

### 4. Retry Logic
- **Automatic Retry**: Failed notifications are automatically retried
- **Exponential Backoff**: Configurable retry delays
- **Max Retries**: Prevent infinite retry loops
- **Manual Retry**: Admin can manually retry failed notifications

### 5. Offline User Queuing
- **Automatic Queuing**: Notifications for offline users are queued
- **Delivery on Connect**: Queued notifications delivered when user connects
- **Queue Limits**: Per-user queue size limits prevent memory issues
- **Queue Persistence**: Queued notifications stored in database

### 6. Rate Limiting
- **Per-User Limits**: Prevent notification spam per user
- **Configurable Windows**: Adjustable rate limit windows
- **Automatic Enforcement**: Rate limits enforced automatically
- **Bypass for Critical**: Critical notifications can bypass limits

### 7. Templates
- **Predefined Templates**: Common notification templates
- **Variable Substitution**: Dynamic content via template variables
- **Custom Templates**: Add custom templates via API
- **HTML Email**: Rich HTML email templates

### 8. Analytics and Reporting
- **Delivery Analytics**: Track delivery rates by type and date
- **Performance Metrics**: Monitor notification system performance
- **User Analytics**: Per-user notification statistics
- **Custom Reports**: Generate reports for specific time periods

## Architecture

### Components

1. **NotificationService** (`server/services/notificationService.js`)
   - Core notification service
   - Handles multi-channel delivery
   - Manages queuing and retry logic

2. **Notification Routes** (`server/routes/notifications.js`)
   - REST API endpoints for notifications
   - User notification management
   - Template management

3. **Database Schema** (`server/database/migrations/004_notification_schema.sql`)
   - notification_log: Delivery tracking
   - notifications: In-app notifications
   - notification_preferences: User preferences
   - notification_templates: Template storage

4. **WebSocket Integration**
   - Real-time delivery via WebSocket
   - Automatic queued notification delivery on connect
   - User connection tracking

## Configuration

### Default Configuration

```javascript
{
  maxQueueSize: 10000,              // Maximum total queued notifications
  maxRetries: 3,                    // Maximum retry attempts
  retryDelay: 5000,                 // Retry delay in milliseconds
  queueProcessingInterval: 2000,    // Queue check interval
  rateLimitWindow: 60000,           // Rate limit window (1 minute)
  maxNotificationsPerWindow: 50     // Max notifications per window
}
```

### Channel Configuration

```javascript
{
  websocket: { enabled: true },
  email: { enabled: false },  // Requires SMTP configuration
  inApp: { enabled: true },
  webhook: { enabled: true }
}
```

### Environment Variables

```bash
# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@bizgrow.ai

# Webhook Configuration (optional)
WEBHOOK_SECRET=your-webhook-secret
```

## API Endpoints

### Send Notification

#### POST `/api/notifications/send`
Send a notification through one or more channels.

**Authentication**: Required

**Request Body:**
```json
{
  "userId": 123,
  "title": "New Business Discovered",
  "message": "A new business matching your criteria has been discovered",
  "type": "business_discovered",
  "channels": ["websocket", "email", "inApp"],
  "priority": "normal",
  "email": "user@example.com",
  "template": "business_discovered",
  "data": {
    "businessName": "Acme Corp",
    "location": "Seattle, WA"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "notificationId": "notif_1234567890_abc123",
    "results": {
      "websocket": { "success": true, "channel": "websocket" },
      "email": { "success": true, "channel": "email" },
      "inApp": { "success": true, "channel": "inApp" }
    }
  }
}
```

### Get User Notifications

#### GET `/api/notifications/user/:userId`
Get notifications for a specific user.

**Authentication**: Required (own notifications or admin)

**Query Parameters:**
- `limit` (optional): Number of notifications to return (default: 50)
- `status` (optional): Filter by status (unread, read)

**Response:**
```json
{
  "success": true,
  "notifications": [
    {
      "id": 1,
      "userId": 123,
      "title": "New Business Discovered",
      "message": "A new business has been discovered",
      "data": { "businessName": "Acme Corp" },
      "priority": "normal",
      "status": "unread",
      "createdAt": "2024-01-25T10:00:00Z"
    }
  ]
}
```

### Mark as Read

#### POST `/api/notifications/:notificationId/read`
Mark a notification as read.

**Authentication**: Required

**Response:**
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

### Retry Failed Notification

#### POST `/api/notifications/:notificationId/retry`
Manually retry a failed notification.

**Authentication**: Required (admin only)

**Response:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "results": {
      "email": { "success": true, "channel": "email" }
    }
  }
}
```

### Get Metrics

#### GET `/api/notifications/metrics`
Get notification system metrics.

**Authentication**: Required (admin only)

**Response:**
```json
{
  "success": true,
  "metrics": {
    "totalSent": 1500,
    "totalFailed": 25,
    "totalQueued": 10,
    "totalDelivered": 1475,
    "byChannel": {
      "websocket": { "sent": 1200, "failed": 10, "delivered": 1190 },
      "email": { "sent": 800, "failed": 15, "delivered": 785 },
      "inApp": { "sent": 1500, "failed": 0, "delivered": 1500 },
      "webhook": { "sent": 100, "failed": 5, "delivered": 95 }
    },
    "queueSize": 5,
    "offlineQueueSize": 10,
    "offlineUsers": 3
  }
}
```

### Get Configuration

#### GET `/api/notifications/config`
Get notification system configuration.

**Authentication**: Required (admin only)

### Update Configuration

#### POST `/api/notifications/config`
Update notification system configuration.

**Authentication**: Required (admin only)

**Request Body:**
```json
{
  "maxQueueSize": 20000,
  "maxRetries": 5,
  "rateLimitWindow": 120000,
  "maxNotificationsPerWindow": 100
}
```

### Template Management

#### GET `/api/notifications/templates`
Get all notification templates.

**Authentication**: Required

#### GET `/api/notifications/templates/:name`
Get a specific template.

**Authentication**: Required

#### POST `/api/notifications/templates`
Add a new template.

**Authentication**: Required (admin only)

**Request Body:**
```json
{
  "name": "custom_alert",
  "template": {
    "subject": "Custom Alert: {{alertType}}",
    "body": "Alert message: {{message}}",
    "priority": "high"
  }
}
```

### Test Notification

#### POST `/api/notifications/test`
Send a test notification.

**Authentication**: Required (admin only)

**Request Body:**
```json
{
  "userId": 123,
  "channels": ["websocket", "inApp"]
}
```

### User Preferences

#### GET `/api/notifications/preferences/:userId`
Get user notification preferences.

**Authentication**: Required (own preferences or admin)

**Response:**
```json
{
  "success": true,
  "preferences": {
    "userId": 123,
    "emailEnabled": true,
    "websocketEnabled": true,
    "inAppEnabled": true,
    "webhookEnabled": false,
    "webhookUrl": null,
    "notificationTypes": {
      "business_discovered": true,
      "proposal_generated": true,
      "system_alert": true
    },
    "quietHoursStart": "22:00",
    "quietHoursEnd": "08:00"
  }
}
```

#### POST `/api/notifications/preferences/:userId`
Update user notification preferences.

**Authentication**: Required (own preferences or admin)

**Request Body:**
```json
{
  "emailEnabled": true,
  "websocketEnabled": true,
  "inAppEnabled": true,
  "webhookEnabled": false,
  "webhookUrl": null,
  "notificationTypes": {
    "business_discovered": true,
    "proposal_generated": false,
    "system_alert": true
  },
  "quietHoursStart": "22:00",
  "quietHoursEnd": "08:00"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

### Analytics and Reporting

#### GET `/api/notifications/analytics`
Get notification analytics.

**Authentication**: Required (admin only)

**Query Parameters:**
- `startDate` (optional): Start date (ISO format, default: 30 days ago)
- `endDate` (optional): End date (ISO format, default: now)
- `userId` (optional): Filter by user ID

**Response:**
```json
{
  "success": true,
  "analytics": [
    {
      "total": 150,
      "delivered": 145,
      "failed": 3,
      "queued": 2,
      "rate_limited": 0,
      "type": "business_discovered",
      "date": "2024-01-25"
    }
  ],
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  }
}
```

#### GET `/api/notifications/report`
Generate notification report.

**Authentication**: Required (admin only)

**Query Parameters:**
- `startDate` (optional): Start date (ISO format, default: 30 days ago)
- `endDate` (optional): End date (ISO format, default: now)

**Response:**
```json
{
  "success": true,
  "report": {
    "totalNotifications": 1500,
    "delivered": 1450,
    "failed": 30,
    "queued": 15,
    "rateLimited": 5,
    "deliveryRate": 96.67,
    "byType": {
      "business_discovered": {
        "total": 800,
        "delivered": 790,
        "failed": 10
      },
      "proposal_generated": {
        "total": 500,
        "delivered": 485,
        "failed": 15
      }
    },
    "byDate": {
      "2024-01-25": {
        "total": 150,
        "delivered": 145,
        "failed": 5
      }
    }
  },
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  }
}
```

## Usage Examples

### Basic Notification

```javascript
// Send a simple notification
await notificationService.sendNotification({
  userId: 123,
  title: 'Task Completed',
  message: 'Your task has been completed successfully',
  channels: ['websocket', 'inApp'],
  priority: 'normal'
});
```

### Email Notification with Template

```javascript
// Send email using template
await notificationService.sendNotification({
  userId: 123,
  email: 'user@example.com',
  title: 'Proposal Generated',
  message: 'A new proposal has been generated',
  template: 'proposal_generated',
  channels: ['email', 'inApp'],
  priority: 'high',
  data: {
    businessName: 'Acme Corp',
    proposalId: 456
  }
});
```

### Webhook Notification

```javascript
// Send webhook notification
await notificationService.sendNotification({
  title: 'System Event',
  message: 'Important system event occurred',
  type: 'system_event',
  channels: ['webhook'],
  webhookUrl: 'https://external-system.com/webhook',
  data: {
    eventType: 'database_backup_completed',
    timestamp: new Date().toISOString()
  }
});
```

### Broadcast Notification

```javascript
// Broadcast to all users
await notificationService.sendNotification({
  title: 'System Maintenance',
  message: 'System maintenance scheduled for tonight',
  channels: ['websocket', 'inApp'],
  priority: 'critical'
  // No userId = broadcast
});
```

### User Preferences

```javascript
// Get user preferences
const preferences = await notificationService.getUserPreferences(123);

// Update user preferences
await notificationService.updateUserPreferences(123, {
  emailEnabled: true,
  websocketEnabled: true,
  inAppEnabled: true,
  notificationTypes: {
    business_discovered: true,
    proposal_generated: false, // Disable this type
    system_alert: true
  },
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00'
});
```

### Analytics and Reporting

```javascript
// Get analytics for last 30 days
const analytics = await notificationService.getAnalytics(
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  new Date().toISOString()
);

// Get analytics for specific user
const userAnalytics = await notificationService.getAnalytics(
  startDate,
  endDate,
  123 // userId
);

// Generate report
const report = await notificationService.getReport(
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  new Date().toISOString()
);

console.log(`Delivery rate: ${report.deliveryRate.toFixed(2)}%`);
console.log(`Total notifications: ${report.totalNotifications}`);
console.log(`Delivered: ${report.delivered}`);
console.log(`Failed: ${report.failed}`);
```

## Notification Types

### Predefined Templates

1. **business_discovered**
   - Subject: "New Business Discovered"
   - Variables: businessName
   - Priority: normal

2. **proposal_generated**
   - Subject: "Proposal Generated"
   - Variables: businessName
   - Priority: high

3. **project_completed**
   - Subject: "Project Completed"
   - Variables: businessName
   - Priority: high

4. **system_alert**
   - Subject: "System Alert"
   - Variables: message
   - Priority: critical

5. **agent_error**
   - Subject: "Agent Error"
   - Variables: agentName, error
   - Priority: high

## Delivery Flow

### Online User Flow

1. Notification sent via API
2. Rate limit check
3. User online check
4. Deliver through requested channels
5. Track delivery status
6. Store in database
7. Update metrics

### Offline User Flow

1. Notification sent via API
2. Rate limit check
3. User offline detected
4. Add to offline queue
5. Store in database
6. Wait for user connection
7. Deliver on connection
8. Update status

### Retry Flow

1. Delivery fails
2. Check retry count
3. If under max retries:
   - Increment retry count
   - Wait retry delay
   - Attempt delivery again
4. If max retries exceeded:
   - Mark as failed
   - Log error
   - Alert admin

## Rate Limiting

### How It Works

- Each user has a rate limit counter
- Counter resets after rate limit window
- Notifications increment counter
- Exceeding limit rejects notification
- Critical notifications can bypass (future enhancement)

### Configuration

```javascript
// Default: 50 notifications per minute per user
{
  rateLimitWindow: 60000,           // 1 minute
  maxNotificationsPerWindow: 50     // 50 notifications
}
```

## Monitoring

### Key Metrics

- **Total Sent**: Total notifications sent
- **Total Delivered**: Successfully delivered notifications
- **Total Failed**: Failed notifications
- **Total Queued**: Currently queued notifications
- **Channel Metrics**: Per-channel success/failure rates
- **Queue Size**: Current queue length
- **Offline Users**: Number of users with queued notifications

### Alerts

Set up alerts for:
- High failure rate (> 5%)
- Large queue size (> 1000)
- Many offline users (> 100)
- Channel failures
- Rate limit violations

## User Preferences

### Preference Options

Users can customize their notification experience through preferences:

1. **Channel Preferences**
   - Enable/disable email notifications
   - Enable/disable WebSocket notifications
   - Enable/disable in-app notifications
   - Enable/disable webhook notifications

2. **Notification Type Filtering**
   - Control which notification types to receive
   - Example: Disable "business_discovered" but keep "system_alert"

3. **Quiet Hours**
   - Set start and end times for quiet hours
   - During quiet hours, only critical notifications are delivered
   - Format: "HH:MM" (24-hour format)

4. **Webhook Configuration**
   - Set custom webhook URL for notifications
   - Requires webhook channel to be enabled

### How Preferences Work

When a notification is sent:

1. **Check Channel Preferences**: If user has disabled a channel, skip it
2. **Check Type Preferences**: If user has disabled the notification type, skip it
3. **Check Quiet Hours**: If in quiet hours and not critical, skip it
4. **Deliver**: Send through remaining channels

### Default Preferences

If a user hasn't set preferences, defaults are:
- All channels enabled (except webhook)
- All notification types enabled
- No quiet hours
- No webhook URL

## Database Schema

### notification_log Table

Tracks all notification deliveries.

```sql
CREATE TABLE notification_log (
  id SERIAL PRIMARY KEY,
  notification_id VARCHAR(255) UNIQUE NOT NULL,
  user_id INTEGER,
  type VARCHAR(100),
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  channels JSONB NOT NULL,
  status VARCHAR(50) NOT NULL,
  retry_count INTEGER DEFAULT 0,
  delivery_attempts JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### notifications Table

Stores in-app notifications.

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  priority VARCHAR(50) DEFAULT 'normal',
  status VARCHAR(50) DEFAULT 'unread',
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);
```

### notification_preferences Table

User notification preferences (future enhancement).

```sql
CREATE TABLE notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  websocket_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  webhook_enabled BOOLEAN DEFAULT false,
  webhook_url VARCHAR(500),
  notification_types JSONB,
  quiet_hours_start TIME,
  quiet_hours_end TIME
);
```

## Best Practices

### 1. Choose Appropriate Channels

- **WebSocket**: Real-time updates, user must be online
- **Email**: Important notifications, user doesn't need to be online
- **In-App**: Persistent notifications, user can check later
- **Webhook**: External system integration

### 2. Set Correct Priority

- **low**: Informational, can be delayed
- **normal**: Standard notifications
- **high**: Important, should be delivered quickly
- **critical**: Urgent, requires immediate attention

### 3. Use Templates

- Consistent messaging
- Easy to update
- Variable substitution
- Localization support (future)

### 4. Handle Failures Gracefully

- Always check return status
- Log failures for debugging
- Implement fallback strategies
- Monitor failure rates

### 5. Respect Rate Limits

- Don't spam users
- Batch notifications when possible
- Use appropriate priorities
- Monitor rate limit violations

## Troubleshooting

### Notifications Not Delivered

1. Check user is online (for WebSocket)
2. Verify channel is enabled
3. Check rate limits
4. Review delivery attempts in database
5. Check error logs

### Email Not Sending

1. Verify SMTP configuration
2. Check email credentials
3. Test SMTP connection
4. Review email logs
5. Check spam filters

### High Failure Rate

1. Review error logs
2. Check external service status
3. Verify network connectivity
4. Review retry configuration
5. Check resource limits

### Queue Growing

1. Check user connection rates
2. Verify delivery is working
3. Review queue processing interval
4. Check for stuck notifications
5. Consider increasing capacity

## Future Enhancements

1. **User Preferences**: Allow users to customize notification settings
2. **Quiet Hours**: Respect user quiet hours
3. **Notification Grouping**: Group similar notifications
4. **Push Notifications**: Mobile push notification support
5. **SMS Notifications**: SMS channel support
6. **Localization**: Multi-language support
7. **Rich Content**: Support for images, buttons, actions
8. **Notification History**: Extended history and search
9. **Analytics**: Detailed notification analytics
10. **A/B Testing**: Test different notification strategies
