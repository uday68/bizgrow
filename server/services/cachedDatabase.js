import { getDatabase, getDatabaseType, query as dbQuery } from '../database/init.js';
import cacheService from './cacheService.js';
import { createHash } from 'crypto';

/**
 * Cached Database Service
 * Provides database operations with intelligent caching integration
 * Supports both SQLite (development) and PostgreSQL (production)
 */
class CachedDatabase {
  constructor() {
    this.db = null;
    this.dbType = 'sqlite';
  }

  /**
   * Initialize database connection
   */
  init() {
    this.db = getDatabase();
    this.dbType = getDatabaseType();
  }

  /**
   * Generate query hash for caching
   */
  generateQueryHash(sql, params = []) {
    const queryString = sql + JSON.stringify(params);
    return createHash('md5').update(queryString).digest('hex');
  }

  /**
   * Convert SQLite query to PostgreSQL if needed
   */
  adaptQuery(sql, params = []) {
    if (this.dbType === 'sqlite') {
      return { sql, params };
    }

    // Convert SQLite-specific syntax to PostgreSQL
    let adaptedSql = sql;
    let adaptedParams = [...params];

    // Convert AUTOINCREMENT to SERIAL (handled in schema)
    // Convert CURRENT_TIMESTAMP to PostgreSQL format
    adaptedSql = adaptedSql.replace(/CURRENT_TIMESTAMP/g, 'CURRENT_TIMESTAMP');
    
    // Convert parameter placeholders from ? to $1, $2, etc.
    let paramIndex = 1;
    adaptedSql = adaptedSql.replace(/\?/g, () => `$${paramIndex++}`);

    // Convert LIMIT/OFFSET syntax if needed
    // PostgreSQL uses the same LIMIT/OFFSET syntax as SQLite, so no change needed

    return { sql: adaptedSql, params: adaptedParams };
  }

  /**
   * Cached database query (cache-aside pattern)
   */
  async query(sql, params = [], options = {}) {
    if (!this.db) this.init();

    const {
      namespace = 'queries',
      ttl = 600, // 10 minutes default
      useCache = true,
      cacheKey = null
    } = options;

    if (!useCache) {
      return this.executeQuery(sql, params);
    }

    const key = cacheKey || this.generateQueryHash(sql, params);
    
    return await cacheService.getOrSet(
      namespace,
      key,
      () => this.executeQuery(sql, params),
      {},
      ttl
    );
  }

  /**
   * Execute database query without caching
   */
  async executeQuery(sql, params = []) {
    const { sql: adaptedSql, params: adaptedParams } = this.adaptQuery(sql, params);
    
    if (this.dbType === 'postgres') {
      // Use PostgreSQL connection
      const result = await this.db.query(adaptedSql, adaptedParams);
      return result.rows;
    } else {
      // Use SQLite connection
      return new Promise((resolve, reject) => {
        if (adaptedSql.trim().toUpperCase().startsWith('SELECT')) {
          // SELECT query - return all rows
          this.db.all(adaptedSql, adaptedParams, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        } else {
          // INSERT/UPDATE/DELETE query - return result info
          this.db.run(adaptedSql, adaptedParams, function(err) {
            if (err) reject(err);
            else resolve({
              lastID: this.lastID,
              changes: this.changes
            });
          });
        }
      });
    }
  }

  /**
   * Get single row with caching
   */
  async get(sql, params = [], options = {}) {
    const rows = await this.query(sql, params, options);
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  /**
   * Get all rows with caching
   */
  async all(sql, params = [], options = {}) {
    return await this.query(sql, params, options);
  }

  /**
   * Execute write operation with cache invalidation
   */
  async run(sql, params = [], options = {}) {
    if (!this.db) this.init();

    const {
      invalidateNamespaces = [],
      invalidateKeys = [],
      useWriteThrough = false,
      namespace = 'queries',
      cacheKey = null
    } = options;

    try {
      let result;

      if (useWriteThrough && cacheKey) {
        // Write-through pattern
        result = await cacheService.writeThrough(
          namespace,
          cacheKey,
          { sql, params },
          () => this.executeQuery(sql, params)
        );
      } else {
        // Direct execution
        result = await this.executeQuery(sql, params);
      }

      // Invalidate related caches
      if (invalidateNamespaces.length > 0) {
        await Promise.all(
          invalidateNamespaces.map(ns => cacheService.invalidateNamespace(ns))
        );
      }

      if (invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map(({ namespace: ns, key }) => 
            cacheService.delete(ns, key)
          )
        );
      }

      return result;
    } catch (error) {
      console.error('Cached database run error:', error);
      throw error;
    }
  }

  // Business-specific cached operations

  /**
   * Get all businesses with caching
   */
  async getBusinesses(options = {}) {
    const { limit = null, offset = 0, region = null } = options;
    
    let sql = 'SELECT * FROM businesses';
    const params = [];
    
    if (region) {
      sql += ' WHERE region = ?';
      params.push(region);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    if (limit) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return await this.query(sql, params, {
      namespace: 'businesses',
      ttl: 3600, // 1 hour
      cacheKey: `businesses_${region || 'all'}_${limit || 'all'}_${offset}`
    });
  }

  /**
   * Get business by ID with caching
   */
  async getBusinessById(id) {
    return await this.get(
      'SELECT * FROM businesses WHERE id = ?',
      [id],
      {
        namespace: 'businesses',
        ttl: 3600,
        cacheKey: `business_${id}`
      }
    );
  }

  /**
   * Create business with cache invalidation
   */
  async createBusiness(businessData) {
    const { id, name, address, phone, website, email, rating, review_count, maps_url, region, industry } = businessData;
    
    const result = await this.run(
      `INSERT INTO businesses 
       (id, name, address, phone, website, email, rating, review_count, maps_url, region, industry) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, address, phone, website, email, rating, review_count, maps_url, region, industry],
      {
        invalidateNamespaces: ['businesses', 'analytics'],
        useWriteThrough: true,
        namespace: 'businesses',
        cacheKey: `business_${id}`
      }
    );

    // Cache the new business data
    await cacheService.set('businesses', `business_${id}`, businessData, {}, 3600);

    return result;
  }

  /**
   * Update business with cache invalidation
   */
  async updateBusiness(id, updates) {
    const setParts = Object.keys(updates).map(key => `${key} = ?`);
    const values = Object.values(updates);
    
    const result = await this.run(
      `UPDATE businesses SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id],
      {
        invalidateNamespaces: ['businesses', 'analytics'],
        invalidateKeys: [
          { namespace: 'businesses', key: `business_${id}` }
        ]
      }
    );

    return result;
  }

  /**
   * Get proposals with caching (includes business information)
   */
  async getProposals(businessId = null, options = {}) {
    const { limit = null, status = null } = options;
    
    let sql = `
      SELECT 
        p.*,
        b.name as business_name,
        b.address as business_address,
        b.phone as business_phone,
        b.email as business_email
      FROM proposals p
      LEFT JOIN businesses b ON p.business_id = b.id
    `;
    const params = [];
    const conditions = [];
    
    if (businessId) {
      conditions.push('p.business_id = ?');
      params.push(businessId);
    }
    
    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY p.created_at DESC';
    
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    return await this.query(sql, params, {
      namespace: 'proposals',
      ttl: 1800, // 30 minutes
      cacheKey: `proposals_${businessId || 'all'}_${status || 'all'}_${limit || 'all'}`
    });
  }

  /**
   * Get proposal by ID with caching (includes business information)
   */
  async getProposalById(id) {
    return await this.get(
      `SELECT 
        p.*,
        b.name as business_name,
        b.address as business_address,
        b.phone as business_phone,
        b.email as business_email
      FROM proposals p
      LEFT JOIN businesses b ON p.business_id = b.id
      WHERE p.id = ?`,
      [id],
      {
        namespace: 'proposals',
        ttl: 1800,
        cacheKey: `proposal_${id}`
      }
    );
  }

  /**
   * Create proposal with cache invalidation
   */
  async createProposal(proposalData) {
    const { id, business_id, content, status = 'draft' } = proposalData;
    
    const result = await this.run(
      'INSERT INTO proposals (id, business_id, content, status) VALUES (?, ?, ?, ?)',
      [id, business_id, content, status],
      {
        invalidateNamespaces: ['proposals', 'analytics']
      }
    );

    return result;
  }

  /**
   * Get user by ID with caching
   */
  async getUserById(id) {
    return await this.get(
      'SELECT id, email, first_name, last_name, role, mfa_enabled, created_at, last_login_at FROM users WHERE id = ?',
      [id],
      {
        namespace: 'users',
        ttl: 1800, // 30 minutes
        cacheKey: `user_${id}`
      }
    );
  }

  /**
   * Get user by email with caching
   */
  async getUserByEmail(email) {
    return await this.get(
      'SELECT * FROM users WHERE email = ?',
      [email],
      {
        namespace: 'users',
        ttl: 1800,
        cacheKey: `user_email_${createHash('md5').update(email).digest('hex')}`
      }
    );
  }

  /**
   * Update user with cache invalidation
   */
  async updateUser(id, updates) {
    const setParts = Object.keys(updates).map(key => `${key} = ?`);
    const values = Object.values(updates);
    
    const result = await this.run(
      `UPDATE users SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id],
      {
        invalidateKeys: [
          { namespace: 'users', key: `user_${id}` }
        ]
      }
    );

    return result;
  }

  /**
   * Get agent status with caching
   */
  async getAgentStatus(agentId = null) {
    if (agentId) {
      return await this.get(
        'SELECT * FROM agent_status WHERE agent_id = ?',
        [agentId],
        {
          namespace: 'agents',
          ttl: 120, // 2 minutes
          cacheKey: `agent_${agentId}`
        }
      );
    } else {
      return await this.all(
        'SELECT * FROM agent_status ORDER BY last_active DESC',
        [],
        {
          namespace: 'agents',
          ttl: 120,
          cacheKey: 'agents_all'
        }
      );
    }
  }

  /**
   * Update agent status with cache invalidation
   */
  async updateAgentStatus(agentId, updates) {
    const setParts = Object.keys(updates).map(key => `${key} = ?`);
    const values = Object.values(updates);
    
    const result = await this.run(
      `UPDATE agent_status SET ${setParts.join(', ')}, last_active = CURRENT_TIMESTAMP WHERE agent_id = ?`,
      [...values, agentId],
      {
        invalidateNamespaces: ['agents'],
        invalidateKeys: [
          { namespace: 'agents', key: `agent_${agentId}` }
        ]
      }
    );

    return result;
  }

  /**
   * Get analytics data with caching
   */
  async getAnalytics(timeRange = '24h') {
    const cacheKey = `analytics_${timeRange}`;
    
    return await cacheService.getOrSet(
      'analytics',
      cacheKey,
      async () => {
        // Complex analytics query
        const businesses = await this.executeQuery('SELECT COUNT(*) as count FROM businesses');
        const proposals = await this.executeQuery('SELECT COUNT(*) as count FROM proposals WHERE status = "sent"');
        const interested = await this.executeQuery('SELECT COUNT(*) as count FROM proposals WHERE status = "interested"');
        const projects = await this.executeQuery('SELECT COUNT(*) as count FROM projects WHERE status = "completed"');
        
        return {
          totalBusinesses: businesses[0]?.count || 0,
          proposalsSent: proposals[0]?.count || 0,
          interestedResponses: interested[0]?.count || 0,
          projectsCompleted: projects[0]?.count || 0,
          timestamp: new Date().toISOString()
        };
      },
      {},
      300 // 5 minutes
    );
  }

  /**
   * Get recent activity with caching
   */
  async getRecentActivity(limit = 20) {
    return await this.query(
      `SELECT type, business_name, business_id, description, status, created_at 
       FROM activity_log 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [limit],
      {
        namespace: 'analytics',
        ttl: 300, // 5 minutes
        cacheKey: `recent_activity_${limit}`
      }
    );
  }

  /**
   * Log activity with cache invalidation
   */
  async logActivity(type, businessName, businessId, description, status = 'success', metadata = null) {
    return await this.run(
      'INSERT INTO activity_log (type, business_name, business_id, description, status, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [type, businessName, businessId, description, status, JSON.stringify(metadata)],
      {
        invalidateNamespaces: ['analytics']
      }
    );
  }

  /**
   * Batch operations with caching
   */
  async batchGetBusinesses(ids) {
    const cached = await cacheService.mget('businesses', ids.map(id => `business_${id}`));
    const missing = ids.filter(id => !cached[`business_${id}`]);
    
    if (missing.length === 0) {
      return Object.values(cached);
    }

    // Fetch missing businesses
    const placeholders = missing.map(() => '?').join(',');
    const missingBusinesses = await this.executeQuery(
      `SELECT * FROM businesses WHERE id IN (${placeholders})`,
      missing
    );

    // Cache the missing businesses
    const toCache = {};
    missingBusinesses.forEach(business => {
      toCache[`business_${business.id}`] = business;
    });
    
    if (Object.keys(toCache).length > 0) {
      await cacheService.mset('businesses', toCache, {}, 3600);
    }

    // Combine cached and fetched results
    return [...Object.values(cached), ...missingBusinesses];
  }

  /**
   * Health check for cached database
   */
  async healthCheck() {
    try {
      // Test database connection
      await this.executeQuery('SELECT 1');
      
      // Test cache connection
      const cacheHealth = await cacheService.healthCheck();
      
      return {
        database: true,
        cache: cacheHealth.redis,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        database: false,
        cache: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Singleton instance
const cachedDb = new CachedDatabase();

export default cachedDb;