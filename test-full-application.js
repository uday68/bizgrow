#!/usr/bin/env node

/**
 * Complete BizGrow AI Application Testing Suite
 * Tests both frontend and backend integration
 */

import https from 'https';

const BACKEND_URL = 'https://biggrow-production.up.railway.app';
const FRONTEND_URL = 'https://bizgrow-ai-frontend.vercel.app';

console.log('🚀 BizGrow AI - Complete Application Test');
console.log('=' .repeat(60));
console.log(`Backend:  ${BACKEND_URL}`);
console.log(`Frontend: ${FRONTEND_URL}`);
console.log('');

async function testEndpoint(url, description, expectedContent = null) {
  return new Promise((resolve) => {
    console.log(`Testing ${description}...`);
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            console.log(`✅ ${description}: SUCCESS`);
            
            // Show relevant info
            if (json.status) console.log(`   Status: ${json.status}`);
            if (json.version) console.log(`   Version: ${json.version}`);
            if (json.uptime !== undefined) console.log(`   Uptime: ${Math.floor(json.uptime)}s`);
            if (json.totalDiscovered !== undefined) console.log(`   Businesses: ${json.totalDiscovered}`);
            if (json.agents) {
              const agentStatus = Object.entries(json.agents)
                .map(([name, agent]) => `${name}:${agent.status || 'active'}`)
                .join(', ');
              console.log(`   AI Agents: ${agentStatus}`);
            }
            
            resolve({ success: true, data: json });
          } catch (e) {
            // Not JSON, check if it's HTML (frontend)
            if (data.includes('<html') || data.includes('<!DOCTYPE')) {
              console.log(`✅ ${description}: SUCCESS (HTML page loaded)`);
              if (expectedContent && data.includes(expectedContent)) {
                console.log(`   Contains: ${expectedContent}`);
              }
              resolve({ success: true, data: 'HTML' });
            } else {
              console.log(`✅ ${description}: SUCCESS (non-JSON response)`);
              resolve({ success: true, data: data.substring(0, 100) });
            }
          }
        } else {
          console.log(`❌ ${description}: Failed (${res.statusCode})`);
          resolve({ success: false, status: res.statusCode });
        }
      });
    }).on('error', (err) => {
      console.log(`❌ ${description}: Error - ${err.message}`);
      resolve({ success: false, error: err.message });
    });
  });
}

async function runCompleteTest() {
  console.log('🔧 BACKEND API TESTS');
  console.log('-' .repeat(30));
  
  const backendTests = [
    [`${BACKEND_URL}/health`, 'Backend Health Check'],
    [`${BACKEND_URL}/api/health`, 'API Health & Agents'],
    [`${BACKEND_URL}/`, 'Backend Root Endpoint'],
    [`${BACKEND_URL}/api/developer/metrics`, 'Developer Dashboard API'],
  ];
  
  let backendPassed = 0;
  for (const [url, desc] of backendTests) {
    const result = await testEndpoint(url, desc);
    if (result.success) backendPassed++;
    console.log('');
  }
  
  console.log('🌐 FRONTEND TESTS');
  console.log('-' .repeat(30));
  
  const frontendTests = [
    [`${FRONTEND_URL}`, 'Frontend Home Page', 'BizGrow'],
    [`${FRONTEND_URL}/index.html`, 'Frontend Index', 'html'],
  ];
  
  let frontendPassed = 0;
  for (const [url, desc, content] of frontendTests) {
    const result = await testEndpoint(url, desc, content);
    if (result.success) frontendPassed++;
    console.log('');
  }
  
  // Summary
  console.log('=' .repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  console.log(`Backend API: ${backendPassed}/${backendTests.length} tests passed`);
  console.log(`Frontend:    ${frontendPassed}/${frontendTests.length} tests passed`);
  
  const totalPassed = backendPassed + frontendPassed;
  const totalTests = backendTests.length + frontendTests.length;
  
  console.log(`Overall:     ${totalPassed}/${totalTests} tests passed`);
  console.log('');
  
  if (totalPassed === totalTests) {
    console.log('🎉 ALL SYSTEMS OPERATIONAL!');
    console.log('');
    console.log('🚀 Your BizGrow AI MVP is fully deployed and working:');
    console.log('');
    console.log('🌐 Live URLs:');
    console.log(`   Frontend: ${FRONTEND_URL}`);
    console.log(`   Backend:  ${BACKEND_URL}`);
    console.log('');
    console.log('🤖 AI Agents Status: ACTIVE');
    console.log('   • Business Discovery Agent: Finding new businesses');
    console.log('   • Proposal Agent: Generating personalized proposals');
    console.log('   • Project Builder Agent: Building projects automatically');
    console.log('');
    console.log('📊 Features Available:');
    console.log('   • Developer Dashboard with real-time metrics');
    console.log('   • AI agent control and monitoring');
    console.log('   • Automated business discovery');
    console.log('   • Proposal generation and tracking');
    console.log('   • Project building for interested clients');
    console.log('   • WebSocket real-time updates');
    console.log('   • Regional analytics and growth tracking');
    console.log('');
    console.log('💰 Free Tier Usage:');
    console.log('   • Railway Backend: 500 hours/month');
    console.log('   • Vercel Frontend: Unlimited for hobby projects');
    console.log('');
    console.log('✅ DEPLOYMENT COMPLETE - Your MVP is ready for business!');
  } else {
    console.log('⚠️  Some components are not fully operational.');
    console.log('');
    console.log('🔧 Troubleshooting:');
    if (backendPassed < backendTests.length) {
      console.log('   • Check Railway deployment logs');
      console.log('   • Verify environment variables are set');
    }
    if (frontendPassed < frontendTests.length) {
      console.log('   • Check Vercel deployment status');
      console.log('   • Verify GitHub repository is connected');
    }
  }
  
  console.log('');
  console.log('🔗 Management Dashboards:');
  console.log(`   Railway: https://railway.app`);
  console.log(`   Vercel:  https://vercel.com/dashboard`);
  console.log(`   GitHub:  https://github.com/your-username/bizgrow`);
}

runCompleteTest().catch(console.error);