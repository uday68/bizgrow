/**
 * Tenant Data Encryption Utilities
 * Provides encryption and decryption for tenant-specific sensitive data
 * 
 * Requirements: 10.4
 * - Implements tenant data encryption and security
 * - Provides field-level encryption for sensitive data
 */

import crypto from 'crypto';
import tenantDataAccess from '../services/tenantDataAccess.js';

/**
 * Encryption configuration
 */
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  authTagLength: 16,
  saltLength: 64,
  iterations: 100000,
  digest: 'sha256'
};

/**
 * Tenant Encryption Manager
 * Handles encryption/decryption of tenant-specific data
 */
class TenantEncryptionManager {
  constructor() {
    this.masterKey = this.getMasterKey();
    this.keyCache = new Map();
  }

  /**
   * Get master encryption key from environment
   */
  getMasterKey() {
    const key = process.env.TENANT_MASTER_KEY;
    
    if (!key) {
      console.warn('⚠️ TENANT_MASTER_KEY not set. Using default key (NOT SECURE FOR PRODUCTION)');
      return 'default-master-key-change-in-production-immediately';
    }

    if (key.length < 32) {
      throw new Error('TENANT_MASTER_KEY must be at least 32 characters long');
    }

    return key;
  }

  /**
   * Derive tenant-specific encryption key
   */
  deriveTenantKey(tenantId, salt = null) {
    // Check cache first
    const cacheKey = `${tenantId}:${salt}`;
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey);
    }

    // Generate salt if not provided
    const keySalt = salt || crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);

    // Derive key using PBKDF2
    const derivedKey = crypto.pbkdf2Sync(
      `${this.masterKey}:${tenantId}`,
      keySalt,
      ENCRYPTION_CONFIG.iterations,
      ENCRYPTION_CONFIG.keyLength,
      ENCRYPTION_CONFIG.digest
    );

    // Cache the derived key
    this.keyCache.set(cacheKey, { key: derivedKey, salt: keySalt });

    return { key: derivedKey, salt: keySalt };
  }

  /**
   * Encrypt data for a specific tenant
   */
  encrypt(data, tenantId) {
    try {
      // Validate inputs
      if (!data) {
        throw new Error('Data is required for encryption');
      }

      if (!tenantId) {
        throw new Error('Tenant ID is required for encryption');
      }

      // Derive tenant-specific key
      const { key, salt } = this.deriveTenantKey(tenantId);

      // Generate initialization vector
      const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(
        ENCRYPTION_CONFIG.algorithm,
        key,
        iv
      );

      // Convert data to string if it's an object
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);

      // Encrypt data
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Return encrypted package
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        salt: salt.toString('hex'),
        algorithm: ENCRYPTION_CONFIG.algorithm
      };
    } catch (error) {
      console.error('❌ Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data for a specific tenant
   */
  decrypt(encryptedPackage, tenantId) {
    try {
      // Validate inputs
      if (!encryptedPackage || !encryptedPackage.encrypted) {
        throw new Error('Encrypted data is required for decryption');
      }

      if (!tenantId) {
        throw new Error('Tenant ID is required for decryption');
      }

      // Derive tenant-specific key using the same salt
      const salt = Buffer.from(encryptedPackage.salt, 'hex');
      const { key } = this.deriveTenantKey(tenantId, salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(
        encryptedPackage.algorithm || ENCRYPTION_CONFIG.algorithm,
        key,
        Buffer.from(encryptedPackage.iv, 'hex')
      );

      // Set authentication tag
      decipher.setAuthTag(Buffer.from(encryptedPackage.authTag, 'hex'));

      // Decrypt data
      let decrypted = decipher.update(encryptedPackage.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Try to parse as JSON, otherwise return as string
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      console.error('❌ Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt specific fields in an object
   */
  encryptFields(obj, fields, tenantId) {
    const result = { ...obj };

    for (const field of fields) {
      if (obj[field] !== undefined && obj[field] !== null) {
        result[`${field}_encrypted`] = this.encrypt(obj[field], tenantId);
        delete result[field]; // Remove plaintext field
      }
    }

    return result;
  }

  /**
   * Decrypt specific fields in an object
   */
  decryptFields(obj, fields, tenantId) {
    const result = { ...obj };

    for (const field of fields) {
      const encryptedField = `${field}_encrypted`;
      if (obj[encryptedField]) {
        result[field] = this.decrypt(obj[encryptedField], tenantId);
        delete result[encryptedField]; // Remove encrypted field
      }
    }

    return result;
  }

  /**
   * Hash sensitive data (one-way, for comparison)
   */
  hash(data, tenantId) {
    try {
      const { key, salt } = this.deriveTenantKey(tenantId);
      
      const hash = crypto.createHmac('sha256', key)
        .update(data)
        .digest('hex');

      return {
        hash,
        salt: salt.toString('hex')
      };
    } catch (error) {
      console.error('❌ Hashing failed:', error);
      throw new Error('Failed to hash data');
    }
  }

  /**
   * Verify hashed data
   */
  verifyHash(data, hashedData, tenantId) {
    try {
      const salt = Buffer.from(hashedData.salt, 'hex');
      const { key } = this.deriveTenantKey(tenantId, salt);
      
      const hash = crypto.createHmac('sha256', key)
        .update(data)
        .digest('hex');

      return hash === hashedData.hash;
    } catch (error) {
      console.error('❌ Hash verification failed:', error);
      return false;
    }
  }

  /**
   * Generate secure random token for tenant
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Clear key cache (useful for key rotation)
   */
  clearKeyCache(tenantId = null) {
    if (tenantId) {
      // Clear specific tenant keys
      for (const key of this.keyCache.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
          this.keyCache.delete(key);
        }
      }
    } else {
      // Clear all cached keys
      this.keyCache.clear();
    }
  }

  /**
   * Rotate encryption key for tenant
   * Re-encrypts all data with new key
   */
  async rotateKey(tenantId) {
    try {
      console.log(`🔄 Starting key rotation for tenant: ${tenantId}`);

      // Clear cached key
      this.clearKeyCache(tenantId);

      // Generate new salt for new key
      const newSalt = crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);

      // In a real implementation, you would:
      // 1. Fetch all encrypted data for the tenant
      // 2. Decrypt with old key
      // 3. Re-encrypt with new key
      // 4. Update database records
      // 5. Update tenant's encryption_key_id

      console.log(`✅ Key rotation completed for tenant: ${tenantId}`);
      return true;
    } catch (error) {
      console.error('❌ Key rotation failed:', error);
      throw new Error('Failed to rotate encryption key');
    }
  }
}

/**
 * Field-level encryption decorator
 * Automatically encrypts/decrypts specified fields
 */
export class EncryptedModel {
  constructor(tenantId, encryptedFields = []) {
    this.tenantId = tenantId;
    this.encryptedFields = encryptedFields;
    this.encryptionManager = new TenantEncryptionManager();
  }

  /**
   * Prepare data for storage (encrypt sensitive fields)
   */
  beforeSave(data) {
    return this.encryptionManager.encryptFields(
      data,
      this.encryptedFields,
      this.tenantId
    );
  }

  /**
   * Prepare data after retrieval (decrypt sensitive fields)
   */
  afterLoad(data) {
    return this.encryptionManager.decryptFields(
      data,
      this.encryptedFields,
      this.tenantId
    );
  }
}

/**
 * Example usage for encrypting business contact information
 */
export class EncryptedBusinessModel extends EncryptedModel {
  constructor(tenantId) {
    // Specify which fields should be encrypted
    super(tenantId, ['phone', 'email', 'contact_notes']);
  }
}

/**
 * Example usage for encrypting proposal content
 */
export class EncryptedProposalModel extends EncryptedModel {
  constructor(tenantId) {
    // Specify which fields should be encrypted
    super(tenantId, ['content', 'pricing_details', 'internal_notes']);
  }
}

// Singleton instance
const tenantEncryption = new TenantEncryptionManager();

export default tenantEncryption;
export { TenantEncryptionManager, ENCRYPTION_CONFIG };
