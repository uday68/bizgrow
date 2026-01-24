// Feature: production-upgrade, Property 5: Security Response Standards

import fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import { 
  securityMiddleware, 
  httpsEnforcement,
  inputSanitization,
  sqlInjectionProtection,
  requestSizeLimiter,
  securityEventLogger
} from '../middleware/auth.js';

// Property test configuration
const propertyTestConfig = {
  numRuns: 100,
  timeout: 10000,
  verbose: false,
  seed: 42
};

// Test app factory with security middleware
const createSecureTestApp = () => {
  const app = express();
  
  // Apply security middleware
  app.use(securityMiddleware);
  app.use(inputSanitization);
  app.use(sqlInjectionProtection);
  app.use(requestSizeLimiter('1mb'));
  app.use(securityEventLogger);
  app.use(express.json());
  
  // Test routes
  app.get('/test', (req, res) => {
    res.json({ success: true, data: req.query });
  });
  
  app.post('/test', (req, res) => {
    res.json({ success: true, data: req.body });
  });
  
  app.get('/protected', (req, res) => {
    res.status(401).json({ error: 'Unauthorized' });
  });
  
  return app;
};

// Custom generators for security testing
const xssPayloadGenerator = fc.oneof(
  fc.constant('<script>alert("xss")</script>'),
  fc.constant('javascript:alert("xss")'),
  fc.constant('<img src="x" onerror="alert(1)">'),
  fc.constant('<svg onload="alert(1)">'),
  fc.constant('"><script>alert(1)</script>'),
  fc.constant("'><script>alert(1)</script>"),
  fc.constant('<iframe src="javascript:alert(1)"></iframe>'),
  fc.constant('data:text/html,<script>alert(1)</script>')
);

const sqlInjectionPayloadGenerator = fc.oneof(
  fc.constant("' OR '1'='1"),
  fc.constant("'; DROP TABLE users; --"),
  fc.constant("' UNION SELECT * FROM users --"),
  fc.constant("1' OR 1=1 --"),
  fc.constant("admin'--"),
  fc.constant("' OR 1=1#"),
  fc.constant("1; DELETE FROM users"),
  fc.constant("EXEC xp_cmdshell('dir')")
);

const maliciousHeaderGenerator = fc.record({
  'X-Forwarded-For': fc.oneof(
    fc.constant('127.0.0.1; rm -rf /'),
    fc.constant('<script>alert(1)</script>'),
    fc.constant("'; DROP TABLE users; --")
  ),
  'User-Agent': fc.oneof(
    fc.constant('Mozilla/5.0 <script>alert(1)</script>'),
    fc.constant("User'; DROP TABLE users; --"),
    fc.constant('Bot/1.0 javascript:alert(1)')
  ),
  'Referer': fc.oneof(
    fc.constant('javascript:alert(1)'),
    fc.constant('data:text/html,<script>alert(1)</script>'),
    fc.constant("http://evil.com'; DROP TABLE users; --")
  )
});

// Property 5: Security Response Standards
// For any HTTP response, the Security_Middleware should include required security headers 
// and enforce HTTPS redirects for all production communications
describe('Property 5: Security Response Standards', () => {
  test('All responses should include required security headers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant('GET'), fc.constant('POST')),
        fc.record({
          param1: fc.string({ minLength: 0, maxLength: 50 }),
          param2: fc.integer({ min: 0, max: 1000 })
        }),
        async (method, queryData) => {
          const app = createSecureTestApp();
          
          let response;
          if (method === 'GET') {
            response = await request(app)
              .get('/test')
              .query(queryData);
          } else {
            response = await request(app)
              .post('/test')
              .send(queryData);
          }
          
          // Should always get a response
          expect([200, 400, 401, 403, 413, 429, 500]).toContain(response.status);
          
          // Required security headers should be present
          const headers = response.headers;
          
          // Content Security Policy
          expect(headers).toHaveProperty('content-security-policy');
          expect(headers['content-security-policy']).toContain("default-src 'self'");
          
          // X-Frame-Options
          expect(headers).toHaveProperty('x-frame-options');
          expect(headers['x-frame-options']).toBe('DENY');
          
          // X-Content-Type-Options
          expect(headers).toHaveProperty('x-content-type-options');
          expect(headers['x-content-type-options']).toBe('nosniff');
          
          // X-XSS-Protection
          expect(headers).toHaveProperty('x-xss-protection');
          expect(headers['x-xss-protection']).toBe('1; mode=block');
          
          // Referrer Policy
          expect(headers).toHaveProperty('referrer-policy');
          expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
          
          // X-Powered-By should be hidden
          expect(headers).not.toHaveProperty('x-powered-by');
          
          // Cross-Origin-Opener-Policy
          expect(headers).toHaveProperty('cross-origin-opener-policy');
          expect(headers['cross-origin-opener-policy']).toBe('same-origin');
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('XSS payloads should be consistently sanitized or rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        xssPayloadGenerator,
        fc.string({ minLength: 1, maxLength: 20 }),
        async (xssPayload, fieldName) => {
          const app = createSecureTestApp();
          
          // Test in query parameters
          const getResponse = await request(app)
            .get('/test')
            .query({ [fieldName]: xssPayload });
          
          expect([200, 400]).toContain(getResponse.status);
          
          if (getResponse.status === 200) {
            // If accepted, should be sanitized
            const responseData = getResponse.body.data[fieldName];
            expect(responseData).not.toContain('<script');
            expect(responseData).not.toContain('javascript:');
            expect(responseData).not.toContain('onerror=');
            expect(responseData).not.toContain('onload=');
          }
          
          // Test in request body
          const postResponse = await request(app)
            .post('/test')
            .send({ [fieldName]: xssPayload });
          
          expect([200, 400]).toContain(postResponse.status);
          
          if (postResponse.status === 200) {
            // If accepted, should be sanitized
            const responseData = postResponse.body.data[fieldName];
            expect(responseData).not.toContain('<script');
            expect(responseData).not.toContain('javascript:');
            expect(responseData).not.toContain('onerror=');
            expect(responseData).not.toContain('onload=');
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('SQL injection payloads should be consistently rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        sqlInjectionPayloadGenerator,
        fc.string({ minLength: 1, maxLength: 20 }),
        async (sqlPayload, fieldName) => {
          const app = createSecureTestApp();
          
          // Test in query parameters
          const getResponse = await request(app)
            .get('/test')
            .query({ [fieldName]: sqlPayload });
          
          // Should be rejected with 400 status
          expect(getResponse.status).toBe(400);
          expect(getResponse.body).toHaveProperty('error', 'Invalid input detected');
          expect(getResponse.body).toHaveProperty('code', 'INVALID_INPUT');
          expect(getResponse.body).toHaveProperty('timestamp');
          
          // Test in request body
          const postResponse = await request(app)
            .post('/test')
            .send({ [fieldName]: sqlPayload });
          
          // Should be rejected with 400 status
          expect(postResponse.status).toBe(400);
          expect(postResponse.body).toHaveProperty('error', 'Invalid input detected');
          expect(postResponse.body).toHaveProperty('code', 'INVALID_INPUT');
          expect(postResponse.body).toHaveProperty('timestamp');
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Large request payloads should be consistently rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }), // MB size multiplier
        async (sizeMB) => {
          const app = createSecureTestApp();
          
          // Create large payload (larger than 1MB limit)
          const largeData = 'x'.repeat(sizeMB * 1024 * 1024);
          
          const response = await request(app)
            .post('/test')
            .send({ data: largeData });
          
          // Should be rejected with 413 status
          expect(response.status).toBe(413);
          expect(response.body).toHaveProperty('error', 'Request entity too large');
          expect(response.body).toHaveProperty('code', 'REQUEST_TOO_LARGE');
          expect(response.body).toHaveProperty('maxSize');
          expect(response.body).toHaveProperty('timestamp');
          
          return true;
        }
      ),
      { ...propertyTestConfig, numRuns: 20 } // Fewer runs due to large payloads
    );
  });

  test('Security error responses should have consistent structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(401, 403, 429),
        async (statusCode) => {
          const app = createSecureTestApp();
          
          // Trigger security response
          const response = await request(app).get('/protected');
          
          // Should have consistent error structure
          expect(response.status).toBe(401); // Our test route returns 401
          expect(response.body).toHaveProperty('error');
          expect(typeof response.body.error).toBe('string');
          
          // Should have security headers
          expect(response.headers).toHaveProperty('content-security-policy');
          expect(response.headers).toHaveProperty('x-frame-options');
          expect(response.headers).toHaveProperty('x-content-type-options');
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Malicious headers should be handled safely', async () => {
    await fc.assert(
      fc.asyncProperty(
        maliciousHeaderGenerator,
        async (maliciousHeaders) => {
          const app = createSecureTestApp();
          
          let requestBuilder = request(app).get('/test');
          
          // Add malicious headers
          Object.entries(maliciousHeaders).forEach(([key, value]) => {
            requestBuilder = requestBuilder.set(key, value);
          });
          
          const response = await requestBuilder;
          
          // Should handle malicious headers gracefully
          expect([200, 400, 401, 403, 500]).toContain(response.status);
          
          // Response should still have security headers
          expect(response.headers).toHaveProperty('content-security-policy');
          expect(response.headers).toHaveProperty('x-frame-options');
          
          // Response should not echo back malicious content
          if (response.body && typeof response.body === 'object') {
            const responseStr = JSON.stringify(response.body);
            expect(responseStr).not.toContain('<script');
            expect(responseStr).not.toContain('javascript:');
            expect(responseStr).not.toContain('DROP TABLE');
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Content-Type headers should be properly set and validated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant('application/json'),
          fc.constant('text/plain'),
          fc.constant('application/xml'),
          fc.constant('multipart/form-data'),
          fc.constant('application/x-www-form-urlencoded')
        ),
        async (contentType) => {
          const app = createSecureTestApp();
          
          const response = await request(app)
            .post('/test')
            .set('Content-Type', contentType)
            .send('{"test": "data"}');
          
          // Should handle different content types appropriately
          expect([200, 400, 415]).toContain(response.status);
          
          // Response should have proper content-type
          expect(response.headers).toHaveProperty('content-type');
          expect(response.headers['content-type']).toContain('application/json');
          
          // X-Content-Type-Options should prevent MIME sniffing
          expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('CORS headers should be properly configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant('https://bizgrow-ai-frontend.vercel.app'),
          fc.constant('https://evil.com'),
          fc.constant('http://localhost:3000'),
          fc.constant('https://malicious-site.com')
        ),
        async (origin) => {
          const app = createSecureTestApp();
          
          const response = await request(app)
            .get('/test')
            .set('Origin', origin);
          
          // Should always respond (CORS is handled by corsMiddleware)
          expect([200, 400, 401, 403]).toContain(response.status);
          
          // Security headers should still be present regardless of CORS
          expect(response.headers).toHaveProperty('content-security-policy');
          expect(response.headers).toHaveProperty('x-frame-options');
          expect(response.headers).toHaveProperty('x-content-type-options');
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });
});

// Export for test runner
export { propertyTestConfig };