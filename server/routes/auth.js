import express from 'express';
import { body, validationResult } from 'express-validator';
import { JWTTokenManager, PasswordManager, authenticateToken } from '../middleware/auth.js';
import cachedDb from '../services/cachedDatabase.js';
import { authLimiter } from '../middleware/auth.js';
import logger from '../services/logger.js';

const router = express.Router();

// Validation middleware
const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 }).withMessage('Password is required')
];

const validateRegister = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('role').optional().isIn(['user', 'developer', 'admin']).withMessage('Invalid role'),
  body('tenantId').optional().trim()
];

// Login endpoint
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user in database with tenant awareness
    const user = await cachedDb.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const isValidPassword = await PasswordManager.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    await cachedDb.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    // Generate tokens
    const tokens = JWTTokenManager.generateTokens(user);

    logger.info('User logged in successfully', { userId: user.id, tenantId: user.tenant_id });

    res.json({
      success: true,
      user: {
        id: user.id,
        tenantId: user.tenant_id || 'default',
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      },
      ...tokens
    });

  } catch (error) {
    logger.error('Login error:', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Register endpoint
router.post('/register', validateRegister, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName, role = 'user', tenantId = 'default' } = req.body;

    // Validate password strength
    const passwordValidation = PasswordManager.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
    }

    // Check if user already exists
    const existingUser = await cachedDb.get('SELECT id FROM users WHERE email = ?', [email]);

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await PasswordManager.hashPassword(password);

    // Create user with explicit tenantId
    const result = await cachedDb.run(`
      INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [tenantId, email, passwordHash, firstName, lastName, role]);

    const userId = result.lastID;

    const newUser = {
      id: userId,
      tenant_id: tenantId,
      email,
      first_name: firstName,
      last_name: lastName,
      role
    };

    // Generate tokens
    const tokens = JWTTokenManager.generateTokens(newUser);

    logger.info('New user registered', { userId, tenantId, email });

    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        tenantId: newUser.tenant_id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role
      },
      ...tokens
    });

  } catch (error) {
    logger.error('Registration error:', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token required',
        code: 'MISSING_REFRESH_TOKEN'
      });
    }

    const tokens = await JWTTokenManager.refreshAccessToken(refreshToken, async (userId) => {
      return await cachedDb.get('SELECT id, email, role, tenant_id FROM users WHERE id = ?', [userId]);
    });

    res.json({
      success: true,
      ...tokens
    });

  } catch (error) {
    logger.warn('Token refresh failed:', { error: error.message });
    res.status(401).json({
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN',
      details: error.message
    });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await JWTTokenManager.revokeToken?.(refreshToken);
  }
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await cachedDb.get(
      'SELECT id, tenant_id, email, first_name, last_name, role, created_at, last_login_at FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        tenantId: user.tenant_id || req.user.tenantId || 'default',
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at
      }
    });

  } catch (error) {
    logger.error('Get user profile error:', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;