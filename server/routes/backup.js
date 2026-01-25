import express from 'express';
import backupService from '../services/backupService.js';
import logger from '../services/logger.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All backup routes require admin authentication
router.use(authenticateToken);
router.use(requireRole(['admin']));

/**
 * Get backup service status
 * GET /api/backup/status
 */
router.get('/status', (req, res) => {
  try {
    const status = backupService.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get backup status', {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get backup status',
    });
  }
});

/**
 * List all backups
 * GET /api/backup/list
 */
router.get('/list', (req, res) => {
  try {
    const backups = backupService.listBackups();
    res.json({
      success: true,
      data: backups,
      total: backups.length,
    });
  } catch (error) {
    logger.error('Failed to list backups', {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to list backups',
    });
  }
});

/**
 * Create manual backup
 * POST /api/backup/create
 */
router.post('/create', async (req, res) => {
  try {
    const { label } = req.body;
    
    logger.info('Manual backup requested', {
      user: req.user.username,
      label,
    });

    const backup = await backupService.createPITRBackup(label || 'manual');

    res.json({
      success: true,
      data: backup,
      message: 'Backup created successfully',
    });
  } catch (error) {
    logger.error('Manual backup failed', {
      error: error.message,
      user: req.user.username,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create backup',
    });
  }
});

/**
 * Restore from backup
 * POST /api/backup/restore
 */
router.post('/restore', async (req, res) => {
  try {
    const { backupName } = req.body;

    if (!backupName) {
      return res.status(400).json({
        success: false,
        error: 'Backup name is required',
      });
    }

    logger.warn('Database restore requested', {
      user: req.user.username,
      backupName,
    });

    const result = await backupService.restoreBackup(backupName);

    res.json({
      success: true,
      data: result,
      message: 'Database restored successfully',
    });
  } catch (error) {
    logger.error('Database restore failed', {
      error: error.message,
      user: req.user.username,
      backupName: req.body.backupName,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to restore database',
    });
  }
});

/**
 * Verify backup integrity
 * POST /api/backup/verify
 */
router.post('/verify', async (req, res) => {
  try {
    const { backupName } = req.body;

    if (!backupName) {
      return res.status(400).json({
        success: false,
        error: 'Backup name is required',
      });
    }

    const backupPath = backupService.findBackupFile(backupName);
    if (!backupPath) {
      return res.status(404).json({
        success: false,
        error: 'Backup not found',
      });
    }

    const isValid = await backupService.verifyBackup(backupPath);

    res.json({
      success: true,
      data: {
        backupName,
        isValid,
      },
    });
  } catch (error) {
    logger.error('Backup verification failed', {
      error: error.message,
      backupName: req.body.backupName,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to verify backup',
    });
  }
});

/**
 * Test backup and restore process
 * POST /api/backup/test
 */
router.post('/test', async (req, res) => {
  try {
    logger.info('Backup/restore test requested', {
      user: req.user.username,
    });

    const result = await backupService.testBackupRestore();

    res.json({
      success: result.success,
      data: result,
      message: result.success
        ? 'Backup/restore test passed'
        : 'Backup/restore test failed',
    });
  } catch (error) {
    logger.error('Backup/restore test failed', {
      error: error.message,
      user: req.user.username,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to run backup/restore test',
    });
  }
});

/**
 * Start backup service
 * POST /api/backup/start
 */
router.post('/start', (req, res) => {
  try {
    backupService.start();
    res.json({
      success: true,
      message: 'Backup service started',
    });
  } catch (error) {
    logger.error('Failed to start backup service', {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start backup service',
    });
  }
});

/**
 * Stop backup service
 * POST /api/backup/stop
 */
router.post('/stop', (req, res) => {
  try {
    backupService.stop();
    res.json({
      success: true,
      message: 'Backup service stopped',
    });
  } catch (error) {
    logger.error('Failed to stop backup service', {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to stop backup service',
    });
  }
});

/**
 * Delete old backup
 * DELETE /api/backup/:backupName
 */
router.delete('/:backupName', (req, res) => {
  try {
    const { backupName } = req.params;
    
    const backupPath = backupService.findBackupFile(backupName);
    if (!backupPath) {
      return res.status(404).json({
        success: false,
        error: 'Backup not found',
      });
    }

    const fs = require('fs');
    fs.unlinkSync(backupPath);

    logger.info('Backup deleted', {
      backupName,
      user: req.user.username,
    });

    res.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete backup', {
      error: error.message,
      backupName: req.params.backupName,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete backup',
    });
  }
});

export default router;
