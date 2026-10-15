import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import cachedDb from '../services/cachedDatabase.js';
import logger from '../services/logger.js';

const router = express.Router();

const getReqTenantId = (req) => {
  return req.tenantId || req.user?.tenantId || 'default';
};

/**
 * @route   GET /api/businesses
 * @desc    Get all businesses with optional filters, scoped to authenticated tenant
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const { 
      region, 
      industry, 
      status, 
      minScore, 
      limit = 100, 
      offset = 0 
    } = req.query;

    let query = 'SELECT * FROM businesses WHERE tenant_id = ?';
    const params = [tenantId];

    if (region) {
      query += ' AND region = ?';
      params.push(region);
    }

    if (industry) {
      query += ' AND industry = ?';
      params.push(industry);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (minScore) {
      query += ' AND opportunity_score >= ?';
      params.push(parseInt(minScore));
    }

    query += ' ORDER BY opportunity_score DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const businesses = await cachedDb.all(query, params);

    logger.info('Businesses fetched successfully', {
      tenantId,
      count: businesses.length,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: businesses,
      total: businesses.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error fetching businesses:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch businesses',
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/businesses/:id
 * @desc    Get a single business by ID (tenant-scoped)
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const { id } = req.params;

    const business = await cachedDb.get(
      'SELECT * FROM businesses WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found' 
      });
    }

    // Get related proposals (tenant-scoped)
    const proposals = await cachedDb.all(
      'SELECT id, status, created_at, sent_at FROM proposals WHERE business_id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    // Get related projects (tenant-scoped)
    const projects = await cachedDb.all(
      'SELECT id, project_type, status, created_at FROM projects WHERE business_id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    res.json({
      success: true,
      data: {
        ...business,
        proposals,
        projects
      }
    });
  } catch (error) {
    logger.error('Error fetching business:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch business',
      error: error.message 
    });
  }
});

/**
 * @route   POST /api/businesses
 * @desc    Create a new business within tenant boundary
 * @access  Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const {
      name,
      address,
      phone,
      website,
      email,
      rating,
      review_count,
      maps_url,
      region,
      industry,
      digital_presence_score,
      opportunity_score,
      status = 'discovered'
    } = req.body;

    if (!name || !address) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and address are required' 
      });
    }

    const businessId = `biz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await cachedDb.run(`
      INSERT INTO businesses (
        id, tenant_id, name, address, phone, website, email, rating, review_count,
        maps_url, region, industry, digital_presence_score, 
        opportunity_score, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      businessId, tenantId, name, address, phone, website, email, rating, review_count,
      maps_url, region, industry, digital_presence_score || 0,
      opportunity_score || 0, status
    ]);

    const business = await cachedDb.get(
      'SELECT * FROM businesses WHERE id = ? AND tenant_id = ?',
      [businessId, tenantId]
    );

    res.status(201).json({
      success: true,
      message: 'Business created successfully',
      data: business
    });
  } catch (error) {
    logger.error('Error creating business:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create business',
      error: error.message 
    });
  }
});

/**
 * @route   PUT /api/businesses/:id
 * @desc    Update a business (tenant-scoped)
 * @access  Private
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const { id } = req.params;
    const updates = req.body;

    const business = await cachedDb.get(
      'SELECT id FROM businesses WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found' 
      });
    }

    const allowedFields = [
      'name', 'address', 'phone', 'website', 'email', 'rating', 
      'review_count', 'maps_url', 'region', 'industry', 
      'digital_presence_score', 'opportunity_score', 'status'
    ];

    const updateFields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid fields to update' 
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, tenantId);

    await cachedDb.run(`
      UPDATE businesses 
      SET ${updateFields.join(', ')}
      WHERE id = ? AND tenant_id = ?
    `, values);

    const updatedBusiness = await cachedDb.get(
      'SELECT * FROM businesses WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    res.json({
      success: true,
      message: 'Business updated successfully',
      data: updatedBusiness
    });
  } catch (error) {
    logger.error('Error updating business:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update business',
      error: error.message 
    });
  }
});

/**
 * @route   DELETE /api/businesses/:id
 * @desc    Delete a business (tenant-scoped)
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const { id } = req.params;

    const business = await cachedDb.get(
      'SELECT id FROM businesses WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found' 
      });
    }

    await cachedDb.run('DELETE FROM businesses WHERE id = ? AND tenant_id = ?', [id, tenantId]);

    res.json({
      success: true,
      message: 'Business deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting business:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete business',
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/businesses/stats/summary
 * @desc    Get business statistics summary (tenant-scoped)
 * @access  Private
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const stats = await cachedDb.get(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'discovered' THEN 1 END) as discovered,
        COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted,
        COUNT(CASE WHEN status = 'interested' THEN 1 END) as interested,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
        AVG(digital_presence_score) as avg_digital_score,
        AVG(opportunity_score) as avg_opportunity_score
      FROM businesses
      WHERE tenant_id = ?
    `, [tenantId]);

    const byRegion = await cachedDb.all(`
      SELECT region, COUNT(*) as count
      FROM businesses
      WHERE tenant_id = ? AND region IS NOT NULL AND region != ''
      GROUP BY region
      ORDER BY count DESC
      LIMIT 10
    `, [tenantId]);

    const byIndustry = await cachedDb.all(`
      SELECT industry, COUNT(*) as count
      FROM businesses
      WHERE tenant_id = ? AND industry IS NOT NULL AND industry != ''
      GROUP BY industry
      ORDER BY count DESC
      LIMIT 10
    `, [tenantId]);

    res.json({
      success: true,
      data: {
        summary: stats,
        byRegion,
        byIndustry
      }
    });
  } catch (error) {
    logger.error('Error fetching business stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch business statistics',
      error: error.message 
    });
  }
});

export default router;
