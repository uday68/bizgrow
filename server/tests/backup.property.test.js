// Feature: production-upgrade, Property 16: Comprehensive Backup System
// **Validates: Requirements 6.1, 6.4, 6.7**

import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import backupService from '../services/backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Property test configuration
const propertyTestConfig = {
  numRuns: 20, // Reduced for faster test execution with actual file operations
  timeout: 30000, // Longer timeout for backup operations
  verbose: false,
  seed: 42 // Fixed seed for reproducible tests
};

// Custom generators for testing
const backupLabelGenerator = fc.oneof(
  fc.constant('manual'),
  fc.constant('scheduled'),
  fc.constant('test'),
  fc.stringOf(fc.constantFrom('a', 'b', 'c', '1', '2', '3', '-', '_'), { minLength: 1, maxLength: 20 })
);

const retentionDaysGenerator = fc.integer({ min: 1, max: 90 });

// Helper function to ensure test database exists
function ensureTestDatabase() {
  const dbPath = path.join(__dirname, '../database/bizgrow.db');
  const dbDir = path.dirname(dbPath);
  
  // Ensure database directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Create a minimal test database if it doesn't exist
  if (!fs.existsSync(dbPath)) {
    // Create an empty file as a placeholder
    fs.writeFileSync(dbPath, '');
  }
  
  // Update backup service to use correct path
  backupService.dbPath = dbPath;
  
  return dbPath;
}

// Helper function to clean up test backups
function cleanupTestBackups() {
  const backupDir = backupService.backupDir;
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir);
    for (const file of files) {
      if (file.includes('test') || file.includes('pitr')) {
        try {
          fs.unlinkSync(path.join(backupDir, file));
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  }
}

// Property 16: Comprehensive Backup System
// For any backup operation, the Backup_System should create automated daily backups 
// with 30-day retention, verify integrity through restore testing, and support 
// point-in-time recovery
describe('Property 16: Comprehensive Backup System', () => {
  
  beforeAll(() => {
    // Ensure test database and backup directory exist
    ensureTestDatabase();
    backupService.ensureBackupDirectory();
  });

  afterEach(() => {
    // Clean up test backups after each test
    cleanupTestBackups();
  });

  test('Backup creation should always produce valid, verifiable backups', async () => {
    await fc.assert(
      fc.asyncProperty(backupLabelGenerator, async (label) => {
        // Create a point-in-time recovery backup
        const backup = await backupService.createPITRBackup(label);
        
        // Backup should always have required properties
        expect(backup).toHaveProperty('name');
        expect(backup).toHaveProperty('path');
        expect(backup).toHaveProperty('size');
        expect(backup).toHaveProperty('timestamp');
        expect(backup).toHaveProperty('duration');
        expect(backup).toHaveProperty('verified');
        expect(backup).toHaveProperty('type');
        
        // Backup should be verified
        expect(backup.verified).toBe(true);
        
        // Backup file should exist
        expect(fs.existsSync(backup.path)).toBe(true);
        
        // Backup should have content (non-zero size)
        expect(backup.size).toBeGreaterThan(0);
        
        // Backup name should include the label
        expect(backup.name).toContain(label);
        
        // Backup timestamp should be valid ISO string
        expect(() => new Date(backup.timestamp)).not.toThrow();
        expect(new Date(backup.timestamp).getTime()).toBeGreaterThan(0);
        
        // Duration should be positive
        expect(backup.duration).toBeGreaterThan(0);
        
        // Type should be valid
        expect(['sqlite', 'postgresql']).toContain(backup.type);
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Backup verification should consistently validate backup integrity', async () => {
    await fc.assert(
      fc.asyncProperty(backupLabelGenerator, async (label) => {
        // Create backup
        const backup = await backupService.createPITRBackup(label);
        
        // Verify backup multiple times - should always return same result
        const verification1 = await backupService.verifyBackup(backup.path);
        const verification2 = await backupService.verifyBackup(backup.path);
        const verification3 = await backupService.verifyBackup(backup.path);
        
        // All verifications should be consistent
        expect(verification1).toBe(verification2);
        expect(verification2).toBe(verification3);
        
        // Valid backup should always verify successfully
        expect(verification1).toBe(true);
        
        // File should still exist after verification
        expect(fs.existsSync(backup.path)).toBe(true);
        
        // File size should remain unchanged
        const stats = fs.statSync(backup.path);
        expect(stats.size).toBe(backup.size);
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Backup listing should always return consistent, sorted results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(backupLabelGenerator, { minLength: 1, maxLength: 5 }),
        async (labels) => {
          // Create multiple backups
          const createdBackups = [];
          for (const label of labels) {
            const backup = await backupService.createPITRBackup(label);
            createdBackups.push(backup);
            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // List backups
          const backupList = backupService.listBackups();
          
          // Should return array
          expect(Array.isArray(backupList)).toBe(true);
          
          // Should contain at least the backups we created
          expect(backupList.length).toBeGreaterThanOrEqual(createdBackups.length);
          
          // Each backup should have required properties
          for (const backup of backupList) {
            expect(backup).toHaveProperty('name');
            expect(backup).toHaveProperty('path');
            expect(backup).toHaveProperty('size');
            expect(backup).toHaveProperty('created');
            expect(backup).toHaveProperty('age');
            
            // Size should be positive
            expect(backup.size).toBeGreaterThan(0);
            
            // Age should be non-negative
            expect(backup.age).toBeGreaterThanOrEqual(0);
            
            // Created should be valid date (check if it has getTime method and returns valid timestamp)
            expect(typeof backup.created.getTime).toBe('function');
            expect(backup.created.getTime()).toBeGreaterThan(0);
          }
          
          // Backups should be sorted by creation date (newest first)
          for (let i = 0; i < backupList.length - 1; i++) {
            expect(backupList[i].created.getTime()).toBeGreaterThanOrEqual(
              backupList[i + 1].created.getTime()
            );
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Point-in-time recovery should create backups with proper labeling', async () => {
    await fc.assert(
      fc.asyncProperty(backupLabelGenerator, async (label) => {
        // Create PITR backup
        const backup = await backupService.createPITRBackup(label);
        
        // Backup name should include 'pitr' prefix
        expect(backup.name).toMatch(/^pitr-/);
        
        // Backup name should include the label
        expect(backup.name).toContain(label);
        
        // Backup name should include timestamp
        expect(backup.name).toMatch(/\d{4}-\d{2}-\d{2}/);
        
        // Should be able to find the backup by name
        const foundPath = backupService.findBackupFile(backup.name);
        expect(foundPath).toBe(backup.path);
        
        // Backup should be in the list
        const backupList = backupService.listBackups();
        const found = backupList.some(b => b.name === path.basename(backup.path));
        expect(found).toBe(true);
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Backup service status should always reflect accurate state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(backupLabelGenerator, { minLength: 0, maxLength: 3 }),
        async (labels) => {
          // Create some backups
          for (const label of labels) {
            await backupService.createPITRBackup(label);
          }
          
          // Get status
          const status = backupService.getStatus();
          
          // Status should have required properties
          expect(status).toHaveProperty('isRunning');
          expect(status).toHaveProperty('lastBackup');
          expect(status).toHaveProperty('backupDir');
          expect(status).toHaveProperty('retentionDays');
          expect(status).toHaveProperty('schedule');
          expect(status).toHaveProperty('totalBackups');
          expect(status).toHaveProperty('backupHistory');
          
          // isRunning should be boolean
          expect(typeof status.isRunning).toBe('boolean');
          
          // backupDir should be valid path
          expect(typeof status.backupDir).toBe('string');
          expect(status.backupDir.length).toBeGreaterThan(0);
          
          // retentionDays should be positive number
          expect(typeof status.retentionDays).toBe('number');
          expect(status.retentionDays).toBeGreaterThan(0);
          
          // schedule should be valid cron expression
          expect(typeof status.schedule).toBe('string');
          expect(status.schedule.length).toBeGreaterThan(0);
          
          // totalBackups should be non-negative
          expect(typeof status.totalBackups).toBe('number');
          expect(status.totalBackups).toBeGreaterThanOrEqual(0);
          
          // backupHistory should be array
          expect(Array.isArray(status.backupHistory)).toBe(true);
          
          // If we created backups, lastBackup should be set
          if (labels.length > 0) {
            expect(status.lastBackup).not.toBeNull();
            expect(status.lastBackup).toHaveProperty('name');
            expect(status.lastBackup).toHaveProperty('verified');
            expect(status.lastBackup.verified).toBe(true);
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Backup integrity verification should detect corrupted backups', async () => {
    await fc.assert(
      fc.asyncProperty(backupLabelGenerator, async (label) => {
        // Create valid backup
        const backup = await backupService.createPITRBackup(label);
        
        // Verify it's valid
        const validCheck = await backupService.verifyBackup(backup.path);
        expect(validCheck).toBe(true);
        
        // Create a corrupted backup by creating an empty file
        const corruptedPath = backup.path + '.corrupted';
        fs.writeFileSync(corruptedPath, ''); // Empty file
        
        // Verification should fail for empty backup
        const corruptedCheck = await backupService.verifyBackup(corruptedPath);
        expect(corruptedCheck).toBe(false);
        
        // Clean up corrupted file
        fs.unlinkSync(corruptedPath);
        
        // Original backup should still be valid
        const stillValid = await backupService.verifyBackup(backup.path);
        expect(stillValid).toBe(true);
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Backup verification should reject non-existent backups', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringOf(fc.constantFrom('a', 'b', 'c', '/', '.'), { minLength: 5, maxLength: 50 }),
        async (fakePath) => {
          // Ensure path doesn't exist
          const nonExistentPath = path.join(backupService.backupDir, 'nonexistent-' + fakePath);
          
          // Verification should fail for non-existent file
          const result = await backupService.verifyBackup(nonExistentPath);
          expect(result).toBe(false);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  test('Multiple backups should maintain independence and integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(backupLabelGenerator, { minLength: 2, maxLength: 4 }),
        async (labels) => {
          // Create multiple backups
          const backups = [];
          for (const label of labels) {
            const backup = await backupService.createPITRBackup(label);
            backups.push(backup);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // All backups should be independent
          const paths = backups.map(b => b.path);
          const uniquePaths = new Set(paths);
          expect(uniquePaths.size).toBe(backups.length);
          
          // All backups should exist
          for (const backup of backups) {
            expect(fs.existsSync(backup.path)).toBe(true);
          }
          
          // All backups should verify successfully
          for (const backup of backups) {
            const isValid = await backupService.verifyBackup(backup.path);
            expect(isValid).toBe(true);
          }
          
          // Each backup should have unique name
          const names = backups.map(b => b.name);
          const uniqueNames = new Set(names);
          expect(uniqueNames.size).toBe(backups.length);
          
          // Each backup should have unique timestamp
          const timestamps = backups.map(b => b.timestamp);
          const uniqueTimestamps = new Set(timestamps);
          expect(uniqueTimestamps.size).toBe(backups.length);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  }, 10000); // 10 second timeout

  test('Backup test procedure should validate backup and restore capability', async () => {
    // This test validates the backup/restore testing capability
    const result = await backupService.testBackupRestore();
    
    // Test should complete
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('backup');
    
    // Test should succeed
    expect(result.success).toBe(true);
    
    // Backup should be created and verified
    expect(result.backup).toHaveProperty('name');
    expect(result.backup).toHaveProperty('verified');
    expect(result.backup.verified).toBe(true);
    
    // Backup file should exist
    expect(fs.existsSync(result.backup.path)).toBe(true);
  });

  test('Backup findBackupFile should consistently locate backups', async () => {
    await fc.assert(
      fc.asyncProperty(backupLabelGenerator, async (label) => {
        // Create backup
        const backup = await backupService.createPITRBackup(label);
        
        // Should find by exact name
        const foundByName = backupService.findBackupFile(backup.name);
        expect(foundByName).toBe(backup.path);
        
        // Should find by name prefix
        const namePrefix = backup.name.substring(0, 10);
        const foundByPrefix = backupService.findBackupFile(namePrefix);
        expect(foundByPrefix).toBeTruthy();
        expect(foundByPrefix).toContain(namePrefix);
        
        // Should not find non-existent backup
        const notFound = backupService.findBackupFile('nonexistent-backup-xyz-123');
        expect(notFound).toBeNull();
        
        return true;
      }),
      propertyTestConfig
    );
  });

  test('Backup system should handle concurrent backup operations safely', async () => {
    // Create multiple backups concurrently
    const labels = ['concurrent-1', 'concurrent-2', 'concurrent-3'];
    const backupPromises = labels.map(label => 
      backupService.createPITRBackup(label)
    );
    
    // All should complete successfully
    const backups = await Promise.all(backupPromises);
    
    // Should have created all backups
    expect(backups.length).toBe(labels.length);
    
    // All should be valid
    for (const backup of backups) {
      expect(backup.verified).toBe(true);
      expect(fs.existsSync(backup.path)).toBe(true);
      
      // Verify integrity
      const isValid = await backupService.verifyBackup(backup.path);
      expect(isValid).toBe(true);
    }
    
    // All should have unique names
    const names = backups.map(b => b.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(backups.length);
  });
});

// Export for test runner
export { propertyTestConfig };
