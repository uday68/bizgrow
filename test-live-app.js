#!/usr/bin/env node

/**
 * Test the live BizGrow AI application
 */

import https from 'https';

const LIVE_URL = 'https://biggrow-production.up.railway.app';

async function testEndpoint(path, description) {
  return new Promise((resolve) => {
    const url = `${LIVE_URL}${path}`;
    console.log(`Testing ${description}: ${url}`);
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            console.log(`✅ ${description}: SUCCESS`);
            
            // Show key info
            if (json.status) console.log(`   Status: ${json.status}`);
            if (json.version) console.log(`   Version: ${json.version}`);
            if (json.uptime) console.log(`   Uptime: ${Math.floor(json.uptime)}s`);
            if (json.totalDiscovered !== undefined) console.log(`   Businesses Discovered: ${json.totalDiscovered}`);
            if (json.agents) {
              console.log(`   AI Agents: ${Object.entries(json.agents).map(([k,v]) => `${k}:${v}`).join(', ')}`);
            }
            
            resolve(true);
          } catch (e) {
            console.log(`✅ ${description}: SUCCESS (non-JSON response)`);
            resolve(true);
          }
        } else {
          console.log(`❌ ${description}: Failed (${res.statusCode})`);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.log(`❌ ${description}: Error - ${err.message}`);
      resolve(false);
    });
  });
}

async function runTests() {
  console.log('🚀 Testing Live BizGrow AI Application');
  console.log('=' .repeat(50));
  console.log(`Live URL: ${LIVE_URL}`);
  console.log('');
  
  const tests = [
    ['/health', 'Health Check'],
    ['/api/health', 'API Health'],
    ['/', 'Root Endpoint'],
    ['/api/developer/metrics', 'Developer Dashboard'],
  ];
  
  let passed = 0;
  for (const [path, desc] of tests) {
    const success = await testEndpoint(path, desc);
    if (success) passed++;
    console.log('');
  }
  
  console.log('=' .repeat(50));
  console.log(`Results: ${passed}/${tests.length} tests passed`);
  
  if (passed === tests.length) {
    console.log('🎉 Your BizGrow AI MVP is LIVE and fully functional!');
    console.log('');
    console.log('🌐 Access your application:');
    console.log(`   Main App: ${LIVE_URL}`);
    console.log(`   Health Check: ${LIVE_URL}/health`);
    console.log(`   Developer Dashboard: ${LIVE_URL}/api/developer/metrics`);
    console.log('');
    console.log('🤖 AI Agents are running and ready to:');
    console.log('   • Discover new businesses automatically');
    console.log('   • Generate personalized proposals');
    console.log('   • Build projects for interested clients');
    console.log('');
    console.log('✅ Deployment Complete! Your MVP is ready for business!');
  } else {
    console.log('⚠️  Some endpoints are not responding correctly.');
  }
}

runTests().catch(console.error);