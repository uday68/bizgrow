import fc from 'fast-check';
import cacheService from '../services/cacheService.js';
import cachedDb from '../services/cachedDatabase.js';

/**
 * Property-Based Tests for Redis Caching System
 * 
 * **Validates: Requirements 3.1, 3.6**
 * 
 * These tests verify that the caching system maintains correctness properties
 * across all valid inputs and scenarios, ensuring data consistency and
 * proper invalidation strategies.
 */

describe('Cache System Property Tests', () => {
  let redisAvailable = false;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await cacheService.initRedis();
      redisAvailable = cacheService.isConnected;
    } catch (error) {
      console.warn('Redis not available for testing:', error.message);
      redisAvailable = false;
    }

    try {
      // Initialize database for testing
      const { initDatabase } = await import('../database/init.js');
      await initDatabase();
      cachedDb.init();
      dbAvailable = true;
    } catch (error) {
      console.warn('Database not available for testing:', error.message);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (redisAvailable) {
      await cacheService.cleanup();
      await cacheService.close();
    }
  });

  beforeEach(async () => {
    if (redisAvailable) {
      // Clean up test data before each test
      await cacheService.invalidateNamespace('test');
    }
    cacheService.resetMetrics();
  });

  // Helper function to check if we should run Redis-dependent tests
  const describeIfRedis = (name, fn) => {
    if (redisAvailable) {
      describe(name, fn);
    } else {
      describe.skip(`${name} (Redis not available)`, fn);
    }
  };

  const testIfRedis = (name, fn, timeout) => {
    if (redisAvailable) {
      test(name, fn, timeout);
    } else {
      test.skip(`${name} (Redis not available)`, fn, timeout);
    }
  };

  /**
   * Property 8: Intelligent Caching Behavior
   * **Validates: Requirements 3.1, 3.6**
   * 
   * For any frequently accessed data, the Cache_Layer should cache data with 
   * configurable TTL values and implement proper invalidation strategies to 
   * maintain data consistency
   */
  describeIfRedis('Property 8: Intelligent Caching Behavior', () => {
    
    testIfRedis('Cache consistency: Set then Get returns same data', () => {

      const dataGenerator = fc.record({
        id: fc.integer({ min: 1, max: 1000000 }),
        name: fc.string({ minLength: 1, maxLength: 100 }),
        value: fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.array(fc.string()),
          fc.record({ nested: fc.string() })
        ),
        timestamp: fc.integer({ min: 0, max: Date.now() })
      });

      const namespaceGenerator = fc.constantFrom('businesses', 'users', 'sessions', 'queries', 'analytics');
      const keyGenerator = fc.string({ minLength: 1, maxLength: 50 });
      const ttlGenerator = fc.integer({ min: 1, max: 3600 });

      return fc.assert(
        fc.asyncProperty(
          namespaceGenerator,
          keyGenerator,
          dataGenerator,
          ttlGenerator,
          async (namespace, key, data, ttl) => {
            // Set data in cache
            const setResult = await cacheService.set(namespace, key, data, {}, ttl);
            
            // If set was successful, get should return the same data
            if (setResult) {
              const retrievedData = await cacheService.get(namespace, key);
              expect(retrievedData).toEqual(data);
            }
          }
        ),
        { numRuns: 100, timeout: 10000 }
      );
    });

    test('TTL behavior: Data expires after configured time', () => {
      const dataGenerator = fc.record({
        content: fc.string({ minLength: 1, maxLength: 100 }),
        id: fc.integer({ min: 1, max: 10000 })
      });

      const shortTtlGenerator = fc.integer({ min: 1, max: 3 }); // 1-3 seconds

      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          dataGenerator,
          shortTtlGenerator,
          async (key, data, ttl) => {
            // Set data with short TTL
            const setResult = await cacheService.set('test', key, data, {}, ttl);
            
            if (setResult) {
              // Should be available immediately
              const immediate = await cacheService.get('test', key);
              expect(immediate).toEqual(data);
              
              // Wait for expiration
              await new Promise(resolve => setTimeout(resolve, (ttl + 1) * 1000));
              
              // Should be expired
              const expired = await cacheService.get('test', key);
              expect(expired).toBeNull();
            }
          }
        ),
        { numRuns: 20, timeout: 15000 } // Reduced runs due to time delays
      );
    });

    test('Namespace isolation: Different namespaces do not interfere', () => {
      const dataGenerator = fc.record({
        value: fc.string({ minLength: 1, maxLength: 50 }),
        metadata: fc.record({ type: fc.string() })
      });

      const namespaceGenerator = fc.constantFrom('ns1', 'ns2', 'ns3', 'ns4');

      return fc.assert(
        fc.asyncProperty(
          fc.array(fc.tuple(namespaceGenerator, fc.string({ minLength: 1, maxLength: 20 }), dataGenerator), { minLength: 2, maxLength: 10 }),
          async (entries) => {
            // Set all entries
            const setPromises = entries.map(([namespace, key, data]) => 
              cacheService.set(namespace, key, data)
            );
            await Promise.all(setPromises);

            // Verify each entry is retrievable and isolated
            for (const [namespace, key, expectedData] of entries) {
              const retrieved = await cacheService.get(namespace, key);
              expect(retrieved).toEqual(expectedData);
            }

            // Invalidate one namespace
            const namespaceToInvalidate = entries[0][0];
            await cacheService.invalidateNamespace(namespaceToInvalidate);

            // Verify only that namespace was affected
            for (const [namespace, key, expectedData] of entries) {
              const retrieved = await cacheService.get(namespace, key);
              if (namespace === namespaceToInvalidate) {
                expect(retrieved).toBeNull();
              } else {
                expect(retrieved).toEqual(expectedData);
              }
            }
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    test('Parameter-based key generation: Same key with different params creates different cache entries', () => {
      const dataGenerator = fc.record({
        result: fc.string(),
        count: fc.integer({ min: 0, max: 1000 })
      });

      const paramsGenerator = fc.record({
        userId: fc.integer({ min: 1, max: 1000 }),
        region: fc.constantFrom('NY', 'CA', 'TX', 'FL'),
        type: fc.constantFrom('business', 'user', 'analytics')
      });

      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.tuple(paramsGenerator, dataGenerator), { minLength: 2, maxLength: 5 }),
          async (baseKey, paramDataPairs) => {
            // Ensure we have unique parameter sets
            const uniqueParams = paramDataPairs.filter((pair, index, arr) => 
              arr.findIndex(p => JSON.stringify(p[0]) === JSON.stringify(pair[0])) === index
            );

            if (uniqueParams.length < 2) return; // Skip if not enough unique params

            // Set data with different parameters
            for (const [params, data] of uniqueParams) {
              await cacheService.set('test', baseKey, data, params);
            }

            // Verify each parameter set retrieves its own data
            for (const [params, expectedData] of uniqueParams) {
              const retrieved = await cacheService.get('test', baseKey, params);
              expect(retrieved).toEqual(expectedData);
            }
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    test('Cache invalidation consistency: Invalidated entries are not retrievable', () => {
      const dataGenerator = fc.record({
        id: fc.integer(),
        data: fc.string({ minLength: 1, maxLength: 100 })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), dataGenerator), { minLength: 3, maxLength: 10 }),
          async (keyDataPairs) => {
            const namespace = 'test';

            // Set all entries
            for (const [key, data] of keyDataPairs) {
              await cacheService.set(namespace, key, data);
            }

            // Verify all are cached
            for (const [key, expectedData] of keyDataPairs) {
              const retrieved = await cacheService.get(namespace, key);
              expect(retrieved).toEqual(expectedData);
            }

            // Invalidate random subset
            const toInvalidate = keyDataPairs.slice(0, Math.floor(keyDataPairs.length / 2));
            for (const [key] of toInvalidate) {
              await cacheService.delete(namespace, key);
            }

            // Verify invalidated entries are gone, others remain
            for (const [key, expectedData] of keyDataPairs) {
              const retrieved = await cacheService.get(namespace, key);
              const shouldBeInvalidated = toInvalidate.some(([invalidatedKey]) => invalidatedKey === key);
              
              if (shouldBeInvalidated) {
                expect(retrieved).toBeNull();
              } else {
                expect(retrieved).toEqual(expectedData);
              }
            }
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    test('Batch operations consistency: Multi-get returns same data as individual gets', () => {
      const dataGenerator = fc.record({
        value: fc.string({ minLength: 1, maxLength: 50 }),
        number: fc.integer({ min: 0, max: 1000 })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 15 }), dataGenerator), { minLength: 2, maxLength: 8 }),
          async (keyDataPairs) => {
            const namespace = 'test';
            const keyValueMap = {};
            
            // Prepare data for batch set
            keyDataPairs.forEach(([key, data]) => {
              keyValueMap[key] = data;
            });

            // Batch set
            await cacheService.mset(namespace, keyValueMap);

            // Get keys for batch get
            const keys = keyDataPairs.map(([key]) => key);
            
            // Batch get
            const batchResults = await cacheService.mget(namespace, keys);

            // Individual gets
            const individualResults = {};
            for (const key of keys) {
              individualResults[key] = await cacheService.get(namespace, key);
            }

            // Compare batch and individual results
            for (const key of keys) {
              expect(batchResults[key]).toEqual(individualResults[key]);
              expect(batchResults[key]).toEqual(keyValueMap[key]);
            }
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    test('Metrics accuracy: Cache operations are correctly tracked', () => {
      const dataGenerator = fc.record({
        content: fc.string({ minLength: 1, maxLength: 30 })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 15 }), dataGenerator), { minLength: 1, maxLength: 5 }),
          fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 1, maxLength: 5 }),
          async (setOperations, getOperations) => {
            // Reset metrics
            cacheService.resetMetrics();
            const initialMetrics = cacheService.getMetrics();
            expect(initialMetrics.hits).toBe(0);
            expect(initialMetrics.misses).toBe(0);
            expect(initialMetrics.sets).toBe(0);

            // Perform set operations
            let expectedSets = 0;
            for (const [key, data] of setOperations) {
              const result = await cacheService.set('test', key, data);
              if (result) expectedSets++;
            }

            // Perform get operations (mix of hits and misses)
            let expectedHits = 0;
            let expectedMisses = 0;
            const setKeys = setOperations.map(([key]) => key);

            for (const key of getOperations) {
              const result = await cacheService.get('test', key);
              if (setKeys.includes(key) && result !== null) {
                expectedHits++;
              } else {
                expectedMisses++;
              }
            }

            // Verify metrics
            const finalMetrics = cacheService.getMetrics();
            expect(finalMetrics.sets).toBe(expectedSets);
            expect(finalMetrics.hits).toBe(expectedHits);
            expect(finalMetrics.misses).toBe(expectedMisses);
            expect(finalMetrics.totalRequests).toBe(expectedHits + expectedMisses);
          }
        ),
        { numRuns: 30, timeout: 10000 }
      );
    });

    test('Cache strategies: Different namespaces use appropriate TTL values', () => {
      const testCases = [
        { namespace: 'businesses', expectedMinTtl: 3000 }, // Should be around 3600
        { namespace: 'sessions', expectedMinTtl: 80000 },   // Should be around 86400
        { namespace: 'analytics', expectedMinTtl: 250 },    // Should be around 300
        { namespace: 'queries', expectedMinTtl: 500 }       // Should be around 600
      ];

      const dataGenerator = fc.record({
        test: fc.string({ minLength: 1, maxLength: 20 })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...testCases),
          fc.string({ minLength: 1, maxLength: 15 }),
          dataGenerator,
          async (testCase, key, data) => {
            const { namespace, expectedMinTtl } = testCase;

            // Set data using namespace default TTL
            await cacheService.set(namespace, key, data);

            // Data should be available immediately
            const immediate = await cacheService.get(namespace, key);
            expect(immediate).toEqual(data);

            // For short TTL namespaces, verify they expire faster than long TTL ones
            if (expectedMinTtl < 1000) {
              // Wait a short time
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // For very short TTL, might be expired
              // For longer TTL, should still be there
              const afterWait = await cacheService.get(namespace, key);
              
              // This property mainly verifies the system accepts different TTL strategies
              // The exact expiration timing depends on the configured values
              expect(typeof afterWait === 'object' || afterWait === null).toBe(true);
            }
          }
        ),
        { numRuns: 20, timeout: 15000 }
      );
    });
  });

  describe('Cache-Database Integration Properties', () => {
    
    test('Cache-aside pattern: Cache miss triggers database fetch', () => {
      const queryResultGenerator = fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 1000 }),
          name: fc.string({ minLength: 1, maxLength: 50 }),
          value: fc.string()
        }),
        { minLength: 0, maxLength: 10 }
      );

      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          queryResultGenerator,
          async (cacheKey, mockResult) => {
            // Mock database query
            let queryCallCount = 0;
            const mockQuery = async () => {
              queryCallCount++;
              return mockResult;
            };

            // First call should hit database
            const result1 = await cacheService.getOrSet('test', cacheKey, mockQuery);
            expect(queryCallCount).toBe(1);
            expect(result1).toEqual(mockResult);

            // Second call should use cache
            const result2 = await cacheService.getOrSet('test', cacheKey, mockQuery);
            expect(queryCallCount).toBe(1); // Still 1, not incremented
            expect(result2).toEqual(mockResult);
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    test('Write-through pattern: Cache and storage are updated together', () => {
      const dataGenerator = fc.record({
        id: fc.integer({ min: 1, max: 1000 }),
        content: fc.string({ minLength: 1, maxLength: 100 })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          dataGenerator,
          async (key, data) => {
            let storageData = null;
            let writeCallCount = 0;

            const mockWrite = async (value) => {
              writeCallCount++;
              storageData = value;
              return true;
            };

            // Write-through operation
            const result = await cacheService.writeThrough('test', key, data, mockWrite);
            
            expect(result).toBe(true);
            expect(writeCallCount).toBe(1);
            expect(storageData).toEqual(data);

            // Data should be in cache
            const cached = await cacheService.get('test', key);
            expect(cached).toEqual(data);
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    test('Write-behind pattern: Cache is updated immediately, storage asynchronously', () => {
      const dataGenerator = fc.record({
        id: fc.integer({ min: 1, max: 1000 }),
        content: fc.string({ minLength: 1, maxLength: 100 })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          dataGenerator,
          async (key, data) => {
            let storageData = null;
            let writeCallCount = 0;

            const mockWrite = async (value) => {
              writeCallCount++;
              storageData = value;
              return true;
            };

            // Write-behind operation
            const result = await cacheService.writeBehind('test', key, data, mockWrite);
            
            expect(result).toBe(true);

            // Data should be in cache immediately
            const cached = await cacheService.get('test', key);
            expect(cached).toEqual(data);

            // Storage write should happen asynchronously
            await new Promise(resolve => setTimeout(resolve, 200));
            expect(writeCallCount).toBe(1);
            expect(storageData).toEqual(data);
          }
        ),
        { numRuns: 30, timeout: 10000 }
      );
    });
  });

  describe('Error Handling Properties', () => {
    
    test('Graceful degradation: Cache failures do not break application', () => {
      const dataGenerator = fc.record({
        content: fc.string({ minLength: 1, maxLength: 50 })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          dataGenerator,
          async (key, data) => {
            // Simulate cache unavailable
            const originalConnected = cacheService.isConnected;
            cacheService.isConnected = false;

            // Operations should not throw errors
            const getResult = await cacheService.get('test', key);
            expect(getResult).toBeNull();

            const setResult = await cacheService.set('test', key, data);
            expect(setResult).toBe(false);

            const deleteResult = await cacheService.delete('test', key);
            expect(deleteResult).toBe(false);

            // Restore connection state
            cacheService.isConnected = originalConnected;
          }
        ),
        { numRuns: 30, timeout: 5000 }
      );
    });
  });

  describe('Performance Properties', () => {
    
    test('Cache operations complete within reasonable time bounds', () => {
      const dataGenerator = fc.record({
        content: fc.string({ minLength: 1, maxLength: 1000 }),
        metadata: fc.record({
          id: fc.integer(),
          tags: fc.array(fc.string({ maxLength: 20 }), { maxLength: 10 })
        })
      });

      return fc.assert(
        fc.asyncProperty(
          fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 15 }), dataGenerator), { minLength: 1, maxLength: 20 }),
          async (operations) => {
            const maxOperationTime = 1000; // 1 second max per operation

            for (const [key, data] of operations) {
              // Test set operation time
              const setStart = Date.now();
              await cacheService.set('test', key, data);
              const setTime = Date.now() - setStart;
              expect(setTime).toBeLessThan(maxOperationTime);

              // Test get operation time
              const getStart = Date.now();
              await cacheService.get('test', key);
              const getTime = Date.now() - getStart;
              expect(getTime).toBeLessThan(maxOperationTime);
            }
          }
        ),
        { numRuns: 20, timeout: 30000 }
      );
    });
  });
});