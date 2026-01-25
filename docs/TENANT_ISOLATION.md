# Tenant Data Isolation Implementation

## Overview

This document describes the multi-tenant architecture implementation for BizGrow AI, providing strict data isolation, tenant-specific access controls, and comprehensive security measures.

## Requirements Addressed

- **Requirement 10.1**: Tenant isolation for data and configuration
- **Requirement 10.2**: Tenant-specific access controls
- **Requirement 10.4**: Strict data separation during processing

## Architecture Components

### 1. Database Schema (005_tenant_isolation_schema.sql)

#### Core Tables

**tenants**
- Primary tenant management table
- Stores tenant configuration, quotas, and settings
- Includes subscription management and billing information
- Supports tenant-specific feature flags and branding

**tenant_audit_log**
- Security audit trail for all tenant data access
- Tracks create, read, update, delete operations
- Records IP addresses and user agents for security analysis
- Supports severity levels for alert prioritization

**tenant_usage_metrics**
- Tracks resource usage for quota enforcement
- Supports billing and analytics
- Time-series data for trend analysis

#### Row-Level Security (RLS)

PostgreSQL Row-Level Security policies ensure automatic data isolation:

```sql
-- Example: Users can only access data from their tenant
CREATE POLICY tenant_isolation_users ON users
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
```

All tenant-aware tables have RLS policies enabled:
- users
- businesses
- proposals
- projects
- activity_log
- tenant_audit_log

#### Database Functions

**set_tenant_context(tenant_id)**
- Sets PostgreSQL session variable for RLS
- Must be called before any tenant-scoped queries

**validate_tenant_access(tenant_id, user_id)**
- Validates if a user has access to a specific tenant
- Returns boolean result

**check_tenant_quota(tenant_id, quota_type)**
- Checks if tenant is within quota limits
- Prevents operations that would exceed quotas

**update_tenant_usage()**
- Trigger function that automatically updates usage counters
- Maintains accurate quota tracking

### 2. Tenant Data Access Layer (tenantDataAccess.js)

#### Core Functionality

**Context Management**
```javascript
// Set tenant context for all subsequent operations
await tenantDataAccess.setTenantContext(tenantId, userId);

// All queries are now automatically scoped to this tenant
const businesses = await tenantDataAccess.query('SELECT * FROM businesses');

// Clear context when done
await tenantDataAccess.clearTenantContext();
```

**Tenant Operations**
- `getTenant(tenantId)` - Retrieve tenant information
- `getTenantBySlug(slug)` - Find tenant by URL slug
- `createTenant(data)` - Create new tenant with quotas
- `validateTenantAccess(tenantId, userId)` - Verify user access
- `checkTenantQuota(tenantId, quotaType)` - Enforce quotas

**Transaction Support**
```javascript
await tenantDataAccess.transaction(tenantId, async (client) => {
  // All operations in this callback are tenant-scoped
  await client.query('INSERT INTO businesses ...');
  await client.query('INSERT INTO proposals ...');
});
```

**Audit Logging**
```javascript
await tenantDataAccess.logAuditEvent(
  tenantId,
  userId,
  'create',
  'business',
  businessId,
  { details: 'Additional context' }
);
```

### 3. Tenant Isolation Middleware (tenantIsolation.js)

#### Tenant Identification

The middleware supports multiple tenant identification methods:

1. **JWT Token** - Tenant ID in token claims (recommended)
2. **Custom Header** - `X-Tenant-ID` header
3. **Subdomain** - `tenant.example.com` format
4. **Query Parameter** - `?tenantId=xxx` (development only)

#### Middleware Functions

**tenantIsolation**
- Primary middleware for tenant context establishment
- Validates tenant exists and is active
- Verifies user has access to tenant
- Checks IP restrictions if configured
- Sets tenant context for request

**enforceQuota(quotaType)**
- Checks quota before allowing operations
- Returns 429 error if quota exceeded
- Supports: 'users', 'businesses', 'proposals'

**requireFeature(featureName)**
- Checks if feature is enabled for tenant
- Supports tenant-specific feature flags
- Returns 403 if feature not available

**requireTenantRole(roles)**
- Validates user has required tenant role
- Supports: 'owner', 'admin', 'member', 'viewer'
- Hierarchical permission checking

**cleanupTenantContext**
- Clears tenant context after request completion
- Prevents context leakage between requests

#### Usage Example

```javascript
import { 
  tenantIsolation, 
  enforceQuota, 
  requireTenantRole 
} from './middleware/tenantIsolation.js';

// Apply to routes
router.post('/businesses',
  authenticate,              // Verify user authentication
  tenantIsolation,          // Establish tenant context
  enforceQuota('businesses'), // Check quota
  requireTenantRole(['admin', 'member']), // Check permissions
  async (req, res) => {
    // req.tenant contains tenant information
    // req.tenantId contains tenant ID
    // All database queries are automatically scoped
  }
);
```

### 4. Tenant Encryption (tenantEncryption.js)

#### Encryption Features

**Field-Level Encryption**
```javascript
// Encrypt sensitive fields
const encrypted = tenantEncryption.encrypt(sensitiveData, tenantId);

// Decrypt when needed
const decrypted = tenantEncryption.decrypt(encrypted, tenantId);
```

**Automatic Field Encryption**
```javascript
// Define encrypted model
class EncryptedBusinessModel extends EncryptedModel {
  constructor(tenantId) {
    super(tenantId, ['phone', 'email', 'contact_notes']);
  }
}

// Use in application
const model = new EncryptedBusinessModel(tenantId);
const encryptedData = model.beforeSave(businessData);
const decryptedData = model.afterLoad(storedData);
```

**Key Management**
- Tenant-specific encryption keys derived from master key
- PBKDF2 key derivation with 100,000 iterations
- AES-256-GCM encryption algorithm
- Automatic key caching for performance
- Support for key rotation

**Security Features**
- Authentication tags for data integrity
- Unique initialization vectors per encryption
- Salt-based key derivation
- Secure random token generation

### 5. Tenant Management Routes (tenants.js)

#### API Endpoints

**GET /api/tenants/current**
- Get current tenant information
- Returns tenant details and configuration

**GET /api/tenants/usage**
- Get tenant usage statistics
- Shows current usage vs. quotas

**PUT /api/tenants/settings**
- Update tenant settings (owner/admin only)
- Supports feature flags, branding, custom settings

**GET /api/tenants/metrics**
- Get tenant metrics over time period
- Historical usage data for analytics

**GET /api/tenants/audit-log**
- Retrieve tenant audit log
- Filter by action, severity, date range

**POST /api/tenants/users**
- Create new tenant user
- Enforces user quota
- Requires owner/admin role

**POST /api/tenants**
- Create new tenant (system admin only)
- Sets up tenant with initial configuration

## Security Measures

### 1. Data Isolation

- **Row-Level Security**: PostgreSQL RLS policies enforce automatic isolation
- **Context Validation**: Every request validates tenant context
- **Query Scoping**: All queries automatically filtered by tenant_id
- **Transaction Isolation**: Tenant context maintained within transactions

### 2. Access Control

- **User-Tenant Association**: Users belong to specific tenants
- **Role-Based Permissions**: Tenant-specific roles (owner, admin, member, viewer)
- **IP Restrictions**: Optional IP whitelist per tenant
- **MFA Support**: Tenant-level MFA requirements

### 3. Encryption

- **Data at Rest**: Field-level encryption for sensitive data
- **Tenant-Specific Keys**: Each tenant has unique encryption key
- **Key Derivation**: Secure PBKDF2 key derivation
- **Data Integrity**: Authentication tags prevent tampering

### 4. Audit Trail

- **Comprehensive Logging**: All data access logged
- **Security Events**: Failed access attempts tracked
- **Tamper-Proof**: Audit logs protected by RLS
- **Compliance Support**: Detailed audit trail for compliance

## Quota Management

### Quota Types

- **Users**: Maximum number of users per tenant
- **Businesses**: Maximum number of businesses
- **Proposals**: Maximum number of proposals
- **Storage**: Maximum storage in MB

### Plan-Based Quotas

```javascript
free: {
  maxUsers: 5,
  maxBusinesses: 100,
  maxProposals: 50,
  maxStorageMb: 1000
}

starter: {
  maxUsers: 10,
  maxBusinesses: 500,
  maxProposals: 200,
  maxStorageMb: 5000
}

professional: {
  maxUsers: 50,
  maxBusinesses: 2000,
  maxProposals: 1000,
  maxStorageMb: 20000
}

enterprise: {
  maxUsers: unlimited,
  maxBusinesses: unlimited,
  maxProposals: unlimited,
  maxStorageMb: unlimited
}
```

### Quota Enforcement

- Automatic usage tracking via database triggers
- Pre-operation quota checks
- Graceful error handling with upgrade prompts
- Real-time usage statistics

## Implementation Checklist

- [x] Database schema with tenant tables
- [x] Row-Level Security policies
- [x] Tenant context management functions
- [x] Tenant data access layer
- [x] Tenant isolation middleware
- [x] Quota enforcement system
- [x] Tenant-specific encryption
- [x] Audit logging system
- [x] Tenant management API routes
- [x] IP restriction support
- [x] Feature flag system
- [x] Usage metrics tracking

## Usage Examples

### Creating a New Tenant

```javascript
const tenant = await tenantDataAccess.createTenant({
  name: 'Acme Corporation',
  slug: 'acme',
  planType: 'professional',
  billingEmail: 'billing@acme.com',
  ownerEmail: 'admin@acme.com',
  ownerPassword: 'secure-password'
});
```

### Tenant-Scoped Query

```javascript
// Set context
await tenantDataAccess.setTenantContext(tenantId, userId);

// Query automatically scoped to tenant
const businesses = await tenantDataAccess.query(
  'SELECT * FROM businesses WHERE status = $1',
  ['active']
);

// Clear context
await tenantDataAccess.clearTenantContext();
```

### Encrypting Sensitive Data

```javascript
// Encrypt business contact info
const encryptedPhone = tenantEncryption.encrypt(
  business.phone,
  tenantId
);

// Store encrypted data
await db.query(
  'UPDATE businesses SET phone_encrypted = $1 WHERE id = $2',
  [JSON.stringify(encryptedPhone), businessId]
);

// Decrypt when needed
const decryptedPhone = tenantEncryption.decrypt(
  encryptedPhone,
  tenantId
);
```

### Applying Middleware

```javascript
// Protect route with tenant isolation
app.use('/api/businesses', 
  authenticate,
  tenantIsolation,
  cleanupTenantContext,
  businessesRouter
);

// Enforce quota on creation
router.post('/businesses',
  enforceQuota('businesses'),
  async (req, res) => {
    // Create business
  }
);

// Require admin role
router.delete('/businesses/:id',
  requireTenantRole(['owner', 'admin']),
  async (req, res) => {
    // Delete business
  }
);
```

## Testing Considerations

### Unit Tests
- Test tenant context management
- Verify quota enforcement
- Validate encryption/decryption
- Test access control logic

### Integration Tests
- Test RLS policies
- Verify data isolation between tenants
- Test quota triggers
- Validate audit logging

### Security Tests
- Attempt cross-tenant data access
- Test IP restriction enforcement
- Verify encryption key isolation
- Test audit trail integrity

## Performance Considerations

- **Connection Pooling**: Reuse database connections
- **Key Caching**: Cache derived encryption keys
- **Index Optimization**: Tenant-scoped indexes on all tables
- **Query Optimization**: Use prepared statements
- **Context Cleanup**: Always clear context after requests

## Monitoring and Alerts

- Monitor quota usage approaching limits
- Alert on failed access attempts
- Track tenant-specific performance metrics
- Monitor encryption/decryption performance
- Alert on unusual audit log patterns

## Future Enhancements

- [ ] Tenant data export/import
- [ ] Automated tenant provisioning
- [ ] Self-service tenant management portal
- [ ] Advanced analytics per tenant
- [ ] Tenant-specific rate limiting
- [ ] Geographic data residency options
- [ ] Tenant data backup/restore
- [ ] Multi-region tenant support

## Compliance

This implementation supports compliance with:
- **GDPR**: Data isolation and encryption
- **SOC2**: Audit logging and access controls
- **HIPAA**: Encryption and access tracking (with additional measures)

## Support

For questions or issues with tenant isolation:
1. Check audit logs for access issues
2. Verify tenant context is properly set
3. Review quota usage statistics
4. Check RLS policy configuration
5. Validate encryption key configuration
