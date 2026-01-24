import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import postgresDb from './postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Migration System
 * Handles schema migrations with rollback support and version tracking
 */
class DatabaseMigrator {
  constructor() {
    this.migrationsPath = path.join(__dirname, 'migrations');
    this.db = postgresDb;
  }

  /**
   * Initialize migration system
   */
  async init() {
    try {
      // Ensure database connection
      if (!this.db.isConnected) {
        await this.db.init();
      }

      // Create migrations tracking table
      await this.createMigrationsTable();
      
      console.log('✅ Migration system initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize migration system:', error);
      throw error;
    }
  }

  /**
   * Create migrations tracking table
   */
  async createMigrationsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER,
        checksum VARCHAR(64),
        rollback_sql TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at ON schema_migrations(executed_at DESC);
    `;

    await this.db.query(sql);
    console.log('✅ Schema migrations table ready');
  }

  /**
   * Get list of available migration files
   */
  async getAvailableMigrations() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      const migrations = files
        .filter(file => file.endsWith('.sql'))
        .map(file => {
          const match = file.match(/^(\d+)_(.+)\.sql$/);
          if (match) {
            return {
              version: match[1],
              name: match[2],
              filename: file,
              path: path.join(this.migrationsPath, file)
            };
          }
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => parseInt(a.version) - parseInt(b.version));

      return migrations;
    } catch (error) {
      console.error('❌ Failed to read migrations directory:', error);
      return [];
    }
  }

  /**
   * Get list of executed migrations
   */
  async getExecutedMigrations() {
    try {
      const result = await this.db.query(
        'SELECT version, name, executed_at, execution_time_ms FROM schema_migrations ORDER BY version'
      );
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get executed migrations:', error);
      return [];
    }
  }

  /**
   * Calculate file checksum for integrity verification
   */
  async calculateChecksum(filePath) {
    const crypto = await import('crypto');
    const content = await fs.readFile(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Execute a single migration
   */
  async executeMigration(migration) {
    const startTime = Date.now();
    
    try {
      console.log(`🚀 Executing migration ${migration.version}: ${migration.name}`);
      
      // Read migration file
      const sql = await fs.readFile(migration.path, 'utf8');
      const checksum = await this.calculateChecksum(migration.path);
      
      // Execute migration in transaction
      await this.db.transaction(async (client) => {
        // Execute the migration SQL
        await client.query(sql);
        
        // Record migration execution
        const executionTime = Date.now() - startTime;
        await client.query(
          `INSERT INTO schema_migrations (version, name, execution_time_ms, checksum) 
           VALUES ($1, $2, $3, $4)`,
          [migration.version, migration.name, executionTime, checksum]
        );
        
        console.log(`✅ Migration ${migration.version} completed in ${executionTime}ms`);
      });
      
      return true;
    } catch (error) {
      console.error(`❌ Migration ${migration.version} failed:`, error);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    try {
      await this.init();
      
      const availableMigrations = await this.getAvailableMigrations();
      const executedMigrations = await this.getExecutedMigrations();
      
      const executedVersions = new Set(executedMigrations.map(m => m.version));
      const pendingMigrations = availableMigrations.filter(m => !executedVersions.has(m.version));
      
      if (pendingMigrations.length === 0) {
        console.log('✅ No pending migrations');
        return true;
      }
      
      console.log(`📋 Found ${pendingMigrations.length} pending migrations`);
      
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }
      
      console.log('🎉 All migrations completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Migration process failed:', error);
      throw error;
    }
  }

  /**
   * Rollback to a specific migration version
   */
  async rollback(targetVersion) {
    try {
      const executedMigrations = await this.getExecutedMigrations();
      const migrationsToRollback = executedMigrations
        .filter(m => parseInt(m.version) > parseInt(targetVersion))
        .sort((a, b) => parseInt(b.version) - parseInt(a.version)); // Reverse order
      
      if (migrationsToRollback.length === 0) {
        console.log(`✅ Already at or before version ${targetVersion}`);
        return true;
      }
      
      console.log(`🔄 Rolling back ${migrationsToRollback.length} migrations to version ${targetVersion}`);
      
      for (const migration of migrationsToRollback) {
        await this.rollbackMigration(migration);
      }
      
      console.log('✅ Rollback completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Rollback a single migration
   */
  async rollbackMigration(migration) {
    try {
      console.log(`🔄 Rolling back migration ${migration.version}: ${migration.name}`);
      
      // Get rollback SQL if available
      const rollbackResult = await this.db.query(
        'SELECT rollback_sql FROM schema_migrations WHERE version = $1',
        [migration.version]
      );
      
      if (rollbackResult.rows.length === 0) {
        throw new Error(`Migration ${migration.version} not found in database`);
      }
      
      const rollbackSql = rollbackResult.rows[0].rollback_sql;
      
      if (!rollbackSql) {
        console.warn(`⚠️ No rollback SQL available for migration ${migration.version}`);
        console.warn('Manual rollback may be required');
        return false;
      }
      
      // Execute rollback in transaction
      await this.db.transaction(async (client) => {
        await client.query(rollbackSql);
        await client.query(
          'DELETE FROM schema_migrations WHERE version = $1',
          [migration.version]
        );
      });
      
      console.log(`✅ Migration ${migration.version} rolled back successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to rollback migration ${migration.version}:`, error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getStatus() {
    try {
      const availableMigrations = await this.getAvailableMigrations();
      const executedMigrations = await this.getExecutedMigrations();
      
      const executedVersions = new Set(executedMigrations.map(m => m.version));
      const pendingMigrations = availableMigrations.filter(m => !executedVersions.has(m.version));
      
      return {
        available: availableMigrations.length,
        executed: executedMigrations.length,
        pending: pendingMigrations.length,
        migrations: {
          executed: executedMigrations,
          pending: pendingMigrations.map(m => ({
            version: m.version,
            name: m.name,
            filename: m.filename
          }))
        }
      };
    } catch (error) {
      console.error('❌ Failed to get migration status:', error);
      return null;
    }
  }

  /**
   * Verify migration integrity
   */
  async verifyIntegrity() {
    try {
      const executedMigrations = await this.getExecutedMigrations();
      const availableMigrations = await this.getAvailableMigrations();
      
      const issues = [];
      
      for (const executed of executedMigrations) {
        const available = availableMigrations.find(m => m.version === executed.version);
        
        if (!available) {
          issues.push({
            type: 'missing_file',
            version: executed.version,
            message: `Migration file for version ${executed.version} not found`
          });
          continue;
        }
        
        // Check checksum if available
        if (executed.checksum) {
          const currentChecksum = await this.calculateChecksum(available.path);
          if (currentChecksum !== executed.checksum) {
            issues.push({
              type: 'checksum_mismatch',
              version: executed.version,
              message: `Migration file ${executed.version} has been modified since execution`
            });
          }
        }
      }
      
      return {
        valid: issues.length === 0,
        issues
      };
    } catch (error) {
      console.error('❌ Failed to verify migration integrity:', error);
      return { valid: false, issues: [{ type: 'error', message: error.message }] };
    }
  }

  /**
   * Create a new migration file template
   */
  async createMigration(name) {
    try {
      const availableMigrations = await this.getAvailableMigrations();
      const nextVersion = availableMigrations.length > 0 
        ? String(parseInt(availableMigrations[availableMigrations.length - 1].version) + 1).padStart(3, '0')
        : '001';
      
      const filename = `${nextVersion}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
      const filePath = path.join(this.migrationsPath, filename);
      
      const template = `-- Migration: ${name}
-- Version: ${nextVersion}
-- Created: ${new Date().toISOString()}

-- Forward migration
-- Add your SQL statements here


-- Rollback migration (optional)
-- Add rollback SQL statements as comments for manual rollback
-- Example:
-- DROP TABLE IF EXISTS new_table;
-- ALTER TABLE existing_table DROP COLUMN new_column;
`;
      
      await fs.writeFile(filePath, template);
      console.log(`✅ Created migration file: ${filename}`);
      
      return {
        version: nextVersion,
        name,
        filename,
        path: filePath
      };
    } catch (error) {
      console.error('❌ Failed to create migration file:', error);
      throw error;
    }
  }
}

// Singleton instance
const migrator = new DatabaseMigrator();

export default migrator;