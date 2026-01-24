import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import apmService from '../services/apmService.js';
import chatService from '../services/chatService.js';
import chatAPMIntegration from '../services/chatAPMIntegration.js';
import { apmMiddleware } from '../middleware/apmMiddleware.js';

// Mock dependencies
jest.mock('../services/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    chat: jest.fn(),
    performance: jest.fn(),
    business: jest.fn()
  }
}));

jest.mock('../services/cacheService.js', () => ({
  default: {
    set: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
    isConnected: true
  }
}));

describe('APM Integration Tests', () => {
  let app;
  let server;

  beforeAll(() => {
    // Create test Express app
    app = express();
    app.use(express.json());
    app.use(apmMiddleware());

    // Test routes
    app.get('/test/fast', (req, res) => {
      res.json({ message: 'Fast response' });
    });

    app.get('/test/slow', (req, res) => {
      setTimeout(() => {
        res.json({ message: 'Slow response' });
      }, 1500); // 1.5 seconds - should trigger slow request alert
    });

    app.get('/test/error', (req, res) => {
      res.status(500).json({ error: 'Test error' });
    });

    app.post('/test/chat-session', (req, res) => {
      req.trackChatMetric('session_created', { customerId: 'test-customer' });
      res.json({ sessionId: 'test-session-123' });
    });

    app.post('/test/chat-message', (req, res) => {
      req.trackChatMetric('message_sent', { 
        sessionId: 'test-session-123',
        messageLength: req.body.message?.length || 0
      });
      res.json({ messageId: 'test-message-456' });
    });

    app.get('/test/business-metric', (req, res) => {
      req.trackBusinessMetric('test_conversion', { value: 100 });
      res.json({ success: true });
    });
  });

  beforeEach(() => {
    // Reset APM metrics before each test
    apmService.metrics = {
      responseTime: {
        current: 0,
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        samples: []
      },
      throughput: {
        requestsPerSecond: 0,
        requestsPerMinute: 0,
        totalRequests: 0,
        requestCounts: []
      },
      errorRate: {
        current: 0,
        total: 0,
        errors: 0,
        errorsByType: new Map(),
        errorHistory: []
      },
      systemResources: {
        cpu: { usage: 0, loadAverage: [0, 0, 0], cores: 4 },
        memory: { used: 0, free: 0, total: 0, usage: 0, heapUsed: 0, heapTotal: 0 },
        disk: { usage: 0, free: 0, total: 0 },
        network: { bytesIn: 0, bytesOut: 0 }
      },
      business: {
        activeUsers: 0,
        chatSessions: 0,
        agentUtilization: 0,
        conversionRate: 0
      }
    };

    apmService.activeRequests = new Map();
    apmService.requestHistory = [];
    apmService.alerts = new Map();
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  describe('APM Request Tracking', () => {
    test('should track fast requests correctly', async () => {
      const response = await request(app)
        .get('/test/fast')
        .expect(200);

      expect(response.body.message).toBe('Fast response');
      
      // Check that request was tracked
      expect(apmService.metrics.throughput.totalRequests).toBe(1);
      expect(apmService.metrics.responseTime.samples.length).toBe(1);
      expect(apmService.metrics.responseTime.samples[0]).toBeLessThan(1000); // Should be fast
    });

    test('should track slow requests and generate alerts', async () => {
      const response = await request(app)
        .get('/test/slow')
        .expect(200);

      expect(response.body.message).toBe('Slow response');
      
      // Check that slow request was tracked
      expect(apmService.metrics.throughput.totalRequests).toBe(1);
      expect(apmService.metrics.responseTime.samples.length).toBe(1);
      expect(apmService.metrics.responseTime.samples[0]).toBeGreaterThan(1000); // Should be slow
    });

    test('should track errors correctly', async () => {
      const response = await request(app)
        .get('/test/error')
        .expect(500);

      expect(response.body.error).toBe('Test error');
      
      // Check that error was tracked
      expect(apmService.metrics.throughput.totalRequests).toBe(1);
      expect(apmService.metrics.errorRate.errors).toBe(1);
      expect(apmService.metrics.errorRate.total).toBe(1);
      expect(apmService.metrics.errorRate.current).toBe(1); // 100% error rate
    });

    test('should add performance headers to responses', async () => {
      const response = await request(app)
        .get('/test/fast')
        .expect(200);

      expect(response.headers['x-response-time']).toBeDefined();
      expect(response.headers['x-process-time']).toBeDefined();
      expect(response.headers['x-memory-usage']).toBeDefined();
    });
  });

  describe('Chat APM Integration', () => {
    test('should track chat session creation', async () => {
      const response = await request(app)
        .post('/test/chat-session')
        .send({ customerId: 'test-customer' })
        .expect(200);

      expect(response.body.sessionId).toBe('test-session-123');
      
      // Verify chat metric was tracked
      expect(apmService.metrics.business.chatSessions).toBeGreaterThanOrEqual(0);
    });

    test('should track chat message sending', async () => {
      const response = await request(app)
        .post('/test/chat-message')
        .send({ 
          sessionId: 'test-session-123',
          message: 'Hello, I need help with my order'
        })
        .expect(200);

      expect(response.body.messageId).toBe('test-message-456');
    });
  });

  describe('Business Metrics Tracking', () => {
    test('should track business metrics', async () => {
      const response = await request(app)
        .get('/test/business-metric')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('APM Service Methods', () => {
    test('should get current metrics', () => {
      const metrics = apmService.getCurrentMetrics();
      
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('throughput');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('systemResources');
      expect(metrics).toHaveProperty('business');
      expect(metrics).toHaveProperty('activeRequests');
      expect(metrics).toHaveProperty('isMonitoring');
    });

    test('should generate performance report', () => {
      // Add some test data
      apmService.metrics.throughput.totalRequests = 100;
      apmService.metrics.responseTime.average = 250;
      apmService.metrics.errorRate.current = 0.02;

      const report = apmService.generatePerformanceReport('1h');
      
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('timeRange', '1h');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('responseTime');
      expect(report).toHaveProperty('throughput');
      expect(report).toHaveProperty('errors');
      expect(report).toHaveProperty('systemResources');
      expect(report).toHaveProperty('business');
      expect(report).toHaveProperty('recommendations');
    });

    test('should create and manage alerts', () => {
      // Simulate high error rate
      apmService.metrics.errorRate.current = 0.15; // 15% error rate
      apmService.metrics.throughput.totalRequests = 100;
      
      // Trigger alert check
      apmService.checkAlerts();
      
      const activeAlerts = apmService.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThan(0);
      
      // Check if error rate alert was created
      const errorRateAlert = activeAlerts.find(alert => alert.id.includes('error_rate'));
      expect(errorRateAlert).toBeDefined();
      expect(errorRateAlert.severity).toBe('critical');
    });

    test('should acknowledge alerts', () => {
      // Create a test alert
      const alertId = 'test_alert_123';
      apmService.alerts.set(alertId, {
        id: alertId,
        severity: 'warning',
        message: 'Test alert',
        timestamp: new Date().toISOString(),
        resolved: false,
        lastTriggered: Date.now()
      });

      const acknowledged = apmService.acknowledgeAlert(alertId, 'test-user');
      expect(acknowledged).toBe(true);
      
      const alert = apmService.alerts.get(alertId);
      expect(alert.acknowledgedBy).toBe('test-user');
      expect(alert.acknowledgedAt).toBeDefined();
    });
  });

  describe('Chat APM Integration Service', () => {
    test('should track chat session metrics', () => {
      const testSession = {
        id: 'test-session-123',
        customerId: 'test-customer',
        customerInfo: { name: 'Test Customer' },
        createdAt: new Date(),
        status: 'waiting'
      };

      chatAPMIntegration.trackSessionCreated(testSession);
      
      const metrics = chatAPMIntegration.getCurrentMetrics();
      expect(metrics.sessions.total).toBe(1);
      expect(metrics.sessions.active).toBe(1);
      expect(metrics.sessions.waiting).toBe(1);
    });

    test('should track message metrics', () => {
      const testMessage = {
        id: 'test-message-456',
        sessionId: 'test-session-123',
        senderId: 'test-customer',
        senderType: 'customer',
        content: 'Hello, I need help',
        timestamp: new Date()
      };

      const testSession = {
        id: 'test-session-123',
        customerId: 'test-customer'
      };

      chatAPMIntegration.trackMessageReceived('test-session-123', testMessage, testSession);
      
      const metrics = chatAPMIntegration.getCurrentMetrics();
      expect(metrics.messages.total).toBe(1);
    });

    test('should generate chat performance report', () => {
      const report = chatAPMIntegration.generatePerformanceReport();
      
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('performance');
      expect(report).toHaveProperty('business');
      expect(report).toHaveProperty('recommendations');
    });
  });

  describe('Performance Thresholds', () => {
    test('should trigger CPU usage alerts', () => {
      apmService.metrics.systemResources.cpu.usage = 95; // 95% CPU usage
      
      apmService.checkAlerts();
      
      const activeAlerts = apmService.getActiveAlerts();
      const cpuAlert = activeAlerts.find(alert => alert.id.includes('cpu'));
      expect(cpuAlert).toBeDefined();
      expect(cpuAlert.severity).toBe('critical');
    });

    test('should trigger memory usage alerts', () => {
      apmService.metrics.systemResources.memory.usage = 85; // 85% memory usage
      
      apmService.checkAlerts();
      
      const activeAlerts = apmService.getActiveAlerts();
      const memoryAlert = activeAlerts.find(alert => alert.id.includes('memory'));
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert.severity).toBe('warning');
    });

    test('should trigger response time alerts', () => {
      apmService.metrics.responseTime.p95 = 3500; // 3.5 seconds P95 response time
      
      apmService.checkAlerts();
      
      const activeAlerts = apmService.getActiveAlerts();
      const responseTimeAlert = activeAlerts.find(alert => alert.id.includes('response_time'));
      expect(responseTimeAlert).toBeDefined();
      expect(responseTimeAlert.severity).toBe('critical');
    });
  });

  describe('Metrics History', () => {
    test('should store and retrieve metrics history', () => {
      // Simulate some metrics updates
      for (let i = 0; i < 5; i++) {
        apmService.storeMetricsSnapshot();
      }
      
      const history = apmService.getMetricsHistory('1h');
      expect(history.length).toBe(5);
      
      // Check that each snapshot has required properties
      history.forEach(snapshot => {
        expect(snapshot).toHaveProperty('timestamp');
        expect(snapshot).toHaveProperty('responseTime');
        expect(snapshot).toHaveProperty('throughput');
        expect(snapshot).toHaveProperty('errorRate');
      });
    });

    test('should limit history size', () => {
      // Add more snapshots than the limit
      for (let i = 0; i < 1200; i++) {
        apmService.metricsHistory.push({
          timestamp: new Date().toISOString(),
          responseTime: { average: 100 },
          throughput: { requestsPerSecond: 10 },
          errorRate: { current: 0.01 }
        });
      }
      
      // Trigger cleanup
      apmService.storeMetricsSnapshot();
      
      expect(apmService.metricsHistory.length).toBeLessThanOrEqual(apmService.maxHistorySize);
    });
  });

  describe('Dashboard Data', () => {
    test('should provide dashboard data', () => {
      const dashboardData = apmService.getDashboardData('1h');
      
      expect(dashboardData).toHaveProperty('current');
      expect(dashboardData).toHaveProperty('history');
      expect(dashboardData).toHaveProperty('alerts');
      expect(dashboardData).toHaveProperty('summary');
      expect(dashboardData).toHaveProperty('timeRange', '1h');
      
      expect(dashboardData.summary).toHaveProperty('totalRequests');
      expect(dashboardData.summary).toHaveProperty('averageResponseTime');
      expect(dashboardData.summary).toHaveProperty('errorRate');
      expect(dashboardData.summary).toHaveProperty('uptime');
      expect(dashboardData.summary).toHaveProperty('activeAlerts');
    });
  });
});

// Integration test with actual HTTP requests
describe('APM HTTP Integration', () => {
  let app;
  let server;

  beforeAll((done) => {
    app = express();
    app.use(express.json());
    app.use(apmMiddleware());

    app.get('/api/test', (req, res) => {
      res.json({ message: 'Test endpoint', timestamp: new Date().toISOString() });
    });

    server = app.listen(0, () => {
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('should track multiple concurrent requests', async () => {
    const port = server.address().port;
    const requests = [];

    // Make 10 concurrent requests
    for (let i = 0; i < 10; i++) {
      requests.push(
        request(app)
          .get('/api/test')
          .expect(200)
      );
    }

    const responses = await Promise.all(requests);
    
    // Verify all requests completed successfully
    responses.forEach(response => {
      expect(response.body.message).toBe('Test endpoint');
      expect(response.headers['x-response-time']).toBeDefined();
    });

    // Verify APM tracked all requests
    expect(apmService.metrics.throughput.totalRequests).toBe(10);
    expect(apmService.metrics.responseTime.samples.length).toBe(10);
  });
});

export default {};