import request from 'supertest';
import express from 'express';
import { JWTTokenManager, authenticateToken } from '../middleware/auth.js';
import tenantIsolation from '../middleware/tenantIsolation.js';
import businessesRoutes from '../routes/businesses.js';
import proposalsRoutes from '../routes/proposals.js';
import cachedDb from '../services/cachedDatabase.js';
import { initDatabase } from '../database/init.js';

describe('Multi-Tenant Isolation & Anti-Cross-Tenant Guard', () => {
  let app;
  let tenantAToken;
  let tenantBToken;
  let adminToken;

  beforeAll(async () => {
    await initDatabase();

    // Create Express app with isolation
    app = express();
    app.use(express.json());
    app.use('/api/businesses', authenticateToken, tenantIsolation, businessesRoutes);
    app.use('/api/proposals', authenticateToken, tenantIsolation, proposalsRoutes);

    // Create tokens for Tenant A and Tenant B
    tenantAToken = JWTTokenManager.generateTokens({
      id: 101,
      email: 'userA@tenantA.com',
      role: 'user',
      tenantId: 'tenant-alpha'
    }).accessToken;

    tenantBToken = JWTTokenManager.generateTokens({
      id: 202,
      email: 'userB@tenantB.com',
      role: 'user',
      tenantId: 'tenant-beta'
    }).accessToken;

    adminToken = JWTTokenManager.generateTokens({
      id: 999,
      email: 'admin@system.com',
      role: 'admin',
      tenantId: 'default'
    }).accessToken;

    // Seed test tenants in DB
    await cachedDb.run(
      `INSERT OR IGNORE INTO tenants (id, name, slug, plan_type, status)
       VALUES ('tenant-alpha', 'Alpha Inc', 'alpha', 'enterprise', 'active')`
    );
    await cachedDb.run(
      `INSERT OR IGNORE INTO tenants (id, name, slug, plan_type, status)
       VALUES ('tenant-beta', 'Beta LLC', 'beta', 'starter', 'active')`
    );

    // Seed test users in DB
    await cachedDb.run(
      `INSERT OR IGNORE INTO users (id, tenant_id, email, password_hash, first_name, last_name, role)
       VALUES (101, 'tenant-alpha', 'userA@tenantA.com', 'hash', 'User', 'A', 'user')`
    );
    await cachedDb.run(
      `INSERT OR IGNORE INTO users (id, tenant_id, email, password_hash, first_name, last_name, role)
       VALUES (202, 'tenant-beta', 'userB@tenantB.com', 'hash', 'User', 'B', 'user')`
    );
  });

  test('Tenant A creates a business and can retrieve it', async () => {
    const res = await request(app)
      .post('/api/businesses')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({
        name: 'Alpha Exclusive Lead',
        address: '100 Alpha Boulevard',
        industry: 'Logistics'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Alpha Exclusive Lead');
    expect(res.body.data.tenant_id).toBe('tenant-alpha');
  });

  test('Tenant B cannot see Tenant A business in list query', async () => {
    const res = await request(app)
      .get('/api/businesses')
      .set('Authorization', `Bearer ${tenantBToken}`);

    expect(res.status).toBe(200);
    const alphaBusinesses = res.body.data.filter(b => b.tenant_id === 'tenant-alpha');
    expect(alphaBusinesses.length).toBe(0);
  });

  test('Tenant B is forbidden when attempting to forge X-Tenant-ID header for Tenant A', async () => {
    const res = await request(app)
      .get('/api/businesses')
      .set('Authorization', `Bearer ${tenantBToken}`)
      .set('X-Tenant-ID', 'tenant-alpha');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CROSS_TENANT_FORBIDDEN');
  });

  test('Unauthenticated request fails closed with HTTP 401', async () => {
    const res = await request(app)
      .get('/api/businesses');

    expect(res.status).toBe(401);
  });
});
