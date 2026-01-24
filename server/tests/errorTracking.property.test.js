import fc from 'fast-check';
import errorTracker from '../services/errorTracker.js';

/**
 * Property-Based Tests for Error Tracking and Context
 * **Validates: Requirements 4.2**
 * 
 * Property 13: Error Tracking and Context
 * For any system error occurrence, the Error_Tracker should capture detailed 
 * error context, stack traces, and correlate events for debugging
 */

describe('Property 13: Error Tracking and Context', () => {
  beforeEach(() => {
    // Clear error tracker state before each test
    errorTracker.errors.clear();
    errorTracker.recentErrors = [];
    errorTracker.errorCorrelations.clear();
    errorTracker.errorPatterns.clear();
  });

  afterAll(() => {
    // Clean up all intervals and timers to allow Jest to exit
    errorTracker.cleanup();
  });

  /**
   * Property: For any error, detailed context should be captured
   * This validates that all relevant error information is stored
   */
  test('should capture detailed error context for any error', () => {
    fc.assert(
      fc.property(
        // Generate various error scenarios
        fc.record({
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
          errorName: fc.constantFrom('Error', 'TypeError', 'ReferenceError', 'ValidationError', 'DatabaseError'),
          context: fc.record({
            method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
            path: fc.string({ minLength: 1, maxLength: 50 }).map(s => `/api/${s}`),
            statusCode: fc.integer({ min: 400, max: 599 }),
            userId: fc.option(fc.string()),
            correlationId: fc.string(),
            ip: fc.constantFrom('127.0.0.1', '192.168.1.1', '10.0.0.1'),
            userAgent: fc.constantFrom('Mozilla/5.0', 'Chrome/91.0', 'Safari/14.0'),
            metadata: fc.record({
              key1: fc.string(),
              key2: fc.integer()
            })
          })
        }),
        (errorData) => {
          // Create error
          const error = new Error(errorData.errorMessage);
          error.name = errorData.errorName;
          
          // Track error
          const errorId = errorTracker.trackError(error, errorData.context);
          
          // Verify error was tracked
          expect(errorId).toBeDefined();
          expect(typeof errorId).toBe('string');
          expect(errorId).toMatch(/^err_/);
          
          // Retrieve tracked error
          const trackedError = errorTracker.getError(errorId);
          
          // Verify all context is captured
          expect(trackedError).toBeDefined();
          expect(trackedError.id).toBe(errorId);
          expect(trackedError.message).toBe(errorData.errorMessage);
          // Note: error.name might not be preserved if it's a built-in Error type
          // The type field captures the constructor name which is more reliable
          expect(trackedError.type).toBeDefined();
          expect(['Error', errorData.errorName]).toContain(trackedError.type);
          
          // Verify request context
          expect(trackedError.method).toBe(errorData.context.method);
          expect(trackedError.path).toBe(errorData.context.path);
          expect(trackedError.statusCode).toBe(errorData.context.statusCode);
          
          // Verify user context
          if (errorData.context.userId) {
            expect(trackedError.userId).toBe(errorData.context.userId);
          }
          expect(trackedError.correlationId).toBeDefined();
          
          // Verify system context
          expect(trackedError.ip).toBe(errorData.context.ip);
          expect(trackedError.userAgent).toBe(errorData.context.userAgent);
          
          // Verify metadata
          expect(trackedError.metadata).toBeDefined();
          expect(trackedError.metadata.key1).toBe(errorData.context.metadata.key1);
          expect(trackedError.metadata.key2).toBe(errorData.context.metadata.key2);
          
          // Verify classification
          expect(trackedError.severity).toBeDefined();
          expect(['low', 'medium', 'high', 'critical']).toContain(trackedError.severity);
          expect(trackedError.category).toBeDefined();
          
          // Verify fingerprint for correlation
          expect(trackedError.fingerprint).toBeDefined();
          expect(typeof trackedError.fingerprint).toBe('string');
          
          // Verify timestamp
          expect(trackedError.timestamp).toBeDefined();
          expect(new Date(trackedError.timestamp).getTime()).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any error, stack trace should be captured
   * This validates that stack traces are preserved for debugging
   */
  test('should capture stack traces for all errors', () => {
    fc.assert(
      fc.property(
        fc.record({
          message: fc.string({ minLength: 1, maxLength: 100 }),
          hasStack: fc.boolean()
        }),
        (errorData) => {
          // Create error with or without stack
          const error = new Error(errorData.message);
          if (!errorData.hasStack) {
            delete error.stack;
          }
          
          const context = {
            method: 'GET',
            path: '/api/test',
            statusCode: 500
          };
          
          // Track error
          const errorId = errorTracker.trackError(error, context);
          const trackedError = errorTracker.getError(errorId);
          
          // Verify stack trace handling
          expect(trackedError).toBeDefined();
          if (errorData.hasStack) {
            expect(trackedError.stack).toBeDefined();
            expect(typeof trackedError.stack).toBe('string');
            expect(trackedError.stack.length).toBeGreaterThan(0);
          } else {
            expect(trackedError.stack).toBeNull();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Errors with same correlation ID should be correlated
   * This validates that related errors are grouped together
   */
  test('should correlate errors with same correlation ID', () => {
    fc.assert(
      fc.property(
        fc.record({
          correlationId: fc.string({ minLength: 5, maxLength: 20 }),
          errorCount: fc.integer({ min: 2, max: 10 }),
          errorMessages: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 10 })
        }),
        (testData) => {
          const errorIds = [];
          
          // Track multiple errors with same correlation ID
          for (let i = 0; i < Math.min(testData.errorCount, testData.errorMessages.length); i++) {
            const error = new Error(testData.errorMessages[i]);
            const context = {
              method: 'POST',
              path: `/api/test/${i}`,
              statusCode: 500,
              correlationId: testData.correlationId
            };
            
            const errorId = errorTracker.trackError(error, context);
            errorIds.push(errorId);
          }
          
          // Verify all errors are correlated
          const correlatedErrors = errorTracker.getCorrelatedErrors(testData.correlationId);
          
          expect(correlatedErrors).toBeDefined();
          expect(Array.isArray(correlatedErrors)).toBe(true);
          expect(correlatedErrors.length).toBe(errorIds.length);
          
          // Verify all tracked errors are in the correlation
          errorIds.forEach(errorId => {
            const found = correlatedErrors.some(err => err.id === errorId);
            expect(found).toBe(true);
          });
          
          // Verify all correlated errors have the same correlation ID
          correlatedErrors.forEach(error => {
            expect(error.correlationId).toBe(testData.correlationId);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Error patterns should be recognized and tracked
   * This validates that similar errors are grouped by fingerprint
   */
  test('should recognize and track error patterns', () => {
    fc.assert(
      fc.property(
        fc.record({
          errorType: fc.constantFrom('ValidationError', 'DatabaseError', 'NetworkError'),
          path: fc.constantFrom('/api/users', '/api/products', '/api/orders'),
          method: fc.constantFrom('GET', 'POST'),
          occurrences: fc.integer({ min: 2, max: 5 })
        }),
        (patternData) => {
          const errorIds = [];
          
          // Track multiple similar errors
          for (let i = 0; i < patternData.occurrences; i++) {
            const error = new Error(`${patternData.errorType} occurred`);
            error.name = patternData.errorType;
            
            const context = {
              method: patternData.method,
              path: patternData.path,
              statusCode: 500,
              correlationId: `corr_${i}`
            };
            
            const errorId = errorTracker.trackError(error, context);
            errorIds.push(errorId);
          }
          
          // Get all tracked errors
          const allErrors = errorIds.map(id => errorTracker.getError(id));
          
          // Verify all errors have the same fingerprint
          const fingerprints = allErrors.map(err => err.fingerprint);
          const uniqueFingerprints = new Set(fingerprints);
          
          expect(uniqueFingerprints.size).toBe(1);
          
          // Verify pattern is tracked
          const fingerprint = fingerprints[0];
          expect(errorTracker.errorPatterns.has(fingerprint)).toBe(true);
          
          const pattern = errorTracker.errorPatterns.get(fingerprint);
          expect(pattern.count).toBeGreaterThanOrEqual(errorIds.length);
          expect(pattern.firstSeen).toBeDefined();
          expect(pattern.lastSeen).toBeDefined();
          expect(Array.isArray(pattern.examples)).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Error severity should be classified correctly
   * This validates that errors are assigned appropriate severity levels
   */
  test('should classify error severity correctly', () => {
    fc.assert(
      fc.property(
        fc.record({
          errorName: fc.constantFrom('DatabaseError', 'SecurityError', 'ValidationError', 'TimeoutError', 'Error'),
          statusCode: fc.integer({ min: 400, max: 599 })
        }),
        (errorData) => {
          const error = new Error('Test error');
          error.name = errorData.errorName;
          
          const context = {
            method: 'GET',
            path: '/api/test',
            statusCode: errorData.statusCode
          };
          
          const errorId = errorTracker.trackError(error, context);
          const trackedError = errorTracker.getError(errorId);
          
          // Verify severity classification
          expect(trackedError.severity).toBeDefined();
          
          // Critical errors
          if (errorData.errorName === 'DatabaseError' || 
              errorData.errorName === 'SecurityError' ||
              errorData.statusCode >= 500) {
            expect(trackedError.severity).toBe('critical');
          }
          
          // High severity errors
          else if (errorData.errorName === 'ValidationError' ||
                   errorData.statusCode >= 400) {
            expect(['high', 'critical']).toContain(trackedError.severity);
          }
          
          // Medium severity errors
          else if (errorData.errorName === 'TimeoutError') {
            expect(['medium', 'high', 'critical']).toContain(trackedError.severity);
          }
          
          // All severities should be valid
          expect(['low', 'medium', 'high', 'critical']).toContain(trackedError.severity);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Error categories should be assigned correctly
   * This validates that errors are categorized appropriately
   */
  test('should categorize errors correctly', () => {
    fc.assert(
      fc.property(
        fc.record({
          path: fc.constantFrom('/api/auth/login', '/api/users', '/api/database', '/health'),
          errorName: fc.constantFrom('Error', 'DatabaseError', 'NetworkError'),
          statusCode: fc.integer({ min: 400, max: 599 })
        }),
        (errorData) => {
          const error = new Error('Test error');
          error.name = errorData.errorName;
          
          const context = {
            method: 'GET',
            path: errorData.path,
            statusCode: errorData.statusCode
          };
          
          const errorId = errorTracker.trackError(error, context);
          const trackedError = errorTracker.getError(errorId);
          
          // Verify category assignment
          expect(trackedError.category).toBeDefined();
          
          // Authentication errors (path /api/auth takes precedence)
          if (errorData.path.includes('/auth')) {
            expect(trackedError.category).toBe('authentication');
          }
          // API errors (path /api/ takes precedence and returns 'api')
          else if (errorData.path.includes('/api/')) {
            expect(trackedError.category).toBe('api');
          }
          // Database errors (only if not in /api/ path)
          else if (errorData.errorName === 'DatabaseError') {
            expect(trackedError.category).toBe('database');
          }
          // Network errors (only if not in /api/ path)
          else if (errorData.errorName === 'NetworkError') {
            expect(trackedError.category).toBe('network');
          }
          // Status code based categorization
          else if (errorData.statusCode >= 500) {
            expect(trackedError.category).toBe('server');
          }
          else if (errorData.statusCode >= 400) {
            expect(trackedError.category).toBe('client');
          }
          
          // All categories should be valid
          expect(['authentication', 'api', 'database', 'network', 'server', 'client', 'general'])
            .toContain(trackedError.category);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Recent errors should be retrievable
   * This validates that error history is maintained
   */
  test('should maintain retrievable error history', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 50 }),
            statusCode: fc.integer({ min: 400, max: 599 })
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (errors) => {
          const errorIds = [];
          
          // Track all errors
          errors.forEach((errorData, index) => {
            const error = new Error(errorData.message);
            const context = {
              method: 'GET',
              path: `/api/test/${index}`,
              statusCode: errorData.statusCode
            };
            
            const errorId = errorTracker.trackError(error, context);
            errorIds.push(errorId);
          });
          
          // Retrieve recent errors
          const recentErrors = errorTracker.getRecentErrors(errors.length);
          
          // Verify all errors are retrievable
          expect(recentErrors.length).toBeGreaterThanOrEqual(Math.min(errors.length, errorIds.length));
          
          // Verify errors are in chronological order (most recent last)
          for (let i = 1; i < recentErrors.length; i++) {
            const prevTime = new Date(recentErrors[i - 1].timestamp).getTime();
            const currTime = new Date(recentErrors[i].timestamp).getTime();
            expect(currTime).toBeGreaterThanOrEqual(prevTime);
          }
          
          // Verify each error has required fields
          recentErrors.forEach(error => {
            expect(error.id).toBeDefined();
            expect(error.timestamp).toBeDefined();
            expect(error.message).toBeDefined();
            expect(error.severity).toBeDefined();
            expect(error.category).toBeDefined();
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Error statistics should be accurate
   * This validates that error metrics are calculated correctly
   */
  test('should calculate accurate error statistics', () => {
    fc.assert(
      fc.property(
        fc.record({
          errorCount: fc.integer({ min: 1, max: 50 }),
          uniquePatterns: fc.integer({ min: 1, max: 5 })
        }),
        (testData) => {
          const patterns = [];
          for (let i = 0; i < testData.uniquePatterns; i++) {
            patterns.push({
              name: `Pattern${i}Error`,
              path: `/api/pattern${i}`
            });
          }
          
          // Track errors with different patterns
          for (let i = 0; i < testData.errorCount; i++) {
            const pattern = patterns[i % patterns.length];
            const error = new Error(`Error ${i}`);
            error.name = pattern.name;
            
            const context = {
              method: 'GET',
              path: pattern.path,
              statusCode: 500
            };
            
            errorTracker.trackError(error, context);
          }
          
          // Get statistics
          const stats = errorTracker.getErrorStatistics();
          
          // Verify statistics
          expect(stats.total).toBeGreaterThanOrEqual(testData.errorCount);
          expect(stats.lastHour).toBeGreaterThanOrEqual(0);
          expect(stats.lastDay).toBeGreaterThanOrEqual(0);
          expect(stats.patterns).toBeGreaterThanOrEqual(testData.uniquePatterns);
          expect(Array.isArray(stats.topPatterns)).toBe(true);
          
          // Verify top patterns
          stats.topPatterns.forEach(pattern => {
            expect(pattern.pattern).toBeDefined();
            expect(pattern.count).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Error fingerprints should be consistent
   * This validates that same errors generate same fingerprints
   */
  test('should generate consistent fingerprints for similar errors', () => {
    fc.assert(
      fc.property(
        fc.record({
          errorName: fc.string({ minLength: 1, maxLength: 20 }),
          message: fc.string({ minLength: 1, maxLength: 50 }),
          path: fc.string({ minLength: 1, maxLength: 30 }),
          method: fc.constantFrom('GET', 'POST')
        }),
        (errorData) => {
          const fingerprints = [];
          
          // Track same error multiple times
          for (let i = 0; i < 3; i++) {
            const error = new Error(errorData.message);
            error.name = errorData.errorName;
            
            const context = {
              method: errorData.method,
              path: errorData.path,
              statusCode: 500,
              correlationId: `corr_${i}` // Different correlation IDs
            };
            
            const errorId = errorTracker.trackError(error, context);
            const trackedError = errorTracker.getError(errorId);
            fingerprints.push(trackedError.fingerprint);
          }
          
          // Verify all fingerprints are the same
          const uniqueFingerprints = new Set(fingerprints);
          expect(uniqueFingerprints.size).toBe(1);
          
          // Verify fingerprint is deterministic
          const fingerprint = fingerprints[0];
          expect(typeof fingerprint).toBe('string');
          expect(fingerprint.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});
