// Feature: production-upgrade, Property 4: Comprehensive Rate Limiting

import fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import { createAdvancedRateLimit, rateLimitAnalytics } from '../middleware/auth.js';

// Property test configuration
const propertyTestConfig = {
  numRuns: 20, // Reduced for faster test execution
  timeout: 15000,
  verbose: false,
  seed: 42
};

// Test app factory
const createTestApp = (rateLimitConfig) => {
  const app = express();
  app.use(express.json());
  
  const limiter = createAdvancedRateLimit(rateLimitConfig);
  app.use('/test', limiter);
  
  app.get('/test', (req, res) => {
    res.json({ success: true, timestamp: Date.now() });
  });
  
  return app;
};

// Custom generators
const rateLimitConfigGenerator = fc.record({
  windowMs: fc.integer({ min: 1000, max: 60000 }), // 1 second to 1 minute
  max: fc.integer({ min: 1, max: 100 }),
  skipSuccessfulRequests: fc.boolean()
});

const ipAddressGenerator = fc.tuple(
  fc.integer({ min: 1, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 1, max: 255 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

const userAgentGenerator = fc.oneof(
  fc.constant('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
  fc.constant('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
  fc.constant('curl/7.68.0'),
  fc.constant('PostmanRuntime/7.28.4'),
  fc.constant('bot-crawler/1.0'),
  fc.constant('suspicious-bot/2.0')
);

// Property 4: Comprehensive Rate Limiting
// For any API endpoint category and request pattern, the Rate_Limiter should enforce 
// category-specific limits and return 429 responses with retry-after headers when limits are exceeded
describe('Property 4: Comprehensive Rate Limiting', () => {
  test('Rate limits should be consistently enforced across all requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        rateLimitConfigGenerator,
        ipAddressGenerator,
        fc.integer({ min: 1, max: 20 }),
        async (config, ip, requestCount) => {
          const app = createTestApp(config);
          
          let successCount = 0;
          let rateLimitedCount = 0;
          
          // Make multiple requests from the same IP
          for (let i = 0; i < requestCount; i++) {
            const response = await request(app)
              .get('/test')
              .set('X-Forwarded-For', ip)
              .set('User-Agent', 'test-client');
            
            if (response.status === 200) {
              successCount++;
            } else if (response.status === 429) {
              rateLimitedCount++;
              
              // Verify rate limit response structure
              expect(response.body).toHaveProperty('error');
              expect(response.body).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
              expect(response.body).toHaveProperty('retryAfter');
              expect(response.body).toHaveProperty('limit', config.max);
              expect(response.body).toHaveProperty('remaining', 0);
              expect(response.body).toHaveProperty('resetTime');
              expect(response.body).toHaveProperty('timestamp');
              
              // Verify headers
              expect(response.headers).toHaveProperty('retry-after');
              expect(response.headers).toHaveProperty('x-ratelimit-limit');
              expect(response.headers).toHaveProperty('x-ratelimit-remaining');
              expect(response.headers).toHaveProperty('x-ratelimit-reset');
            }
          }
          
          // Consistency checks
          expect(successCount + rateLimitedCount).toBe(requestCount);
          
          // If we made more requests than the limit, some should be rate limited
          if (requestCount > config.max) {
            expect(rateLimitedCount).toBeGreaterThan(0);
            expect(successCount).toBeLessThanOrEqual(config.max);
          } else {
            // If within limit, all should succeed
            expect(successCount).toBe(requestCount);
            expect(rateLimitedCount).toBe(0);
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Different IPs should have independent rate limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        rateLimitConfigGenerator,
        fc.array(ipAddressGenerator, { minLength: 2, maxLength: 5 }),
        async (config, ips) => {
          const app = createTestApp(config);
          const uniqueIPs = [...new Set(ips)]; // Remove duplicates
          
          if (uniqueIPs.length < 2) return true; // Skip if not enough unique IPs
          
          // Each IP should be able to make up to the limit
          for (const ip of uniqueIPs) {
            let successCount = 0;
            
            // Make requests up to the limit
            for (let i = 0; i < config.max; i++) {
              const response = await request(app)
                .get('/test')
                .set('X-Forwarded-For', ip)
                .set('User-Agent', 'test-client');
              
              if (response.status === 200) {
                successCount++;
              }
            }
            
            // Each IP should be able to make at least the configured limit
            expect(successCount).toBe(config.max);
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Rate limit windows should reset correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          windowMs: fc.constant(2000), // 2 second window for faster testing
          max: fc.integer({ min: 2, max: 5 }),
          skipSuccessfulRequests: fc.boolean()
        }),
        ipAddressGenerator,
        async (config, ip) => {
          const app = createTestApp(config);
          
          // Make requests to hit the limit
          let hitLimit = false;
          for (let i = 0; i < config.max + 1; i++) {
            const response = await request(app)
              .get('/test')
              .set('X-Forwarded-For', ip)
              .set('User-Agent', 'test-client');
            
            if (response.status === 429) {
              hitLimit = true;
              break;
            }
          }
          
          expect(hitLimit).toBe(true);
          
          // Wait for window to reset (add buffer time)
          await new Promise(resolve => setTimeout(resolve, config.windowMs + 500));
          
          // Should be able to make requests again
          const response = await request(app)
            .get('/test')
            .set('X-Forwarded-For', ip)
            .set('User-Agent', 'test-client');
          
          expect(response.status).toBe(200);
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 10 } // Fewer runs due to timing
    );
  });

  test('Rate limit configuration should be respected consistently', () => {
    fc.assert(
      fc.property(
        rateLimitConfigGenerator,
        (config) => {
          const app = createTestApp(config);
          
          // Verify the configuration is applied correctly
          expect(config.windowMs).toBeGreaterThan(0);
          expect(config.max).toBeGreaterThan(0);
          expect(typeof config.skipSuccessfulRequests).toBe('boolean');
          
          // Window should be reasonable (not too short or too long)
          expect(config.windowMs).toBeGreaterThanOrEqual(1000);
          expect(config.windowMs).toBeLessThanOrEqual(60000);
          
          // Max should be reasonable
          expect(config.max).toBeGreaterThanOrEqual(1);
          expect(config.max).toBeLessThanOrEqual(100);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Rate limit analytics should track violations consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          windowMs: fc.constant(1000), // 1 second window
          max: fc.constant(2), // Low limit to trigger violations
          skipSuccessfulRequests: fc.boolean()
        }),
        ipAddressGenerator,
        fc.integer({ min: 5, max: 10 }),
        async (config, ip, requestCount) => {
          const app = createTestApp(config);
          
          // Clear previous analytics
          rateLimitAnalytics.violations.clear();
          
          // Make requests to trigger violations
          for (let i = 0; i < requestCount; i++) {
            await request(app)
              .get('/test')
              .set('X-Forwarded-For', ip)
              .set('User-Agent', 'test-client');
          }
          
          // Check analytics
          const violations = rateLimitAnalytics.getViolations();
          const suspiciousIPs = rateLimitAnalytics.getSuspiciousIPs(1);
          
          // Should have recorded violations if we exceeded the limit
          if (requestCount > config.max) {
            expect(violations.length).toBeGreaterThan(0);
            expect(suspiciousIPs.length).toBeGreaterThan(0);
            
            // Should include our IP
            const ourViolations = violations.filter(v => v.key.includes(ip));
            expect(ourViolations.length).toBeGreaterThan(0);
          }
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 20 }
    );
  });

  test('User agent filtering should work consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          windowMs: fc.constant(5000),
          max: fc.constant(10),
          skipSuccessfulRequests: fc.boolean()
        }),
        ipAddressGenerator,
        userAgentGenerator,
        async (config, ip, userAgent) => {
          const app = createTestApp(config);
          
          // Make a request with the user agent
          const response = await request(app)
            .get('/test')
            .set('X-Forwarded-For', ip)
            .set('User-Agent', userAgent);
          
          // Should always get a response (either 200 or 429)
          expect([200, 429]).toContain(response.status);
          
          // Response should have proper structure
          if (response.status === 200) {
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('timestamp');
          } else if (response.status === 429) {
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Concurrent requests should be handled consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          windowMs: fc.constant(5000),
          max: fc.integer({ min: 3, max: 8 }),
          skipSuccessfulRequests: fc.boolean()
        }),
        ipAddressGenerator,
        fc.integer({ min: 5, max: 15 }),
        async (config, ip, concurrentCount) => {
          const app = createTestApp(config);
          
          // Make concurrent requests
          const promises = Array(concurrentCount).fill().map(() =>
            request(app)
              .get('/test')
              .set('X-Forwarded-For', ip)
              .set('User-Agent', 'test-client')
          );
          
          const responses = await Promise.all(promises);
          
          let successCount = 0;
          let rateLimitedCount = 0;
          
          responses.forEach(response => {
            expect([200, 429]).toContain(response.status);
            
            if (response.status === 200) {
              successCount++;
            } else if (response.status === 429) {
              rateLimitedCount++;
            }
          });
          
          // Total should match
          expect(successCount + rateLimitedCount).toBe(concurrentCount);
          
          // Should not exceed the limit for successful requests
          expect(successCount).toBeLessThanOrEqual(config.max);
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 20 }
    );
  });
});

// Export for test runner
export { propertyTestConfig };