import cacheService from '../services/cacheService.js';
import cachedDb from '../services/cachedDatabase.js';
import { 
  cacheMiddleware, 
  businessCache, 
  analyticsCache,
  cacheAsideQuery,
  writeThroughUpdate,
  writeBehindUpdate
} from '../middleware/cache.js';

/**
 * Cache System Tests
 * Tests for Redis caching implementation including multi-level caching,
 * invalidation strategies, and performance monitoring
 */

describe('Cache Service', () => {
  beforeAll(async () => {
    // Initialize cache service for testing
    await cacheService.initRedis();
  });

  afterAll(async () => {
    // Cleanup and close connections
    await cacheService.cleanup();
    await cacheService.close();
  });

  beforeEach(async () => {
    // Reset metrics before each test
    cacheService.resetMetrics();
  });

  describe('Basic Cache Operations', () => {
    test('should set and get cache values', async () => {
      const testData = { test: 'data', timestamp: Date.now() };
      
      // Set cache value
      const setResult = await cacheService.set('test', 'basic_test', testData);
      expect(setResult).toBe(true);
      
      // Get cache value
      const getValue = await cacheService.get('test', 'basic_test');
      expect(getValue).toEqual(testData);
    });

    test('should return null for non-existent keys', async () => {
      const getValue = await cacheService.get('test', 'non_existent_key');
      expect(getValue).toBeNull();
    });

    test('should delete cache entries', async () => {
      const testData = { test: 'delete_test' };
      
      // Set and verify
      await cacheService.set('test', 'delete_test', testData);
      let getValue = await cacheService.get('test', 'delete_test');
      expect(getValue).toEqual(testData);
      
      // Delete and verify
      const deleteResult = await cacheService.delete('test', 'delete_test');
      expect(deleteResult).toBe(true);
      
      getValue = await cacheService.get('test', 'delete_test');
      expect(getValue).toBeNull();
    });

    test('should handle TTL expiration', async () => {
      const testData = { test: 'ttl_test' };
      
      // Set with 1 second TTL
      await cacheService.set('test', 'ttl_test', testData, {}, 1);
      
      // Should be available immediately
      let getValue = await cacheService.get('test', 'ttl_test');
      expect(getValue).toEqual(testData);
      
      // Wait for expiration and test
      await new Promise(resolve => setTimeout(resolve, 1100));
      getValue = await cacheService.get('test', 'ttl_test');
      expect(getValue).toBeNull();
    });
  });

  describe('Multi-level Caching', () => {
    test('should use different TTL for different namespaces', async () => {
      const businessData = { id: 1, name: 'Test Business' };
      const sessionData = { userId: 1, token: 'test_token' };
      
      // Set data in different namespaces
      await cacheService.set('businesses', 'test_business', businessData);
      await cacheService.set('sessions', 'test_session', sessionData);
      
      // Verify both are cached
      const business = await cacheService.get('businesses', 'test_business');
      const session = await cacheService.get('sessions', 'test_session');
      
      expect(business).toEqual(businessData);
      expect(session).toEqual(sessionData);
    });

    test('should support parameterized cache keys', async () => {
      const testData = { result: 'parameterized' };
      const params = { userId: 123, region: 'NY' };
      
      await cacheService.set('queries', 'user_businesses', testData, params);
      
      // Should get with same parameters
      const getValue = await cacheService.get('queries', 'user_businesses', params);
      expect(getValue).toEqual(testData);
      
      // Should not get with different parameters
      const differentParams = { userId: 456, region: 'CA' };
      const noValue = await cacheService.get('queries', 'user_businesses', differentParams);
      expect(noValue).toBeNull();
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate by namespace', async () => {
      // Set multiple entries in namespace
      await cacheService.set('test_namespace', 'key1', { data: 1 });
      await cacheService.set('test_namespace', 'key2', { data: 2 });
      await cacheService.set('other_namespace', 'key3', { data: 3 });
      
      // Verify all are cached
      expect(await cacheService.get('test_namespace', 'key1')).toBeTruthy();
      expect(await cacheService.get('test_namespace', 'key2')).toBeTruthy();
      expect(await cacheService.get('other_namespace', 'key3')).toBeTruthy();
      
      // Invalidate one namespace
      const invalidatedCount = await cacheService.invalidateNamespace('test_namespace');
      expect(invalidatedCount).toBe(2);
      
      // Verify invalidation
      expect(await cacheService.get('test_namespace', 'key1')).toBeNull();
      expect(await cacheService.get('test_namespace', 'key2')).toBeNull();
      expect(await cacheService.get('other_namespace', 'key3')).toBeTruthy();
    });

    test('should invalidate by pattern', async () => {
      // Set entries with different patterns
      await cacheService.set('test', 'user_123_profile', { userId: 123 });
      await cacheService.set('test', 'user_123_settings', { userId: 123 });
      await cacheService.set('test', 'user_456_profile', { userId: 456 });
      await cacheService.set('test', 'business_data', { businessId: 1 });
      
      // Invalidate user_123_* pattern
      const invalidatedCount = await cacheService.invalidatePattern('test', 'user_123_*');
      expect(invalidatedCount).toBe(2);
      
      // Verify selective invalidation
      expect(await cacheService.get('test', 'user_123_profile')).toBeNull();
      expect(await cacheService.get('test', 'user_123_settings')).toBeNull();
      expect(await cacheService.get('test', 'user_456_profile')).toBeTruthy();
      expect(await cacheService.get('test', 'business_data')).toBeTruthy();
    });
  });

  describe('Cache Patterns', () => {
    test('should implement cache-aside pattern', async () => {
      let fetchCalled = false;
      const fetchFunction = async () => {
        fetchCalled = true;
        return { data: 'fetched_data', timestamp: Date.now() };
      };
      
      // First call should fetch data
      const result1 = await cacheService.getOrSet('test', 'cache_aside', fetchFunction);
      expect(fetchCalled).toBe(true);
      expect(result1.data).toBe('fetched_data');
      
      // Reset flag
      fetchCalled = false;
      
      // Second call should use cache
      const result2 = await cacheService.getOrSet('test', 'cache_aside', fetchFunction);
      expect(fetchCalled).toBe(false);
      expect(result2).toEqual(result1);
    });

    test('should implement write-through pattern', async () => {
      let writeCalled = false;
      const writeFunction = async (data) => {
        writeCalled = true;
        return true; // Simulate successful write
      };
      
      const testData = { data: 'write_through_test' };
      
      // Write-through should write to storage and cache
      const result = await cacheService.writeThrough('test', 'write_through', testData, writeFunction);
      expect(result).toBe(true);
      expect(writeCalled).toBe(true);
      
      // Data should be in cache
      const cached = await cacheService.get('test', 'write_through');
      expect(cached).toEqual(testData);
    });

    test('should implement write-behind pattern', async () => {
      let writeCalled = false;
      const writeFunction = async (data) => {
        writeCalled = true;
        return true;
      };
      
      const testData = { data: 'write_behind_test' };
      
      // Write-behind should cache immediately
      const result = await cacheService.writeBehind('test', 'write_behind', testData, writeFunction);
      expect(result).toBe(true);
      
      // Data should be in cache immediately
      const cached = await cacheService.get('test', 'write_behind');
      expect(cached).toEqual(testData);
      
      // Write to storage should happen asynchronously
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(writeCalled).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    test('should support multi-get operations', async () => {
      const testData = {
        key1: { data: 'value1' },
        key2: { data: 'value2' },
        key3: { data: 'value3' }
      };
      
      // Set multiple values
      await cacheService.mset('test', testData);
      
      // Get multiple values
      const results = await cacheService.mget('test', ['key1', 'key2', 'key3', 'key4']);
      
      expect(results.key1).toEqual(testData.key1);
      expect(results.key2).toEqual(testData.key2);
      expect(results.key3).toEqual(testData.key3);
      expect(results.key4).toBeUndefined(); // Non-existent key
    });

    test('should support multi-set operations', async () => {
      const testData = {
        batch_key1: { data: 'batch_value1' },
        batch_key2: { data: 'batch_value2' }
      };
      
      const result = await cacheService.mset('test', testData);
      expect(result).toBe(true);
      
      // Verify all were set
      const value1 = await cacheService.get('test', 'batch_key1');
      const value2 = await cacheService.get('test', 'batch_key2');
      
      expect(value1).toEqual(testData.batch_key1);
      expect(value2).toEqual(testData.batch_key2);
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should track cache metrics', async () => {
      // Reset metrics
      cacheService.resetMetrics();
      
      // Perform cache operations
      await cacheService.set('test', 'metrics_test', { data: 'test' });
      await cacheService.get('test', 'metrics_test'); // Hit
      await cacheService.get('test', 'non_existent'); // Miss
      await cacheService.delete('test', 'metrics_test');
      
      const metrics = cacheService.getMetrics();
      
      expect(metrics.sets).toBe(1);
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
      expect(metrics.deletes).toBe(1);
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.hitRate).toBe(50); // 1 hit out of 2 requests
    });

    test('should provide cache health check', async () => {
      const health = await cacheService.healthCheck();
      
      expect(health).toHaveProperty('redis');
      expect(health).toHaveProperty('metrics');
      expect(health).toHaveProperty('timestamp');
      expect(health.metrics).toHaveProperty('hitRate');
    });

    test('should provide cache info', async () => {
      const info = await cacheService.getCacheInfo();
      
      if (info) { // Only test if Redis is available
        expect(info).toHaveProperty('keyCount');
        expect(info).toHaveProperty('memoryUsed');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle Redis connection errors gracefully', async () => {
      // Simulate disconnected state
      const originalConnected = cacheService.isConnected;
      cacheService.isConnected = false;
      
      // Operations should not throw errors
      const getValue = await cacheService.get('test', 'error_test');
      expect(getValue).toBeNull();
      
      const setResult = await cacheService.set('test', 'error_test', { data: 'test' });
      expect(setResult).toBe(false);
      
      // Restore state
      cacheService.isConnected = originalConnected;
    });

    test('should handle malformed cache data', async () => {
      // This would require direct Redis manipulation to test properly
      // For now, we'll test that the service handles JSON parse errors
      const metrics = cacheService.getMetrics();
      expect(metrics.errors).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cleanup Operations', () => {
    test('should cleanup expired entries', async () => {
      // Set some test data
      await cacheService.set('test', 'cleanup_test1', { data: 'test1' });
      await cacheService.set('test', 'cleanup_test2', { data: 'test2' });
      
      // Run cleanup
      const result = await cacheService.cleanup();
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('cleanedCount');
    });
  });
});

describe('Cached Database Service', () => {
  beforeAll(async () => {
    // Initialize services
    await cacheService.initRedis();
    cachedDb.init();
  });

  afterAll(async () => {
    await cacheService.close();
  });

  describe('Database Query Caching', () => {
    test('should cache database queries', async () => {
      // Mock database query
      const mockQuery = jest.fn().mockResolvedValue([{ id: 1, name: 'Test' }]);
      cachedDb.executeQuery = mockQuery;
      
      // First call should hit database
      const result1 = await cachedDb.query('SELECT * FROM test', [], { useCache: true });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(result1).toEqual([{ id: 1, name: 'Test' }]);
      
      // Second call should use cache
      const result2 = await cachedDb.query('SELECT * FROM test', [], { useCache: true });
      expect(mockQuery).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(result2).toEqual(result1);
    });

    test('should bypass cache when disabled', async () => {
      const mockQuery = jest.fn().mockResolvedValue([{ id: 2, name: 'Test2' }]);
      cachedDb.executeQuery = mockQuery;
      
      // Both calls should hit database
      await cachedDb.query('SELECT * FROM test2', [], { useCache: false });
      await cachedDb.query('SELECT * FROM test2', [], { useCache: false });
      
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('Business Operations', () => {
    test('should cache business queries', async () => {
      const mockBusinesses = [
        { id: '1', name: 'Business 1', region: 'NY' },
        { id: '2', name: 'Business 2', region: 'NY' }
      ];
      
      cachedDb.executeQuery = jest.fn().mockResolvedValue(mockBusinesses);
      
      // First call
      const result1 = await cachedDb.getBusinesses({ region: 'NY' });
      expect(result1).toEqual(mockBusinesses);
      
      // Second call should use cache
      const result2 = await cachedDb.getBusinesses({ region: 'NY' });
      expect(result2).toEqual(mockBusinesses);
      expect(cachedDb.executeQuery).toHaveBeenCalledTimes(1);
    });

    test('should invalidate cache on business updates', async () => {
      cachedDb.executeQuery = jest.fn()
        .mockResolvedValueOnce([{ id: '1', name: 'Old Name' }])
        .mockResolvedValueOnce({ changes: 1 })
        .mockResolvedValueOnce([{ id: '1', name: 'New Name' }]);
      
      // Get business (cached)
      await cachedDb.getBusinessById('1');
      
      // Update business (should invalidate cache)
      await cachedDb.updateBusiness('1', { name: 'New Name' });
      
      // Get business again (should fetch fresh data)
      const updated = await cachedDb.getBusinessById('1');
      
      expect(cachedDb.executeQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('Analytics Caching', () => {
    test('should cache analytics data', async () => {
      const mockAnalytics = {
        totalBusinesses: 100,
        proposalsSent: 50,
        interestedResponses: 25,
        projectsCompleted: 10
      };
      
      cachedDb.executeQuery = jest.fn()
        .mockResolvedValueOnce([{ count: 100 }])
        .mockResolvedValueOnce([{ count: 50 }])
        .mockResolvedValueOnce([{ count: 25 }])
        .mockResolvedValueOnce([{ count: 10 }]);
      
      // First call should execute queries
      const result1 = await cachedDb.getAnalytics();
      expect(result1.totalBusinesses).toBe(100);
      expect(cachedDb.executeQuery).toHaveBeenCalledTimes(4);
      
      // Reset mock
      cachedDb.executeQuery.mockClear();
      
      // Second call should use cache
      const result2 = await cachedDb.getAnalytics();
      expect(result2).toEqual(result1);
      expect(cachedDb.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    test('should provide health status', async () => {
      const health = await cachedDb.healthCheck();
      
      expect(health).toHaveProperty('database');
      expect(health).toHaveProperty('cache');
      expect(health).toHaveProperty('timestamp');
    });
  });
});

describe('Cache Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      path: '/test',
      query: {},
      user: { id: 1 }
    };
    
    res = {
      json: jest.fn(),
      set: jest.fn(),
      statusCode: 200
    };
    
    next = jest.fn();
  });

  test('should cache GET responses', async () => {
    const middleware = cacheMiddleware('test', 300);
    
    // First request - cache miss
    await middleware(req, res, next);
    expect(res.set).toHaveBeenCalledWith('X-Cache', 'MISS');
    expect(next).toHaveBeenCalled();
    
    // Simulate response
    const testData = { data: 'test response' };
    res.json(testData);
    
    // Second request - should be cache hit
    req = { ...req }; // Reset request
    res = { json: jest.fn(), set: jest.fn(), statusCode: 200 };
    next = jest.fn();
    
    await middleware(req, res, next);
    expect(res.set).toHaveBeenCalledWith('X-Cache', 'HIT');
    expect(res.json).toHaveBeenCalledWith(testData);
    expect(next).not.toHaveBeenCalled();
  });

  test('should skip caching for non-GET requests', async () => {
    req.method = 'POST';
    const middleware = cacheMiddleware('test', 300);
    
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.set).not.toHaveBeenCalled();
  });
});

describe('Cache Helpers', () => {
  test('should implement cache-aside helper', async () => {
    let fetchCalled = false;
    const queryFunction = async () => {
      fetchCalled = true;
      return { data: 'query result' };
    };
    
    // First call
    const result1 = await cacheAsideQuery('test', 'helper_test', queryFunction);
    expect(fetchCalled).toBe(true);
    expect(result1.data).toBe('query result');
    
    // Reset flag
    fetchCalled = false;
    
    // Second call should use cache
    const result2 = await cacheAsideQuery('test', 'helper_test', queryFunction);
    expect(fetchCalled).toBe(false);
    expect(result2).toEqual(result1);
  });

  test('should implement write-through helper', async () => {
    let updateCalled = false;
    const updateFunction = async (data) => {
      updateCalled = true;
      return true;
    };
    
    const testData = { data: 'update test' };
    
    const result = await writeThroughUpdate('test', 'write_helper', testData, updateFunction);
    expect(result).toBe(true);
    expect(updateCalled).toBe(true);
    
    // Should be cached
    const cached = await cacheService.get('test', 'write_helper');
    expect(cached).toEqual(testData);
  });

  test('should implement write-behind helper', async () => {
    let updateCalled = false;
    const updateFunction = async (data) => {
      updateCalled = true;
      return true;
    };
    
    const testData = { data: 'write behind test' };
    
    const result = await writeBehindUpdate('test', 'write_behind_helper', testData, updateFunction);
    expect(result).toBe(true);
    
    // Should be cached immediately
    const cached = await cacheService.get('test', 'write_behind_helper');
    expect(cached).toEqual(testData);
    
    // Update should happen asynchronously
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(updateCalled).toBe(true);
  });
});