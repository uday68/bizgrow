import express from 'express';
import webPresenceScanner from '../services/webPresenceScanner.js';
import logger from '../services/logger.js';
import { getDatabase } from '../database/init.js';

const router = express.Router();

/**
 * Scan business web presence
 * POST /api/enhanced-search/scan-presence
 */
router.post('/scan-presence', async (req, res) => {
  try {
    const { businessData } = req.body;

    if (!businessData || !businessData.name) {
      return res.status(400).json({
        success: false,
        error: 'Business data with name is required',
      });
    }

    const results = await webPresenceScanner.scanBusinessPresence(businessData);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error('Web presence scan failed', {
      type: 'enhanced_search',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to scan web presence',
    });
  }
});

/**
 * Batch scan multiple businesses
 * POST /api/enhanced-search/batch-scan
 */
router.post('/batch-scan', async (req, res) => {
  try {
    const { businesses } = req.body;

    if (!businesses || !Array.isArray(businesses)) {
      return res.status(400).json({
        success: false,
        error: 'Array of businesses is required',
      });
    }

    // Start batch scan asynchronously
    const results = await webPresenceScanner.batchScan(businesses, (progress) => {
      // In a real implementation, use WebSocket to send progress updates
      logger.info('Batch scan progress', {
        type: 'enhanced_search',
        progress: progress.progress,
        current: progress.currentBusiness,
      });
    });

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error('Batch scan failed', {
      type: 'enhanced_search',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to complete batch scan',
    });
  }
});

/**
 * Get enhanced business details
 * GET /api/enhanced-search/business/:id
 */
router.get('/business/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    // Get business from database
    const business = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM businesses WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found',
      });
    }

    // Scan web presence
    const presenceData = await webPresenceScanner.scanBusinessPresence(business);

    res.json({
      success: true,
      data: {
        ...business,
        webPresence: presenceData,
      },
    });
  } catch (error) {
    logger.error('Failed to get enhanced business details', {
      type: 'enhanced_search',
      businessId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get business details',
    });
  }
});

/**
 * Search businesses with filters
 * POST /api/enhanced-search/filter
 */
router.post('/filter', async (req, res) => {
  try {
    const { filters, location } = req.body;
    const db = getDatabase();

    let query = 'SELECT * FROM businesses WHERE 1=1';
    const params = [];

    // Apply filters
    if (filters.minRating) {
      query += ' AND rating >= ?';
      params.push(filters.minRating);
    }

    if (filters.hasWebsite !== null && filters.hasWebsite !== undefined) {
      if (filters.hasWebsite) {
        query += ' AND website IS NOT NULL AND website != ""';
      } else {
        query += ' AND (website IS NULL OR website = "")';
      }
    }

    if (filters.businessType && filters.businessType !== 'all') {
      query += ' AND industry LIKE ?';
      params.push(`%${filters.businessType}%`);
    }

    if (filters.region) {
      query += ' AND region = ?';
      params.push(filters.region);
    }

    query += ' ORDER BY opportunity_score DESC LIMIT 100';

    const businesses = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Calculate distances if location provided
    if (location && location.latitude && location.longitude) {
      businesses.forEach(business => {
        if (business.latitude && business.longitude) {
          business.distance = calculateDistance(
            location.latitude,
            location.longitude,
            business.latitude,
            business.longitude
          );
        }
      });

      // Filter by max distance if specified
      if (filters.maxDistance) {
        const filtered = businesses.filter(b => 
          !b.distance || b.distance <= filters.maxDistance
        );
        
        res.json({
          success: true,
          data: filtered,
          total: filtered.length,
        });
        return;
      }
    }

    res.json({
      success: true,
      data: businesses,
      total: businesses.length,
    });
  } catch (error) {
    logger.error('Enhanced search filter failed', {
      type: 'enhanced_search',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to filter businesses',
    });
  }
});

/**
 * Get business analytics
 * GET /api/enhanced-search/analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const db = getDatabase();

    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN website IS NULL OR website = '' THEN 1 END) as no_website,
          COUNT(CASE WHEN rating >= 4 THEN 1 END) as high_rated,
          AVG(rating) as avg_rating,
          AVG(digital_presence_score) as avg_digital_score,
          AVG(opportunity_score) as avg_opportunity_score
        FROM businesses
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Get top industries
    const industries = await new Promise((resolve, reject) => {
      db.all(`
        SELECT industry, COUNT(*) as count
        FROM businesses
        WHERE industry IS NOT NULL AND industry != ''
        GROUP BY industry
        ORDER BY count DESC
        LIMIT 10
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Get regional distribution
    const regions = await new Promise((resolve, reject) => {
      db.all(`
        SELECT region, COUNT(*) as count
        FROM businesses
        WHERE region IS NOT NULL AND region != ''
        GROUP BY region
        ORDER BY count DESC
        LIMIT 10
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({
      success: true,
      data: {
        overview: stats,
        topIndustries: industries,
        topRegions: regions,
      },
    });
  } catch (error) {
    logger.error('Failed to get analytics', {
      type: 'enhanced_search',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get analytics',
    });
  }
});

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

export default router;
