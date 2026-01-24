import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import cachedDb from '../services/cachedDatabase.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * @route   GET /api/businesses
 * @desc    Get all businesses with optional filters
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      region, 
      industry, 
      status, 
      minScore, 
      limit = 100, 
      offset = 0 
    } = req.query;

    let query = 'SELECT * FROM businesses WHERE 1=1';
    const params = [];

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
      count: businesses.length,
      filters: { region, industry, status, minScore },
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
 * @desc    Get a single business by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const business = await cachedDb.get(
      'SELECT * FROM businesses WHERE id = ?',
      [id]
    );

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found' 
      });
    }

    // Get related proposals
    const proposals = await cachedDb.all(
      'SELECT id, status, created_at, sent_at FROM proposals WHERE business_id = ?',
      [id]
    );

    // Get related projects
    const projects = await cachedDb.all(
      'SELECT id, project_type, status, created_at FROM projects WHERE business_id = ?',
      [id]
    );

    logger.info('Business fetched successfully', {
      businessId: id,
      userId: req.user.id
    });

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
 * @desc    Create a new business
 * @access  Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
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

    const result = await cachedDb.run(`
      INSERT INTO businesses (
        name, address, phone, website, email, rating, review_count,
        maps_url, region, industry, digital_presence_score, 
        opportunity_score, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      name, address, phone, website, email, rating, review_count,
      maps_url, region, industry, digital_presence_score || 0,
      opportunity_score || 0, status
    ]);

    const businessId = result.lastID;

    const business = await cachedDb.get(
      'SELECT * FROM businesses WHERE id = ?',
      [businessId]
    );

    logger.info('Business created successfully', {
      businessId,
      name,
      userId: req.user.id
    });

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
 * @desc    Update a business
 * @access  Private
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if business exists
    const business = await cachedDb.get(
      'SELECT id FROM businesses WHERE id = ?',
      [id]
    );

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found' 
      });
    }

    // Build update query dynamically
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

    updateFields.push('updated_at = datetime(\'now\')');
    values.push(id);

    await cachedDb.run(`
      UPDATE businesses 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `, values);

    const updatedBusiness = await cachedDb.get(
      'SELECT * FROM businesses WHERE id = ?',
      [id]
    );

    logger.info('Business updated successfully', {
      businessId: id,
      userId: req.user.id
    });

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
 * @desc    Delete a business
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

    // Check if business exists
    const business = await cachedDb.get(
      'SELECT id FROM businesses WHERE id = ?',
      [id]
    );

    if (!business) {
      return res.status(404).json({ 
        success: false, 
        message: 'Business not found' 
      });
    }

    await cachedDb.run('DELETE FROM businesses WHERE id = ?', [id]);

    logger.info('Business deleted successfully', {
      businessId: id,
      userId: req.user.id
    });

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
 * @desc    Get business statistics summary
 * @access  Private
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
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
    `);

    const byRegion = await cachedDb.all(`
      SELECT region, COUNT(*) as count
      FROM businesses
      WHERE region IS NOT NULL AND region != ''
      GROUP BY region
      ORDER BY count DESC
      LIMIT 10
    `);

    const byIndustry = await cachedDb.all(`
      SELECT industry, COUNT(*) as count
      FROM businesses
      WHERE industry IS NOT NULL AND industry != ''
      GROUP BY industry
      ORDER BY count DESC
      LIMIT 10
    `);

    logger.info('Business stats fetched successfully', {
      userId: req.user.id
    });

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
