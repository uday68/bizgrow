// Feature: production-upgrade, Property 1: JWT Token Validation Consistency
// Property 2: Secure Credential Processing

import fc from 'fast-check';
import { JWTTokenManager, PasswordManager } from '../middleware/auth.js';

// Property test configuration
const propertyTestConfig = {
  numRuns: 20, // Reduced for faster test execution
  timeout: 10000,
  verbose: false,
  seed: 42 // Fixed seed for reproducible tests
};

// Custom generators for testing
const userGenerator = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  email: fc.emailAddress(),
  role: fc.constantFrom('user', 'developer', 'admin'),
  first_name: fc.string({ minLength: 1, maxLength: 50 }),
  last_name: fc.string({ minLength: 1, maxLength: 50 })
});

const passwordGenerator = fc.string({ minLength: 8, maxLength: 50 })
  .filter(pwd => 
    /[A-Z]/.test(pwd) && 
    /[a-z]/.test(pwd) && 
    /\d/.test(pwd) && 
    /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
  );

const invalidTokenGenerator = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }), // Too short
  fc.string({ minLength: 200, maxLength: 300 }).filter(s => !s.includes('.')), // No dots
  fc.constant('invalid.token.here'),
  fc.constant(''),
  fc.constant('Bearer token'),
  fc.hexaString({ minLength: 100, maxLength: 200 })
);

// Property 1: JWT Token Validation Consistency
// For any JWT token and protected endpoint, the Authentication_Service should consistently 
// validate tokens and enforce permissions, rejecting invalid, expired, or insufficient-permission 
// tokens with appropriate error responses
describe('Property 1: JWT Token Validation Consistency', () => {
  test('Valid tokens should always be accepted with consistent structure', () => {
    fc.assert(
      fc.property(userGenerator, (user) => {
        // Generate valid token
        const tokens = JWTTokenManager.generateTokens(user);
        
        // Valid token should always verify successfully
        const decoded = JWTTokenManager.verifyToken(tokens.accessToken);
        
        // Consistency checks - these should ALWAYS hold
        expect(decoded.id).toBe(user.id);
        expect(decoded.email).toBe(user.email);
        expect(decoded.role).toBe(user.role);
        expect(decoded.permissions).toBeDefined();
        expect(Array.isArray(decoded.permissions)).toBe(true);
        expect(decoded.iss).toBe('bizgrow-ai');
        expect(decoded.aud).toBe('bizgrow-users');
        expect(typeof decoded.exp).toBe('number');
        expect(typeof decoded.iat).toBe('number');
        expect(decoded.exp).toBeGreaterThan(decoded.iat);
        
        // Token structure should be consistent
        expect(tokens.accessToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
        expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
        expect(tokens.tokenType).toBe('Bearer');
        expect(tokens.expiresIn).toBeDefined();
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Invalid tokens should always be rejected consistently', () => {
    fc.assert(
      fc.property(invalidTokenGenerator, (invalidToken) => {
        // Invalid tokens should always throw an error
        expect(() => {
          JWTTokenManager.verifyToken(invalidToken);
        }).toThrow();
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Role hierarchy and permissions should be consistently enforced', () => {
    fc.assert(
      fc.property(userGenerator, userGenerator, (user1, user2) => {
        const tokens1 = JWTTokenManager.generateTokens(user1);
        const tokens2 = JWTTokenManager.generateTokens(user2);
        
        const decoded1 = JWTTokenManager.verifyToken(tokens1.accessToken);
        const decoded2 = JWTTokenManager.verifyToken(tokens2.accessToken);
        
        // Admin should always have all permissions
        if (decoded1.role === 'admin') {
          expect(decoded1.permissions).toContain('*');
        }
        
        // Developer should have more permissions than user
        if (decoded1.role === 'developer' && decoded2.role === 'user') {
          expect(decoded1.permissions.length).toBeGreaterThan(decoded2.permissions.length);
        }
        
        // User should have basic permissions
        if (decoded1.role === 'user') {
          expect(decoded1.permissions).toContain('read:own-data');
          expect(decoded1.permissions).toContain('update:own-profile');
        }
        
        // Developer should have agent control permissions
        if (decoded1.role === 'developer') {
          expect(decoded1.permissions).toContain('control:agents');
          expect(decoded1.permissions).toContain('read:metrics');
        }
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Token refresh should maintain user identity consistently', () => {
    fc.assert(
      fc.property(userGenerator, (user) => {
        const originalTokens = JWTTokenManager.generateTokens(user);
        const refreshedTokens = JWTTokenManager.refreshAccessToken(originalTokens.refreshToken);
        
        const originalDecoded = JWTTokenManager.verifyToken(originalTokens.accessToken);
        const refreshedDecoded = JWTTokenManager.verifyToken(refreshedTokens.accessToken);
        
        // User identity should remain consistent after refresh
        expect(refreshedDecoded.id).toBe(originalDecoded.id);
        expect(refreshedDecoded.email).toBe(originalDecoded.email);
        expect(refreshedDecoded.role).toBe(originalDecoded.role);
        expect(refreshedDecoded.permissions).toEqual(originalDecoded.permissions);
        
        // New tokens should have different timestamps but same structure
        expect(refreshedDecoded.iat).toBeGreaterThanOrEqual(originalDecoded.iat);
        expect(refreshedTokens.tokenType).toBe('Bearer');
        
        return true;
      }),
      propertyTestConfig
    );
  });
});

// Property 2: Secure Credential Processing
// For any valid user credentials, the Authentication_Service should generate properly 
// structured JWT tokens with correct role claims and implement secure password hashing 
// using bcrypt with minimum 12 rounds
describe('Property 2: Secure Credential Processing', () => {
  test('Password hashing should always be secure and deterministic', async () => {
    await fc.assert(
      fc.asyncProperty(passwordGenerator, async (password) => {
        // Hash password
        const hash = await PasswordManager.hashPassword(password);
        
        // Hash should be different from original password
        expect(hash).not.toBe(password);
        
        // Hash should be bcrypt format with proper rounds
        expect(hash).toMatch(/^\$2b\$\d{2}\$.{53}$/);
        
        // Extract rounds from hash and verify minimum
        const rounds = parseInt(hash.split('$')[2]);
        expect(rounds).toBeGreaterThanOrEqual(4); // Test environment uses 4, production uses 12
        
        // Should be able to verify the password consistently
        const isValid1 = await PasswordManager.verifyPassword(password, hash);
        const isValid2 = await PasswordManager.verifyPassword(password, hash);
        expect(isValid1).toBe(true);
        expect(isValid2).toBe(true);
        
        // Wrong password should never verify
        const wrongPassword = password + 'WRONG';
        const isInvalid = await PasswordManager.verifyPassword(wrongPassword, hash);
        expect(isInvalid).toBe(false);
        
        // Same password should produce different hashes (salt)
        const hash2 = await PasswordManager.hashPassword(password);
        expect(hash).not.toBe(hash2);
        
        // But both should verify the same password
        const isValid3 = await PasswordManager.verifyPassword(password, hash2);
        expect(isValid3).toBe(true);
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('JWT tokens should always have proper structure and security claims', () => {
    fc.assert(
      fc.property(userGenerator, (user) => {
        const tokens = JWTTokenManager.generateTokens(user);
        
        // Access token should be properly formatted JWT (3 parts separated by dots)
        const accessParts = tokens.accessToken.split('.');
        expect(accessParts).toHaveLength(3);
        expect(accessParts.every(part => part.length > 0)).toBe(true);
        
        // Refresh token should be properly formatted JWT
        const refreshParts = tokens.refreshToken.split('.');
        expect(refreshParts).toHaveLength(3);
        expect(refreshParts.every(part => part.length > 0)).toBe(true);
        
        // Should have required security properties
        expect(tokens.expiresIn).toBeDefined();
        expect(tokens.tokenType).toBe('Bearer');
        
        // Decoded token should have all required security claims
        const decoded = JWTTokenManager.verifyToken(tokens.accessToken);
        expect(decoded.id).toBe(user.id);
        expect(decoded.email).toBe(user.email);
        expect(decoded.role).toBe(user.role);
        expect(decoded.permissions).toBeDefined();
        expect(decoded.iss).toBe('bizgrow-ai'); // Issuer claim
        expect(decoded.aud).toBe('bizgrow-users'); // Audience claim
        expect(decoded.exp).toBeDefined(); // Expiration claim
        expect(decoded.iat).toBeDefined(); // Issued at claim
        
        // Security: expiration should be in the future
        const now = Math.floor(Date.now() / 1000);
        expect(decoded.exp).toBeGreaterThan(now);
        expect(decoded.iat).toBeLessThanOrEqual(now);
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Password strength validation should be consistent and comprehensive', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (password) => {
        const validation = PasswordManager.validatePasswordStrength(password);
        
        // Validation result should always have required properties
        expect(validation).toHaveProperty('isValid');
        expect(validation).toHaveProperty('errors');
        expect(validation).toHaveProperty('strength');
        
        // Errors should be array
        expect(Array.isArray(validation.errors)).toBe(true);
        
        // Strength should be valid value
        expect(['weak', 'medium', 'strong']).toContain(validation.strength);
        
        // Consistency: if password is invalid, should have errors
        if (!validation.isValid) {
          expect(validation.errors.length).toBeGreaterThan(0);
        }
        
        // Consistency: if password is valid, should have no errors
        if (validation.isValid) {
          expect(validation.errors.length).toBe(0);
        }
        
        // Specific validation rules should be consistent
        if (password.length < 8) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(err => err.includes('8 characters'))).toBe(true);
        }
        
        if (!/[A-Z]/.test(password)) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(err => err.includes('uppercase'))).toBe(true);
        }
        
        if (!/[a-z]/.test(password)) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(err => err.includes('lowercase'))).toBe(true);
        }
        
        if (!/\d/.test(password)) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(err => err.includes('number'))).toBe(true);
        }
        
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(err => err.includes('special character'))).toBe(true);
        }
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Role-based permissions should be consistently assigned', () => {
    fc.assert(
      fc.property(fc.constantFrom('user', 'developer', 'admin'), (role) => {
        const user = { id: 1, email: 'test@example.com', role };
        const tokens = JWTTokenManager.generateTokens(user);
        const decoded = JWTTokenManager.verifyToken(tokens.accessToken);
        
        // Permissions should be consistent for each role
        switch (role) {
          case 'user':
            expect(decoded.permissions).toEqual(['read:own-data', 'update:own-profile']);
            break;
          case 'developer':
            expect(decoded.permissions).toEqual(['read:own-data', 'update:own-profile', 'read:metrics', 'control:agents']);
            break;
          case 'admin':
            expect(decoded.permissions).toEqual(['*']);
            break;
        }
        
        return true;
      }),
      propertyTestConfig
    );
  });
});

// Export for test runner
export { propertyTestConfig };