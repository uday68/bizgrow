import express from 'express';
import migrator from '../database/migrator.js';
import logger from '../services/logger.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All migration routes require admin authentication
router.use(authenticateToken);
router.use(requireRole(['admin']));

/**
 * Get migration status
 * GET /api/migrations/status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await migrator.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get migration status', {
      type: 'migration',
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get migration status',
    });
  }
});

/**
 * Run pending migrations
 * POST /api/migrations/migrate
 */
router.post('/migrate', async (req, res) => {
  try {
    const { dryRun } = req.body;
    
    logger.info('Migration requested', {
      type: 'migration',
      user: req.user.username,
      dryRun: !!dryRun,
    });

    if (dryRun) {
      const testResults = await migrator.testAllPending();
      return res.json({
        success: true,
        dryRun: true,
        data: testResults,
        message: 'Dry run completed',
      });
    }

    await migrator.migrate();

    res.json({
      success: true,
      message: 'Migrations completed successfully',
    });
  } catch (error) {
    logger.error('Migration failed', {
      type: 'migration',
      user: req.user.username,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message,
    });
  }
});

/**
 * Rollback to specific version
 * POST /api/migrations/rollback
 */
router.post('/rollback', async (req, res) => {
  try {
    const { targetVersion } = req.body;

    if (!targetVersion) {
      return res.status(400).json({
        success: false,
        error: 'Target version is required',
      });
    }

    logger.warn('Migration rollback requested', {
      type: 'migration',
      user: req.user.username,
      targetVersion,
    });

    await migrator.rollback(targetVersion);

    res.json({
      success: true,
      message: `Rolled back to version ${targetVersion}`,
    });
  } catch (error) {
    logger.error('Migration rollback failed', {
      type: 'migration',
      user: req.user.username,
      targetVersion: req.body.targetVersion,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Rollback failed',
      details: error.message,
    });
  }
});

/**
 * Create new migration file
 * POST /api/migrations/create
 */
router.post('/create', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Migration name is required',
      });
    }

    logger.info('Creating new migration', {
      type: 'migration',
      user: req.user.username,
      name,
    });

    const migration = await migrator.createMigration(name);

    res.json({
      success: true,
      data: migration,
      message: 'Migration file created',
    });
  } catch (error) {
    logger.error('Failed to create migration', {
      type: 'migration',
      user: req.user.username,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create migration',
    });
  }
});

/**
 * Verify migration integrity
 * GET /api/migrations/verify
 */
router.get('/verify', async (req, res) => {
  try {
    const result = await migrator.verifyIntegrity();

    res.json({
      success: result.valid,
      data: result,
      message: result.valid
        ? 'All migrations verified'
        : 'Migration integrity issues found',
    });
  } catch (error) {
    logger.error('Migration verification failed', {
      type: 'migration',
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Verification failed',
    });
  }
});

/**
 * Test pending migrations
 * POST /api/migrations/test
 */
router.post('/test', async (req, res) => {
  try {
    logger.info('Testing pending migrations', {
      type: 'migration',
      user: req.user.username,
    });

    const results = await migrator.testAllPending();

    res.json({
      success: results.success,
      data: results,
      message: results.success
        ? 'All migrations passed testing'
        : 'Some migrations failed testing',
    });
  } catch (error) {
    logger.error('Migration testing failed', {
      type: 'migration',
      user: req.user.username,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Testing failed',
    });
  }
});

/**
 * Get migration history
 * GET /api/migrations/history
 */
router.get('/history', async (req, res) => {
  try {
    const executedMigrations = await migrator.getExecutedMigrations();

    res.json({
      success: true,
      data: executedMigrations,
      total: executedMigrations.length,
    });
  } catch (error) {
    logger.error('Failed to get migration history', {
      type: 'migration',
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get migration history',
    });
  }
});

/**
 * Get available migrations
 * GET /api/migrations/available
 */
router.get('/available', async (req, res) => {
  try {
    const availableMigrations = await migrator.getAvailableMigrations();

    res.json({
      success: true,
      data: availableMigrations,
      total: availableMigrations.length,
    });
  } catch (error) {
    logger.error('Failed to get available migrations', {
      type: 'migration',
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get available migrations',
    });
  }
});

export default router;
