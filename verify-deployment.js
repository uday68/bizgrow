#!/usr/bin/env node

/**
 * BizGrow AI Deployment Verification Script
 * Tests all critical endpoints after deployment
 */

import https from 'https';
import http from 'http';

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://biggrow-production.up.railway.app';
const LOCAL_URL = 'http://localhost:3001';

// Test configuration
const TESTS = [
  { name: 'Health Check', path: '/health' },
  { name: 'API Health', path: '/api/health' },
  { name: 'Root Endpoint', path: '/' },
  { name: 'Developer Metrics', path: '/api/developer/metrics' }
];

/**
 * Make HTTP request and return promise
 */
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Test a single endpoint
 */
async function testEndpoint(baseUrl, test) {
  const url = `${baseUrl}${test.path}`;
  console.log(`Testing ${test.name}: ${url}`);
  
  try {
    const response = await makeRequest(url);
    
    if (response.statusCode === 200) {
      console.log(`✅ ${test.name}: OK (${response.statusCode})`);
      
      // Try to parse JSON response
      try {
        const json = JSON.parse(response.body);
        if (json.status === 'healthy') {
          console.log(`   Status: ${json.status}`);
        }
        if (json.version) {
          console.log(`   Version: ${json.version}`);
        }
        if (json.uptime) {
          console.log(`   Uptime: ${Math.floor(json.uptime)}s`);
        }
      } catch (e) {
        // Not JSON, that's okay
      }
      
      return true;
    } else {
      console.log(`❌ ${test.name}: Failed (${response.statusCode})`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${test.name}: Error - ${error.message}`);
    return false;
  }
}

/**
 * Test WebSocket connection
 */
async function testWebSocket(baseUrl) {
  console.log('\nTesting WebSocket connection...');
  
  try {
    const wsUrl = baseUrl.replace('http', 'ws');
    console.log(`WebSocket URL: ${wsUrl}`);
    
    // Note: This is a basic test - in a real scenario you'd use the 'ws' library
    console.log('⚠️  WebSocket test requires manual verification');
    console.log('   Open browser console and test: new WebSocket("' + wsUrl + '")');
    
    return true;
  } catch (error) {
    console.log(`❌ WebSocket test failed: ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 BizGrow AI Deployment Verification\n');
  
  const args = process.argv.slice(2);
  const testLocal = args.includes('--local');
  const testProduction = args.includes('--production') || !testLocal;
  
  let allPassed = true;
  
  // Test local deployment
  if (testLocal) {
    console.log('📍 Testing Local Deployment');
    console.log('=' .repeat(50));
    
    let localPassed = 0;
    for (const test of TESTS) {
      const passed = await testEndpoint(LOCAL_URL, test);
      if (passed) localPassed++;
    }
    
    console.log(`\nLocal Results: ${localPassed}/${TESTS.length} tests passed`);
    
    if (localPassed === TESTS.length) {
      console.log('✅ Local deployment is healthy!');
    } else {
      console.log('❌ Local deployment has issues');
      allPassed = false;
    }
    
    await testWebSocket(LOCAL_URL);
  }
  
  // Test production deployment
  if (testProduction) {
    console.log('\n🌐 Testing Production Deployment');
    console.log('=' .repeat(50));
    
    let prodPassed = 0;
    for (const test of TESTS) {
      const passed = await testEndpoint(RAILWAY_URL, test);
      if (passed) prodPassed++;
    }
    
    console.log(`\nProduction Results: ${prodPassed}/${TESTS.length} tests passed`);
    
    if (prodPassed === TESTS.length) {
      console.log('✅ Production deployment is healthy!');
    } else {
      console.log('❌ Production deployment has issues');
      allPassed = false;
    }
    
    await testWebSocket(RAILWAY_URL);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('🎉 All tests passed! Deployment is ready.');
    console.log('\n📋 Next Steps:');
    console.log('1. Update frontend API URLs to point to production');
    console.log('2. Test the full application workflow');
    console.log('3. Monitor logs for any runtime issues');
    console.log(`4. Access your app at: ${RAILWAY_URL}`);
  } else {
    console.log('⚠️  Some tests failed. Check the logs above.');
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help')) {
  console.log('BizGrow AI Deployment Verification');
  console.log('');
  console.log('Usage:');
  console.log('  node verify-deployment.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --local       Test local deployment only');
  console.log('  --production  Test production deployment only (default)');
  console.log('  --help        Show this help message');
  console.log('');
  console.log('Environment Variables:');
  console.log('  RAILWAY_URL   Production URL (default: https://bizgrow-ai.railway.app)');
  process.exit(0);
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});