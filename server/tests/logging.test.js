import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import logger, { Logger, generateCorrelationId } from '../services/logger.js';
import { requestResponseLogger, errorLogger } from '../middleware/logging.js';
import logAggregationService from '../services/logAggregation.js';

// Mock file system for testing
jest.mock('fs');

describe('Logging System', () => {
  let app;
  let testLogger;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    testLogger = new Logger('test-service');
    
    // Clear any existing mocks
    jest.clearAllMocks();
  });

  describe('Logger Service', () => {
    test('should create structured log entries', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      testLogger.info('Test message', { userId: '123', action: 'test' });
      
      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('Test message');
      expect(logCall).toContain('test-service');
      
      consoleSpy.mockRestore();
    });

    test('should generate correlation IDs', () => {
      const correlationId = generateCorrelationId();
      
      expect(correlationId).toMatch(/^log_\d+_[a-z0-9]+$/);
      expect(correlationId.length).toBeGreaterThan(10);
    });

    test('should support different log levels', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      testLogger.error('Error message');
      testLogger.warn('Warning message');
      testLogger.info('Info message');
      testLogger.debug('Debug message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(4);
      consoleSpy.mockRestore();
    });

    test('should create child loggers with context', () => {
      const childLogger = testLogger.child({ requestId: 'req-123' });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      childLogger.info('Child logger test');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should log security events', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      testLogger.security('Suspicious activity detected', {
        ip: '192.168.1.1',
        severity: 'high'
      });
      
      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('Suspicious activity detected');
      
      consoleSpy.mockRestore();
    });

    test('should log performance metrics', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      testLogger.performance('Slow request detected', {
        duration: 2500,
        threshold: 1000
      });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should log business metrics', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      testLogger.business('New business discovered', {
        businessId: 'biz-123',
        region: 'New York'
      });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should log audit events', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      testLogger.audit('User login', {
        userId: 'user-123',
        action: 'login',
        compliance: true
      });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Request/Response Logging Middleware', () => {
    beforeEach(() => {
      app.use(requestResponseLogger({
        logLevel: 'info',
        includeBody: true,
        excludePaths: ['/health']
      }));
      
      app.get('/test', (req, res) => {
        res.json({ message: 'Test response' });
      });
      
      app.get('/health', (req, res) => {
        res.json({ status: 'healthy' });
      });
      
      app.get('/error', (req, res) => {
        res.status(500).json({ error: 'Test error' });
      });
      
      app.get('/slow', (req, res) => {
        setTimeout(() => {
          res.json({ message: 'Slow response' });
        }, 1100); // Exceeds slow threshold
      });
    });

    test('should log successful requests', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await request(app)
        .get('/test')
        .expect(200);
      
      expect(consoleSpy).toHaveBeenCalled();
      
      // Check for request start and completion logs
      const logCalls = consoleSpy.mock.calls.map(call => call[0]);
      const hasRequestLog = logCalls.some(log => log.includes('GET /test'));
      expect(hasRequestLog).toBe(true);
      
      consoleSpy.mockRestore();
    });

    test('should exclude health check paths', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await request(app)
        .get('/health')
        .expect(200);
      
      // Should not log health check requests
      const logCalls = consoleSpy.mock.calls.map(call => call[0]);
      const hasHealthLog = logCalls.some(log => log.includes('GET /health'));
      expect(hasHealthLog).toBe(false);
      
      consoleSpy.mockRestore();
    });

    test('should log error responses with appropriate level', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await request(app)
        .get('/error')
        .expect(500);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should add correlation ID to responses', async () => {
      const response = await request(app)
        .get('/test')
        .expect(200);
      
      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-request-id']).toBeDefined();
    });

    test('should detect slow requests', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await request(app)
        .get('/slow')
        .expect(200);
      
      // Should log slow request warning
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    }, 10000); // Increase timeout for slow request test
  });

  describe('Error Logging Middleware', () => {
    beforeEach(() => {
      app.use(requestResponseLogger());
      
      app.get('/throw-error', (req, res, next) => {
        const error = new Error('Test error');
        error.statusCode = 400;
        next(error);
      });
      
      app.get('/server-error', (req, res, next) => {
        const error = new Error('Server error');
        next(error);
      });
      
      app.use(errorLogger);
      app.use((err, req, res, next) => {
        res.status(err.statusCode || 500).json({ error: err.message });
      });
    });

    test('should log client errors as warnings', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await request(app)
        .get('/throw-error')
        .expect(400);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should log server errors', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await request(app)
        .get('/server-error')
        .expect(500);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Log Aggregation Service', () => {
    beforeEach(() => {
      // Mock file system operations
      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});
      fs.readFileSync.mockReturnValue('[]');
    });

    test('should initialize with default patterns', () => {
      expect(logAggregationService.patterns).toBeDefined();
      expect(logAggregationService.patterns.security).toBeInstanceOf(Array);
      expect(logAggregationService.patterns.performance).toBeInstanceOf(Array);
      expect(logAggregationService.patterns.errors).toBeInstanceOf(Array);
      expect(logAggregationService.patterns.business).toBeInstanceOf(Array);
    });

    test('should get current metrics', () => {
      const metrics = logAggregationService.getMetrics();
      
      expect(metrics).toHaveProperty('totalLogs');
      expect(metrics).toHaveProperty('errorCount');
      expect(metrics).toHaveProperty('securityEvents');
      expect(metrics).toHaveProperty('activeAlerts');
    });

    test('should parse time ranges correctly', () => {
      const service = logAggregationService;
      
      expect(service.parseTimeRange('1h')).toBe(60 * 60 * 1000);
      expect(service.parseTimeRange('30m')).toBe(30 * 60 * 1000);
      expect(service.parseTimeRange('1d')).toBe(24 * 60 * 60 * 1000);
      expect(service.parseTimeRange('invalid')).toBe(60 * 60 * 1000); // Default
    });

    test('should determine severity levels', () => {
      const service = logAggregationService;
      
      const errorLog = { level: 'ERROR', message: 'test error' };
      const warnLog = { level: 'WARN', message: 'test warning' };
      const infoLog = { level: 'INFO', message: 'test info' };
      
      expect(service.determineSeverity(errorLog, 'error')).toBe('high');
      expect(service.determineSeverity(warnLog, 'performance')).toBe('medium');
      expect(service.determineSeverity(infoLog, 'business')).toBe('low');
    });

    test('should generate recommendations', () => {
      const mockReport = {
        summary: {
          totalLogs: 1000,
          errors: 100, // 10% error rate
          securityEvents: 15,
          performanceIssues: 25
        }
      };
      
      const recommendations = logAggregationService.generateRecommendations(mockReport);
      
      expect(recommendations).toBeInstanceOf(Array);
      expect(recommendations.length).toBeGreaterThan(0);
      
      // Should have high error rate recommendation
      const errorRateRec = recommendations.find(r => r.type === 'error_rate');
      expect(errorRateRec).toBeDefined();
      expect(errorRateRec.priority).toBe('high');
    });
  });

  describe('Integration Tests', () => {
    test('should maintain correlation IDs across middleware', async () => {
      const correlationIds = [];
      
      app.use(requestResponseLogger());
      app.use((req, res, next) => {
        correlationIds.push(req.correlationId);
        next();
      });
      app.get('/correlation-test', (req, res) => {
        correlationIds.push(req.correlationId);
        res.json({ correlationId: req.correlationId });
      });
      
      const response = await request(app)
        .get('/correlation-test')
        .expect(200);
      
      // All correlation IDs should be the same
      expect(correlationIds.length).toBe(2);
      expect(correlationIds[0]).toBe(correlationIds[1]);
      expect(response.body.correlationId).toBe(correlationIds[0]);
    });

    test('should handle concurrent requests with different correlation IDs', async () => {
      const correlationIds = new Set();
      
      app.use(requestResponseLogger());
      app.get('/concurrent-test', (req, res) => {
        correlationIds.add(req.correlationId);
        setTimeout(() => {
          res.json({ correlationId: req.correlationId });
        }, Math.random() * 100);
      });
      
      // Make multiple concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        request(app).get('/concurrent-test').expect(200)
      );
      
      const responses = await Promise.all(promises);
      
      // Each request should have a unique correlation ID
      expect(correlationIds.size).toBe(5);
      responses.forEach(response => {
        expect(correlationIds.has(response.body.correlationId)).toBe(true);
      });
    });
  });
});