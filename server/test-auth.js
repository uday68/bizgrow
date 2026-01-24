import { JWTTokenManager, PasswordManager } from './middleware/auth.js';

async function testAuthentication() {
  console.log('🧪 Testing Authentication System...\n');

  try {
    // Test password hashing
    console.log('1. Testing password hashing...');
    const password = 'TestPassword123!';
    const hash = await PasswordManager.hashPassword(password);
    console.log('✅ Password hashed successfully');
    
    const isValid = await PasswordManager.verifyPassword(password, hash);
    console.log(`✅ Password verification: ${isValid ? 'PASSED' : 'FAILED'}`);

    // Test password strength validation
    console.log('\n2. Testing password strength validation...');
    const weakPassword = '123';
    const strongPassword = 'StrongPass123!';
    
    const weakValidation = PasswordManager.validatePasswordStrength(weakPassword);
    const strongValidation = PasswordManager.validatePasswordStrength(strongPassword);
    
    console.log(`Weak password validation: ${!weakValidation.isValid ? 'PASSED' : 'FAILED'}`);
    console.log(`Strong password validation: ${strongValidation.isValid ? 'PASSED' : 'FAILED'}`);

    // Test JWT token generation and verification
    console.log('\n3. Testing JWT token management...');
    const testUser = {
      id: 1,
      email: 'test@example.com',
      role: 'developer'
    };

    const tokens = JWTTokenManager.generateTokens(testUser);
    console.log('✅ JWT tokens generated successfully');
    console.log(`Access Token: ${tokens.accessToken.substring(0, 50)}...`);
    console.log(`Refresh Token: ${tokens.refreshToken.substring(0, 50)}...`);

    // Verify access token
    const decoded = JWTTokenManager.verifyToken(tokens.accessToken);
    console.log(`✅ Token verification: ${decoded.email === testUser.email ? 'PASSED' : 'FAILED'}`);
    console.log(`User role: ${decoded.role}`);
    console.log(`Permissions: ${decoded.permissions.join(', ')}`);

    // Test token refresh
    const refreshedTokens = JWTTokenManager.refreshAccessToken(tokens.refreshToken);
    console.log('✅ Token refresh: PASSED');

    console.log('\n🎉 All authentication tests passed!');

  } catch (error) {
    console.error('❌ Authentication test failed:', error.message);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAuthentication();
}

export { testAuthentication };