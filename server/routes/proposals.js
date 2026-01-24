import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import cachedDb from '../services/cachedDatabase.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * @route   GET /api/proposals
 * @desc    Get all proposals with business information
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const proposals = await cachedDb.all(`
      SELECT 
        p.id,
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
      ORDER BY p.created_at DESC
    `);

    logger.info('Proposals fetched successfully', {
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
 * @desc    Get a single proposal by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const proposal = await cachedDb.get(`
      SELECT 
        p.id,
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
      WHERE p.id = ?
    `, [id]);

    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proposal not found' 
      });
    }

    logger.info('Proposal fetched successfully', {
      proposalId: id,
      userId: req.user.id
    });

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
 * @desc    Generate a new proposal for a business
 * @access  Private
 */
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req.body;

    if (!businessId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Business ID is required' 
      });
    }

    // Check if business exists
    const business = await cachedDb.get(
      'SELECT * FROM businesses WHERE id = ?',
      [businessId]
    );

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found' 
      });
    }

    // Check if proposal already exists
    const existingProposal = await cachedDb.get(
      'SELECT id FROM proposals WHERE business_id = ?',
      [businessId]
    );

    if (existingProposal) {
      return res.status(400).json({ 
        success: false, 
        message: 'Proposal already exists for this business',
        proposalId: existingProposal.id
      });
    }

    // Generate proposal content (simplified version - can be enhanced with AI)
    const proposalContent = generateProposalContent(business);

    // Insert proposal
    const result = await cachedDb.run(`
      INSERT INTO proposals (business_id, content, status, created_at, updated_at)
      VALUES (?, ?, 'draft', datetime('now'), datetime('now'))
    `, [businessId, proposalContent]);

    const proposalId = result.lastID;

    // Fetch the created proposal
    const proposal = await cachedDb.get(`
      SELECT 
        p.id,
        p.business_id,
        p.content,
        p.status,
        p.created_at,
        p.updated_at,
        b.name as business_name,
        b.address as business_address,
        b.phone as business_phone,
        b.email as business_email
      FROM proposals p
      LEFT JOIN businesses b ON p.business_id = b.id
      WHERE p.id = ?
    `, [proposalId]);

    logger.info('Proposal generated successfully', {
      proposalId,
      businessId,
      userId: req.user.id
    });

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
 * @desc    Update a proposal
 * @access  Private
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, status, interest_level } = req.body;

    // Check if proposal exists
    const proposal = await cachedDb.get(
      'SELECT id FROM proposals WHERE id = ?',
      [id]
    );

    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proposal not found' 
      });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);

      // If status is being set to 'sent', update sent_at
      if (status === 'sent') {
        updates.push('sent_at = datetime(\'now\')');
      }
    }

    if (interest_level !== undefined) {
      updates.push('interest_level = ?');
      values.push(interest_level);
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(id);

    await cachedDb.run(`
      UPDATE proposals 
      SET ${updates.join(', ')}
      WHERE id = ?
    `, values);

    // Fetch updated proposal
    const updatedProposal = await cachedDb.get(`
      SELECT 
        p.id,
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
      WHERE p.id = ?
    `, [id]);

    logger.info('Proposal updated successfully', {
      proposalId: id,
      userId: req.user.id
    });

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
 * @desc    Delete a proposal
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized - Admin access required' 
      });
    }

    // Check if proposal exists
    const proposal = await cachedDb.get(
      'SELECT id FROM proposals WHERE id = ?',
      [id]
    );

    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proposal not found' 
      });
    }

    await cachedDb.run('DELETE FROM proposals WHERE id = ?', [id]);

    logger.info('Proposal deleted successfully', {
      proposalId: id,
      userId: req.user.id
    });

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

/**
 * @route   GET /api/proposals/business/:businessId
 * @desc    Get all proposals for a specific business
 * @access  Private
 */
router.get('/business/:businessId', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req.params;

    const proposals = await cachedDb.all(`
      SELECT 
        p.id,
        p.business_id,
        p.content,
        p.status,
        p.sent_at,
        p.response_at,
        p.interest_level,
        p.created_at,
        p.updated_at
      FROM proposals p
      WHERE p.business_id = ?
      ORDER BY p.created_at DESC
    `, [businessId]);

    logger.info('Business proposals fetched successfully', {
      businessId,
      count: proposals.length,
      userId: req.user.id
    });

    res.json(proposals);
  } catch (error) {
    logger.error('Error fetching business proposals:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch business proposals',
      error: error.message 
    });
  }
});

/**
 * Helper function to generate proposal content
 * This is a simplified version - can be enhanced with AI/LLM integration
 */
function generateProposalContent(business) {
  const services = [];
  
  // Determine services based on business characteristics
  if (!business.website || business.website === '') {
    services.push('Professional Website Development');
  }
  
  if (business.digital_presence_score < 50) {
    services.push('Digital Marketing Strategy');
    services.push('Social Media Management');
  }
  
  if (business.rating && business.rating < 4.0) {
    services.push('Online Reputation Management');
  }
  
  services.push('SEO Optimization');
  services.push('Business Analytics Dashboard');

  const proposal = `
# Digital Transformation Proposal for ${business.name}

## Executive Summary

We are pleased to present this comprehensive digital transformation proposal for ${business.name}. Our analysis indicates significant opportunities to enhance your digital presence and drive business growth.

## Current Situation

- **Business Name:** ${business.name}
- **Location:** ${business.address}
- **Industry:** ${business.industry || 'General Business'}
- **Digital Presence Score:** ${business.digital_presence_score || 0}/100
- **Opportunity Score:** ${business.opportunity_score || 0}/100

## Recommended Services

${services.map((service, index) => `${index + 1}. **${service}**`).join('\n')}

## Implementation Timeline

- **Phase 1 (Weeks 1-2):** Discovery and Planning
- **Phase 2 (Weeks 3-6):** Development and Implementation
- **Phase 3 (Weeks 7-8):** Testing and Optimization
- **Phase 4 (Week 9+):** Launch and Ongoing Support

## Investment

We offer flexible pricing packages tailored to your specific needs. Our team will work with you to create a customized solution that fits your budget and delivers maximum ROI.

## Next Steps

1. Schedule a consultation call to discuss your specific needs
2. Review and approve the detailed project plan
3. Begin implementation with our expert team

## Why Choose BizGrow AI?

- **Proven Track Record:** Successfully delivered 100+ digital transformation projects
- **AI-Powered Solutions:** Cutting-edge technology for optimal results
- **Dedicated Support:** 24/7 customer support and ongoing maintenance
- **Results-Driven:** Focus on measurable business outcomes

We look forward to partnering with you to transform your digital presence and drive business growth.

---

**Contact Information:**
BizGrow AI - Digital Transformation Experts
Email: contact@bizgrow.ai
Phone: (555) 123-4567
Website: www.bizgrow.ai
`;

  return proposal.trim();
}

export default router;
