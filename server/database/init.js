import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import path from 'path';
import postgresDb from './postgres.js';
import migrator from './migrator.js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;
let dbType = 'sqlite'; // Default to SQLite for development

/**
 * Initialize database based on environment configuration
 */
export const initDatabase = async () => {
  try {
    // Determine database type from environment
    const usePostgres = process.env.NODE_ENV === 'production' || 
                       process.env.DB_TYPE === 'postgres' ||
                       process.env.DATABASE_URL; // Common for cloud deployments

    if (usePostgres) {
      console.log('🐘 Initializing PostgreSQL database...');
      dbType = 'postgres';
      
      // Initialize PostgreSQL connection
      await postgresDb.init();
      
      // Run migrations
      console.log('🔄 Running database migrations...');
      await migrator.migrate();
      
      // Seed initial data if needed
      await seedInitialDataPostgres();
      
      console.log('✅ PostgreSQL database initialized successfully');
      return true;
    } else {
      console.log('📁 Initializing SQLite database...');
      dbType = 'sqlite';
      
      return new Promise((resolve, reject) => {
        db = new sqlite3.Database(join(__dirname, 'bizgrow.db'), (err) => {
          if (err) {
            console.error('Error opening SQLite database:', err);
            reject(err);
            return;
          }
          
          console.log('Connected to SQLite database');
          createTables().then(resolve).catch(reject);
        });
      });
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

/**
 * Get database instance based on current type
 */
export const getDatabase = () => {
  if (dbType === 'postgres') {
    return postgresDb;
  } else {
    if (!db) {
      throw new Error('SQLite database not initialized. Call initDatabase() first.');
    }
    return db;
  }
};

/**
 * Get database type
 */
export const getDatabaseType = () => dbType;

/**
 * Execute query with database abstraction
 */
export const query = async (sql, params = []) => {
  if (dbType === 'postgres') {
    const result = await postgresDb.query(sql, params);
    return result.rows;
  } else {
    return new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  }
};

/**
 * Seed initial data for PostgreSQL
 */
const seedInitialDataPostgres = async () => {
  try {
    // Check if agents already exist
    const existingAgents = await postgresDb.query(
      'SELECT COUNT(*) as count FROM agent_status'
    );
    
    if (existingAgents.rows[0].count > 0) {
      console.log('✅ Initial data already exists, skipping seed');
      return;
    }
    
    console.log('🌱 Seeding initial data...');
    
    // Insert initial agent status
    const agents = [
      {
        agent_id: 'discovery',
        name: 'Business Discovery Agent',
        status: 'active',
        tasks_completed: 247,
        performance_score: 94
      },
      {
        agent_id: 'proposal',
        name: 'Proposal Generation Agent',
        status: 'active',
        tasks_completed: 89,
        performance_score: 87
      },
      {
        agent_id: 'builder',
        name: 'Project Builder Agent',
        status: 'idle',
        tasks_completed: 23,
        performance_score: 96
      },
      {
        agent_id: 'analytics',
        name: 'Market Analytics Agent',
        status: 'active',
        tasks_completed: 156,
        performance_score: 91
      }
    ];

    for (const agent of agents) {
      await postgresDb.query(
        `INSERT INTO agent_status 
         (agent_id, name, status, tasks_completed, performance_score) 
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (agent_id) DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         tasks_completed = EXCLUDED.tasks_completed,
         performance_score = EXCLUDED.performance_score`,
        [agent.agent_id, agent.name, agent.status, agent.tasks_completed, agent.performance_score]
      );
    }
    
    console.log('✅ Initial data seeded successfully');
  } catch (error) {
    console.error('❌ Failed to seed initial data:', error);
    throw error;
  }
};

const createTables = () => {
  return new Promise((resolve, reject) => {
    const tables = [
      // Tenants table
      `CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        plan_type TEXT DEFAULT 'free',
        status TEXT DEFAULT 'active',
        max_users INTEGER DEFAULT 10,
        max_businesses INTEGER DEFAULT 500,
        max_proposals INTEGER DEFAULT 100,
        max_storage_mb INTEGER DEFAULT 1000,
        current_users INTEGER DEFAULT 0,
        current_businesses INTEGER DEFAULT 0,
        current_proposals INTEGER DEFAULT 0,
        current_storage_mb INTEGER DEFAULT 0,
        require_mfa BOOLEAN DEFAULT FALSE,
        feature_flags TEXT DEFAULT '{}',
        custom_settings TEXT DEFAULT '{}',
        branding_config TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Users table for authentication
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT DEFAULT 'default',
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK (role IN ('user', 'developer', 'admin')),
        mfa_enabled BOOLEAN DEFAULT FALSE,
        mfa_secret TEXT,
        login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        password_changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
      )`,

      // Refresh Tokens table for session security and token rotation
      `CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME,
        replaced_by_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,
      
      // Businesses table
      `CREATE TABLE IF NOT EXISTS businesses (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT,
        website TEXT,
        email TEXT,
        rating REAL,
        review_count INTEGER,
        maps_url TEXT,
        region TEXT,
        industry TEXT,
        digital_presence_score INTEGER DEFAULT 0,
        opportunity_score INTEGER DEFAULT 0,
        status TEXT DEFAULT 'discovered',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Proposals table
      `CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        business_id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        sent_at DATETIME,
        response_at DATETIME,
        interest_level INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses (id)
      )`,
      
      // Projects table
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        tenant_id TEXT DEFAULT 'default',
        business_id TEXT NOT NULL,
        proposal_id TEXT,
        project_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        build_progress INTEGER DEFAULT 0,
        deployment_url TEXT,
        estimated_completion DATETIME,
        actual_completion DATETIME,
        revenue REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses (id),
        FOREIGN KEY (proposal_id) REFERENCES proposals (id)
      )`,

      // Audit Log table
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        user_id INTEGER,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Activity Log table
      `CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        business_name TEXT,
        business_id TEXT,
        description TEXT,
        status TEXT DEFAULT 'success',
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Agent Status table
      `CREATE TABLE IF NOT EXISTS agent_status (
        agent_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'idle',
        current_task TEXT,
        tasks_completed INTEGER DEFAULT 0,
        performance_score INTEGER DEFAULT 100,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Regional Analytics table
      `CREATE TABLE IF NOT EXISTS regional_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        region TEXT NOT NULL,
        businesses_discovered INTEGER DEFAULT 0,
        proposals_sent INTEGER DEFAULT 0,
        conversion_rate REAL DEFAULT 0,
        revenue REAL DEFAULT 0,
        date DATE DEFAULT CURRENT_DATE
      )`
    ];

    let completed = 0;
    const total = tables.length;

    tables.forEach((sql, index) => {
      db.run(sql, (err) => {
        if (err) {
          console.error(`Error creating table ${index}:`, err);
          reject(err);
          return;
        }
        
        completed++;
        if (completed === total) {
          console.log('All database tables created successfully');
          // Ensure tenant_id exists on legacy tables if upgrading existing database
          const ensureColumns = [
            `ALTER TABLE users ADD COLUMN tenant_id TEXT DEFAULT 'default'`,
            `ALTER TABLE businesses ADD COLUMN tenant_id TEXT DEFAULT 'default'`,
            `ALTER TABLE proposals ADD COLUMN tenant_id TEXT DEFAULT 'default'`,
            `ALTER TABLE projects ADD COLUMN tenant_id TEXT DEFAULT 'default'`
          ];
          let colDone = 0;
          ensureColumns.forEach(alterSql => {
            db.run(alterSql, () => {
              colDone++;
              if (colDone === ensureColumns.length) {
                seedInitialData().then(resolve).catch(reject);
              }
            });
          });
        }
      });
    });
  });
};

const seedInitialData = () => {
  return new Promise((resolve, reject) => {
    // Insert initial agent status
    const agents = [
      {
        agent_id: 'discovery',
        name: 'Business Discovery Agent',
        status: 'active',
        tasks_completed: 247,
        performance_score: 94
      },
      {
        agent_id: 'proposal',
        name: 'Proposal Generation Agent',
        status: 'active',
        tasks_completed: 89,
        performance_score: 87
      },
      {
        agent_id: 'builder',
        name: 'Project Builder Agent',
        status: 'idle',
        tasks_completed: 23,
        performance_score: 96
      },
      {
        agent_id: 'analytics',
        name: 'Market Analytics Agent',
        status: 'active',
        tasks_completed: 156,
        performance_score: 91
      }
    ];

    let completed = 0;
    const total = agents.length;

    // Seed default tenants and users
    db.run(
      `INSERT OR IGNORE INTO tenants (id, name, slug, plan_type, status)
       VALUES ('default', 'Default Enterprise', 'default', 'enterprise', 'active')`,
      () => {
        db.run(
          `INSERT OR IGNORE INTO tenants (id, name, slug, plan_type, status)
           VALUES ('tenant-beta', 'Beta Logistics', 'beta', 'starter', 'active')`,
          () => {
            // Seed default admin and user (Password: Admin123! and User123!)
            const adminHash = '$2b$10$w0uR/xKqP.uUf4mZz55t9ecwM4g5yH7l8y3QfR8tG1K1Q8f9J7Z7.';
            db.run(
              `INSERT OR IGNORE INTO users (tenant_id, email, password_hash, first_name, last_name, role)
               VALUES ('default', 'admin@bizgrow.ai', '$2b$10$EP7jLq0n9W3q8F9O.b0YreV7I3P6r.kYkLzT2F9U0c5V6P4E2l4yC', 'System', 'Admin', 'admin')`,
              () => {
                db.run(
                  `INSERT OR IGNORE INTO users (tenant_id, email, password_hash, first_name, last_name, role)
                   VALUES ('default', 'user@bizgrow.ai', '$2b$10$EP7jLq0n9W3q8F9O.b0YreV7I3P6r.kYkLzT2F9U0c5V6P4E2l4yC', 'Demo', 'User', 'user')`,
                  () => {
                    db.run(
                      `INSERT OR IGNORE INTO users (tenant_id, email, password_hash, first_name, last_name, role)
                       VALUES ('tenant-beta', 'beta@bizgrow.ai', '$2b$10$EP7jLq0n9W3q8F9O.b0YreV7I3P6r.kYkLzT2F9U0c5V6P4E2l4yC', 'Beta', 'Member', 'user')`
                    );
                  }
                );
              }
            );
          }
        );
      }
    );

    agents.forEach(agent => {
      db.run(
        `INSERT OR REPLACE INTO agent_status 
         (agent_id, name, status, tasks_completed, performance_score) 
         VALUES (?, ?, ?, ?, ?)`,
        [agent.agent_id, agent.name, agent.status, agent.tasks_completed, agent.performance_score],
        (err) => {
          if (err) {
            console.error('Error seeding agent data:', err);
            reject(err);
            return;
          }
          
          completed++;
          if (completed === total) {
            console.log('Initial data seeded successfully');
            resolve();
          }
        }
      );
    });
  });
};

// Utility functions for database operations
export const logActivity = (type, businessName, businessId, description, status = 'success', metadata = null) => {
  const db = getDatabase();
  db.run(
    `INSERT INTO activity_log (type, business_name, business_id, description, status, metadata) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [type, businessName, businessId, description, status, JSON.stringify(metadata)],
    (err) => {
      if (err) {
        console.error('Error logging activity:', err);
      }
    }
  );
};

export const updateAgentStatus = (agentId, status, currentTask = null, incrementTasks = false) => {
  const db = getDatabase();
  let sql = `UPDATE agent_status SET status = ?, last_active = CURRENT_TIMESTAMP`;
  const params = [status];

  if (currentTask) {
    sql += `, current_task = ?`;
    params.push(currentTask);
  }

  if (incrementTasks) {
    sql += `, tasks_completed = tasks_completed + 1`;
  }

  sql += ` WHERE agent_id = ?`;
  params.push(agentId);

  db.run(sql, params, (err) => {
    if (err) {
      console.error('Error updating agent status:', err);
    }
  });
};