import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import cachedDb from '../services/cachedDatabase.js';
import logger from '../services/logger.js';

const router = express.Router();

const getReqTenantId = (req) => {
  return req.tenantId || req.user?.tenantId || 'default';
};

/**
 * @route   GET /api/proposals
 * @desc    Get all proposals scoped to authenticated tenant
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);

    const proposals = await cachedDb.all(`
      SELECT 
        p.id,
        p.tenant_id,
        p.business_id,
        p.content,
        p.status,
        p.sent_at,
        p.response_at,
        p.interest_level,
        p.created_at,
        p.updated_at,
        b.name as business_name,
        b.address as business_address,
        b.phone as business_phone,
        b.email as business_email,
        b.website as business_website,
        b.rating as business_rating
      FROM proposals p
      LEFT JOIN businesses b ON p.business_id = b.id
      WHERE p.tenant_id = ?
      ORDER BY p.created_at DESC
    `, [tenantId]);

    logger.info('Proposals fetched successfully', {
      tenantId,
      count: proposals.length,
      userId: req.user.id
    });

    res.json(proposals);
  } catch (error) {
    logger.error('Error fetching proposals:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch proposals',
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/proposals/:id
 * @desc    Get a single proposal by ID (tenant-scoped)
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const { id } = req.params;

    const proposal = await cachedDb.get(`
      SELECT 
        p.id,
        p.tenant_id,
        p.business_id,
        p.content,
        p.status,
        p.sent_at,
        p.response_at,
        p.interest_level,
        p.created_at,
        p.updated_at,
        b.name as business_name,
        b.address as business_address,
        b.phone as business_phone,
        b.email as business_email,
        b.website as business_website,
        b.rating as business_rating,
        b.review_count as business_review_count,
        b.maps_url as business_maps_url,
        b.region as business_region,
        b.industry as business_industry
      FROM proposals p
      LEFT JOIN businesses b ON p.business_id = b.id
      WHERE p.id = ? AND p.tenant_id = ?
    `, [id, tenantId]);

    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proposal not found' 
      });
    }

    res.json(proposal);
  } catch (error) {
    logger.error('Error fetching proposal:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch proposal',
      error: error.message 
    });
  }
});

/**
 * @route   POST /api/proposals/generate
 * @desc    Generate a new proposal for a business within tenant boundary
 * @access  Private
 */
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const { businessId } = req.body;

    if (!businessId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Business ID is required' 
      });
    }

    // Check if business exists within tenant
    const business = await cachedDb.get(
      'SELECT * FROM businesses WHERE id = ? AND tenant_id = ?',
      [businessId, tenantId]
    );

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found in current tenant' 
      });
    }

    // Check if proposal already exists
    const existingProposal = await cachedDb.get(
      'SELECT id FROM proposals WHERE business_id = ? AND tenant_id = ?',
      [businessId, tenantId]
    );

    if (existingProposal) {
      return res.status(400).json({ 
        success: false, 
        message: 'Proposal already exists for this business',
        proposalId: existingProposal.id
      });
    }

    const proposalContent = generateProposalContent(business);
    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await cachedDb.run(`
      INSERT INTO proposals (id, tenant_id, business_id, content, status, created_at)
      VALUES (?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP)
    `, [proposalId, tenantId, businessId, proposalContent]);

    const proposal = await cachedDb.get(`
      SELECT 
        p.id,
        p.tenant_id,
        p.business_id,
        p.content,
        p.status,
        p.created_at,
        b.name as business_name,
        b.address as business_address,
        b.phone as business_phone,
        b.email as business_email
      FROM proposals p
      LEFT JOIN businesses b ON p.business_id = b.id
      WHERE p.id = ? AND p.tenant_id = ?
    `, [proposalId, tenantId]);

    res.status(201).json({
      success: true,
      message: 'Proposal generated successfully',
      proposal
    });
  } catch (error) {
    logger.error('Error generating proposal:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate proposal',
      error: error.message 
    });
  }
});

/**
 * @route   PUT /api/proposals/:id
 * @desc    Update a proposal (tenant-scoped)
 * @access  Private
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const { id } = req.params;
    const { content, status, interest_level } = req.body;

    const proposal = await cachedDb.get(
      'SELECT id FROM proposals WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proposal not found' 
      });
    }

    const updates = [];
    const values = [];

    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
      if (status === 'sent') {
        updates.push('sent_at = CURRENT_TIMESTAMP');
      }
    }

    if (interest_level !== undefined) {
      updates.push('interest_level = ?');
      values.push(interest_level);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, tenantId);

    await cachedDb.run(`
      UPDATE proposals 
      SET ${updates.join(', ')}
      WHERE id = ? AND tenant_id = ?
    `, values);

    const updatedProposal = await cachedDb.get(`
      SELECT 
        p.id,
        p.tenant_id,
        p.business_id,
        p.content,
        p.status,
        p.sent_at,
        p.response_at,
        p.interest_level,
        p.created_at,
        p.updated_at,
        b.name as business_name,
        b.address as business_address,
        b.phone as business_phone,
        b.email as business_email
      FROM proposals p
      LEFT JOIN businesses b ON p.business_id = b.id
      WHERE p.id = ? AND p.tenant_id = ?
    `, [id, tenantId]);

    res.json({
      success: true,
      message: 'Proposal updated successfully',
      proposal: updatedProposal
    });
  } catch (error) {
    logger.error('Error updating proposal:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update proposal',
      error: error.message 
    });
  }
});

/**
 * @route   DELETE /api/proposals/:id
 * @desc    Delete a proposal (tenant-scoped)
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const { id } = req.params;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized - Admin access required' 
      });
    }

    const proposal = await cachedDb.get(
      'SELECT id FROM proposals WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proposal not found' 
      });
    }

    await cachedDb.run('DELETE FROM proposals WHERE id = ? AND tenant_id = ?', [id, tenantId]);

    res.json({
      success: true,
      message: 'Proposal deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting proposal:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete proposal',
      error: error.message 
    });
  }
});

function generateProposalContent(business) {
  const services = [];
  if (!business.website || business.website === '') {
    services.push('Professional Website Development');
  }
  if ((business.digital_presence_score || 0) < 50) {
    services.push('Digital Marketing Strategy');
    services.push('Social Media Management');
  }
  if (business.rating && business.rating < 4.0) {
    services.push('Online Reputation Management');
  }
  services.push('SEO Optimization');
  services.push('Business Analytics Dashboard');

  return `
# Digital Transformation Proposal for ${business.name}

## Executive Summary
We are pleased to present this comprehensive digital transformation proposal for ${business.name}. Our analysis indicates significant opportunities to enhance your digital presence and drive business growth.

## Current Situation
- **Business Name:** ${business.name}
- **Location:** ${business.address}
- **Industry:** ${business.industry || 'General Business'}

## Recommended Services
${services.map((service, index) => `${index + 1}. **${service}**`).join('\n')}

## Next Steps
1. Schedule a consultation call to discuss technical milestones.
2. Review and approve the implementation roadmap.
`.trim();
}

export default router;
