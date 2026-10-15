import express from 'express';
import { body, validationResult } from 'express-validator';
import aiService from '../services/aiService.js';
import logger from '../services/logger.js';

const router = express.Router();

const validateLeadSearch = [
  body('query').trim().isLength({ min: 1, max: 200 }).withMessage('Search query must be between 1 and 200 characters'),
  body('location.latitude').optional().isFloat({ min: -90, max: 90 }),
  body('location.longitude').optional().isFloat({ min: -180, max: 180 })
];

const validateProposalGen = [
  body('lead.name').trim().isLength({ min: 1, max: 200 }).withMessage('Lead business name is required'),
  body('lead.address').optional().isString(),
  body('lead.website').optional().isString(),
  body('lead.rating').optional().isNumeric(),
  body('lead.reviewCount').optional().isNumeric()
];

// Search leads endpoint
router.post('/leads', validateLeadSearch, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { query, location } = req.body;
    const result = await aiService.searchLeads(query, location);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error generating AI leads:', { error: error.message });
    res.status(500).json({ error: 'Failed to search leads', message: error.message });
  }
});

// Generate proposal endpoint
router.post('/proposals', validateProposalGen, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { lead } = req.body;
    const proposal = await aiService.generateProposal(lead);
    res.json({ success: true, proposal });
  } catch (error) {
    logger.error('Error generating AI proposal:', { error: error.message });
    res.status(500).json({ error: 'Failed to generate proposal', message: error.message });
  }
});

export default router;
