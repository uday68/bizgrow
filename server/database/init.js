import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

export const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(join(__dirname, 'bizgrow.db'), (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      
      console.log('Connected to SQLite database');
      createTables().then(resolve).catch(reject);
    });
  });
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

const createTables = () => {
  return new Promise((resolve, reject) => {
    const tables = [
      // Businesses table
      `CREATE TABLE IF NOT EXISTS businesses (
        id TEXT PRIMARY KEY,
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
          seedInitialData().then(resolve).catch(reject);
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