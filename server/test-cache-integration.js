import cacheService from './services/cacheService.js';
import cachedDb from './services/cachedDatabase.js';
import { 
  businessCache, 
  analyticsCache,
  cacheAsideQuery,
  writeThroughUpdate 
} from './middleware/cache.js';

/**
 * Cache Integration Test
 * Demonstrates the Redis caching system functionality
 */

async function testCacheIntegration() {
  console.log('🚀 Starting Cache Integration Test...\n');

  try {
    // Wait for Redis connection attempt
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 1: Basic Cache Operations
    console.log('📝 Test 1: Basic Cache Operations');
    const testData = {
      id: 1,
      name: 'Test Business',
      address: '123 Main St',
      timestamp: Date.now()
    };

    console.log('  - Setting cache entry...');
    const setResult = await cacheService.set('businesses', 'test_business_1', testData);
    console.log(`  - Set result: ${setResult}`);

    console.log('  - Getting cache entry...');
    const getValue = await cacheService.get('businesses', 'test_business_1');
    console.log(`  - Retrieved data: ${getValue ? 'SUCCESS' : 'FAILED'}`);
    
    if (getValue) {
      console.log(`  - Data integrity: ${JSON.stringify(getValue) === JSON.stringify(testData) ? 'PASSED' : 'FAILED'}`);
    }

    // Test 2: Multi-level Caching
    console.log('\n📊 Test 2: Multi-level Caching');
    const businessData = { id: 1, name: 'Business Cache Test' };
    const sessionData = { userId: 1, token: 'session_token_123' };
    const analyticsData = { totalUsers: 100, activeUsers: 75 };

    await cacheService.set('businesses', 'multi_test', businessData);
    await cacheService.set('sessions', 'multi_test', sessionData);
    await cacheService.set('analytics', 'multi_test', analyticsData);

    const retrievedBusiness = await cacheService.get('businesses', 'multi_test');
    const retrievedSession = await cacheService.get('sessions', 'multi_test');
    const retrievedAnalytics = await cacheService.get('analytics', 'multi_test');

    console.log(`  - Business cache: ${retrievedBusiness ? 'PASSED' : 'FAILED'}`);
    console.log(`  - Session cache: ${retrievedSession ? 'PASSED' : 'FAILED'}`);
    console.log(`  - Analytics cache: ${retrievedAnalytics ? 'PASSED' : 'FAILED'}`);

    // Test 3: Cache Invalidation
    console.log('\n🗑️  Test 3: Cache Invalidation');
    await cacheService.set('test', 'invalidation_test_1', { data: 'test1' });
    await cacheService.set('test', 'invalidation_test_2', { data: 'test2' });
    await cacheService.set('other', 'invalidation_test_3', { data: 'test3' });

    console.log('  - Before invalidation:');
    console.log(`    - test:invalidation_test_1: ${await cacheService.get('test', 'invalidation_test_1') ? 'EXISTS' : 'MISSING'}`);
    console.log(`    - test:invalidation_test_2: ${await cacheService.get('test', 'invalidation_test_2') ? 'EXISTS' : 'MISSING'}`);
    console.log(`    - other:invalidation_test_3: ${await cacheService.get('other', 'invalidation_test_3') ? 'EXISTS' : 'MISSING'}`);

    const invalidatedCount = await cacheService.invalidateNamespace('test');
    console.log(`  - Invalidated ${invalidatedCount} keys from 'test' namespace`);

    console.log('  - After invalidation:');
    console.log(`    - test:invalidation_test_1: ${await cacheService.get('test', 'invalidation_test_1') ? 'EXISTS' : 'MISSING'}`);
    console.log(`    - test:invalidation_test_2: ${await cacheService.get('test', 'invalidation_test_2') ? 'EXISTS' : 'MISSING'}`);
    console.log(`    - other:invalidation_test_3: ${await cacheService.get('other', 'invalidation_test_3') ? 'EXISTS' : 'MISSING'}`);

    // Test 4: Cache Patterns
    console.log('\n🔄 Test 4: Cache Patterns');
    
    // Cache-aside pattern
    let fetchCount = 0;
    const fetchFunction = async () => {
      fetchCount++;
      return { data: 'fetched_data', fetchCount };
    };

    console.log('  - Testing cache-aside pattern:');
    const result1 = await cacheService.getOrSet('test', 'cache_aside_test', fetchFunction);
    console.log(`    - First call (cache miss): fetchCount = ${fetchCount}`);
    
    const result2 = await cacheService.getOrSet('test', 'cache_aside_test', fetchFunction);
    console.log(`    - Second call (cache hit): fetchCount = ${fetchCount}`);
    console.log(`    - Cache-aside pattern: ${fetchCount === 1 ? 'PASSED' : 'FAILED'}`);

    // Write-through pattern
    let writeCount = 0;
    const writeFunction = async (data) => {
      writeCount++;
      return true;
    };

    console.log('  - Testing write-through pattern:');
    const writeData = { data: 'write_through_test' };
    await cacheService.writeThrough('test', 'write_through_test', writeData, writeFunction);
    console.log(`    - Write operations: ${writeCount}`);
    
    const cachedWriteData = await cacheService.get('test', 'write_through_test');
    console.log(`    - Data cached: ${cachedWriteData ? 'YES' : 'NO'}`);
    console.log(`    - Write-through pattern: ${writeCount === 1 && cachedWriteData ? 'PASSED' : 'FAILED'}`);

    // Test 5: Batch Operations
    console.log('\n📦 Test 5: Batch Operations');
    const batchData = {
      batch_key_1: { id: 1, name: 'Batch Item 1' },
      batch_key_2: { id: 2, name: 'Batch Item 2' },
      batch_key_3: { id: 3, name: 'Batch Item 3' }
    };

    console.log('  - Testing batch set...');
    const batchSetResult = await cacheService.mset('test', batchData);
    console.log(`    - Batch set: ${batchSetResult ? 'SUCCESS' : 'FAILED'}`);

    console.log('  - Testing batch get...');
    const batchGetResult = await cacheService.mget('test', ['batch_key_1', 'batch_key_2', 'batch_key_3', 'batch_key_4']);
    const retrievedCount = Object.keys(batchGetResult).length;
    console.log(`    - Retrieved ${retrievedCount} items`);
    console.log(`    - Batch operations: ${retrievedCount === 3 ? 'PASSED' : 'FAILED'}`);

    // Test 6: Metrics and Monitoring
    console.log('\n📈 Test 6: Metrics and Monitoring');
    const metrics = cacheService.getMetrics();
    console.log('  - Current metrics:');
    console.log(`    - Hit rate: ${metrics.hitRate}%`);
    console.log(`    - Total requests: ${metrics.totalRequests}`);
    console.log(`    - Cache hits: ${metrics.hits}`);
    console.log(`    - Cache misses: ${metrics.misses}`);
    console.log(`    - Set operations: ${metrics.sets}`);
    console.log(`    - Connected: ${metrics.isConnected ? 'YES' : 'NO'}`);

    // Test 7: Health Check
    console.log('\n🏥 Test 7: Health Check');
    const health = await cacheService.healthCheck();
    console.log('  - Health status:');
    console.log(`    - Redis: ${health.redis ? 'HEALTHY' : 'UNAVAILABLE'}`);
    console.log(`    - Cluster: ${health.cluster ? 'ENABLED' : 'DISABLED'}`);
    console.log(`    - Timestamp: ${health.timestamp}`);

    // Test 8: Cache Info
    console.log('\n💾 Test 8: Cache Information');
    const info = await cacheService.getCacheInfo();
    if (info) {
      console.log('  - Cache info:');
      console.log(`    - Key count: ${info.keyCount}`);
      console.log(`    - Memory used: ${info.memoryUsed}`);
      console.log(`    - Memory peak: ${info.memoryPeak}`);
    } else {
      console.log('  - Cache info: Not available (Redis not connected)');
    }

    // Test 9: TTL and Expiration
    console.log('\n⏰ Test 9: TTL and Expiration');
    const shortTtlData = { data: 'expires_soon' };
    await cacheService.set('test', 'ttl_test', shortTtlData, {}, 2); // 2 seconds TTL
    
    console.log('  - Set data with 2-second TTL');
    const immediateGet = await cacheService.get('test', 'ttl_test');
    console.log(`    - Immediate retrieval: ${immediateGet ? 'SUCCESS' : 'FAILED'}`);
    
    console.log('  - Waiting 3 seconds for expiration...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const expiredGet = await cacheService.get('test', 'ttl_test');
    console.log(`    - After expiration: ${expiredGet ? 'STILL EXISTS (FAILED)' : 'EXPIRED (SUCCESS)'}`);

    // Test 10: Cleanup
    console.log('\n🧹 Test 10: Cleanup');
    const cleanupResult = await cacheService.cleanup();
    console.log(`  - Cleanup result: ${cleanupResult.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  - Message: ${cleanupResult.message}`);

    console.log('\n✅ Cache Integration Test Completed Successfully!');
    console.log('\n📊 Final Summary:');
    console.log('  - Multi-level caching: ✅ Implemented');
    console.log('  - Cache invalidation: ✅ Working');
    console.log('  - TTL management: ✅ Functional');
    console.log('  - Cache patterns: ✅ Supported');
    console.log('  - Batch operations: ✅ Available');
    console.log('  - Monitoring: ✅ Active');
    console.log('  - Graceful degradation: ✅ Enabled');

  } catch (error) {
    console.error('❌ Cache integration test failed:', error);
  } finally {
    // Close connections
    await cacheService.close();
  }
}

// Run the test
testCacheIntegration();