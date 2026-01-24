#!/usr/bin/env node

import { program } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import postgresDb from '../database/postgres.js';
import migrator from '../database/migrator.js';
import databaseMonitor from '../services/databaseMonitor.js';
import { initDatabase, getDatabaseType } from '../database/init.js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

/**
 * Database Management CLI Tool
 * Provides commands for database operations, migrations, and monitoring
 */

program
  .name('db-manager')
  .description('BizGrow AI Database Management Tool')
  .version('1.0.0');

// Database initialization command
program
  .command('init')
  .description('Initialize database and run migrations')
  .option('--force', 'Force initialization even if database exists')
  .action(async (options) => {
    try {
      console.log('🚀 Initializing database...');
      
      await initDatabase();
      
      console.log('✅ Database initialization completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      process.exit(1);
    }
  });

// Migration commands
const migrateCmd = program
  .command('migrate')
  .description('Database migration operations');

migrateCmd
  .command('up')
  .description('Run pending migrations')
  .action(async () => {
    try {
      console.log('🔄 Running database migrations...');
      
      await migrator.migrate();
      
      console.log('✅ Migrations completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  });

migrateCmd
  .command('status')
  .description('Show migration status')
  .action(async () => {
    try {
      const status = await migrator.getStatus();
      
      console.log('\n📋 Migration Status:');
      console.log(`Available migrations: ${status.available}`);
      console.log(`Executed migrations: ${status.executed}`);
      console.log(`Pending migrations: ${status.pending}`);
      
      if (status.migrations.pending.length > 0) {
        console.log('\n⏳ Pending migrations:');
        status.migrations.pending.forEach(m => {
          console.log(`  - ${m.version}: ${m.name}`);
        });
      }
      
      if (status.migrations.executed.length > 0) {
        console.log('\n✅ Executed migrations:');
        status.migrations.executed.forEach(m => {
          console.log(`  - ${m.version}: ${m.name} (${m.executed_at})`);
        });
      }
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Failed to get migration status:', error);
      process.exit(1);
    }
  });

migrateCmd
  .command('rollback <version>')
  .description('Rollback to specific migration version')
  .action(async (version) => {
    try {
      console.log(`🔄 Rolling back to version ${version}...`);
      
      await migrator.rollback(version);
      
      console.log('✅ Rollback completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      process.exit(1);
    }
  });

migrateCmd
  .command('create <name>')
  .description('Create new migration file')
  .action(async (name) => {
    try {
      const migration = await migrator.createMigration(name);
      
      console.log(`✅ Created migration: ${migration.filename}`);
      console.log(`📝 Edit file: ${migration.path}`);
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Failed to create migration:', error);
      process.exit(1);
    }
  });

migrateCmd
  .command('verify')
  .description('Verify migration integrity')
  .action(async () => {
    try {
      const verification = await migrator.verifyIntegrity();
      
      if (verification.valid) {
        console.log('✅ All migrations are valid and intact');
      } else {
        console.log('❌ Migration integrity issues found:');
        verification.issues.forEach(issue => {
          console.log(`  - ${issue.type}: ${issue.message}`);
        });
      }
      
      process.exit(verification.valid ? 0 : 1);
    } catch (error) {
      console.error('❌ Failed to verify migrations:', error);
      process.exit(1);
    }
  });

// Database health and monitoring commands
program
  .command('health')
  .description('Check database health')
  .action(async () => {
    try {
      await initDatabase();
      const dbType = getDatabaseType();
      
      console.log(`\n💚 Database Health Check (${dbType.toUpperCase()})`);
      console.log('=' .repeat(40));
      
      if (dbType === 'postgres') {
        const healthCheck = await postgresDb.performHealthCheck();
        const poolStatus = postgresDb.getPoolStatus();
        
        console.log(`Status: ${healthCheck.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        console.log(`Response Time: ${healthCheck.responseTime}ms`);
        console.log(`Pool Status: ${poolStatus.status}`);
        console.log(`Total Connections: ${poolStatus.totalCount}`);
        console.log(`Idle Connections: ${poolStatus.idleCount}`);
        console.log(`Waiting Clients: ${poolStatus.waitingCount}`);
        
        if (healthCheck.metrics) {
          console.log(`Total Queries: ${healthCheck.metrics.totalQueries}`);
          console.log(`Query Errors: ${healthCheck.metrics.queryErrors}`);
          console.log(`Avg Query Time: ${healthCheck.metrics.avgQueryTime}ms`);
        }
      } else {
        console.log('Status: ✅ SQLite Connected');
        console.log('Type: Development Database');
      }
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Health check failed:', error);
      process.exit(1);
    }
  });

program
  .command('monitor')
  .description('Start database performance monitoring')
  .option('--duration <minutes>', 'Monitoring duration in minutes', '5')
  .action(async (options) => {
    try {
      await initDatabase();
      
      const duration = parseInt(options.duration) * 60 * 1000; // Convert to milliseconds
      
      console.log(`📊 Starting database monitoring for ${options.duration} minutes...`);
      console.log('Press Ctrl+C to stop monitoring early\n');
      
      databaseMonitor.startMonitoring();
      
      // Set up graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n🛑 Stopping monitoring...');
        databaseMonitor.stopMonitoring();
        
        const report = databaseMonitor.generatePerformanceReport();
        console.log('\n📋 Final Performance Report:');
        console.log(JSON.stringify(report, null, 2));
        
        process.exit(0);
      });
      
      // Auto-stop after duration
      setTimeout(() => {
        console.log('\n⏰ Monitoring duration completed');
        databaseMonitor.stopMonitoring();
        
        const report = databaseMonitor.generatePerformanceReport();
        console.log('\n📋 Performance Report:');
        console.log(JSON.stringify(report, null, 2));
        
        process.exit(0);
      }, duration);
      
    } catch (error) {
      console.error('❌ Failed to start monitoring:', error);
      process.exit(1);
    }
  });

program
  .command('optimize')
  .description('Run database optimization')
  .action(async () => {
    try {
      await initDatabase();
      const dbType = getDatabaseType();
      
      console.log(`🔧 Optimizing ${dbType.toUpperCase()} database...`);
      
      if (dbType === 'postgres') {
        const success = await postgresDb.optimizeDatabase();
        
        if (success) {
          console.log('✅ Database optimization completed');
          
          // Get optimization recommendations
          databaseMonitor.startMonitoring();
          
          // Wait a moment for metrics collection
          setTimeout(async () => {
            const recommendations = databaseMonitor.getOptimizationRecommendations();
            
            if (recommendations.length > 0) {
              console.log('\n💡 Optimization Recommendations:');
              recommendations.forEach((rec, index) => {
                console.log(`\n${index + 1}. ${rec.title} (${rec.priority} priority)`);
                console.log(`   ${rec.description}`);
              });
            }
            
            databaseMonitor.stopMonitoring();
            process.exit(0);
          }, 2000);
        } else {
          console.log('❌ Database optimization failed');
          process.exit(1);
        }
      } else {
        console.log('ℹ️ SQLite optimization is limited. Consider upgrading to PostgreSQL for production.');
        process.exit(0);
      }
      
    } catch (error) {
      console.error('❌ Optimization failed:', error);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show database statistics')
  .action(async () => {
    try {
      await initDatabase();
      const dbType = getDatabaseType();
      
      console.log(`📊 Database Statistics (${dbType.toUpperCase()})`);
      console.log('=' .repeat(50));
      
      if (dbType === 'postgres') {
        const stats = await postgresDb.getDatabaseStats();
        
        if (stats) {
          console.log('\n📋 Table Statistics:');
          stats.tableStats.forEach(table => {
            console.log(`  ${table.tablename}:`);
            console.log(`    Live tuples: ${table.live_tuples}`);
            console.log(`    Dead tuples: ${table.dead_tuples}`);
            console.log(`    Inserts: ${table.inserts}`);
            console.log(`    Updates: ${table.updates}`);
            console.log(`    Deletes: ${table.deletes}`);
            console.log(`    Sequential scans: ${table.sequential_scans}`);
            console.log(`    Index scans: ${table.index_scans}`);
            console.log('');
          });
          
          if (stats.indexStats.length > 0) {
            console.log('🔍 Index Usage:');
            stats.indexStats.slice(0, 10).forEach(index => {
              console.log(`  ${index.indexname}: ${index.idx_tup_read} reads, ${index.idx_tup_fetch} fetches`);
            });
          }
        }
      } else {
        console.log('ℹ️ Limited statistics available for SQLite');
        console.log('Consider upgrading to PostgreSQL for detailed statistics');
      }
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Failed to get statistics:', error);
      process.exit(1);
    }
  });

// Connection testing
program
  .command('test-connection')
  .description('Test database connection')
  .action(async () => {
    try {
      console.log('🔌 Testing database connection...');
      
      await initDatabase();
      const dbType = getDatabaseType();
      
      if (dbType === 'postgres') {
        const testResult = await postgresDb.testConnection();
        if (testResult) {
          console.log('✅ PostgreSQL connection successful');
        }
      } else {
        console.log('✅ SQLite connection successful');
      }
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}