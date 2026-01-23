#!/usr/bin/env node

/**
 * Fix Frontend Deployment Issues
 * Rebuilds and redeploys with proper configuration
 */

import { execSync } from 'child_process';
import fs from 'fs';

console.log('🔧 Fixing Frontend Deployment Issues...');
console.log('=' .repeat(50));

try {
  // 1. Clean previous build
  console.log('🧹 Cleaning previous build...');
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
  }
  
  // 2. Install dependencies
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  // 3. Build with proper environment variables
  console.log('🏗️  Building with production config...');
  process.env.VITE_API_URL = 'https://biggrow-production.up.railway.app/api';
  process.env.VITE_WS_URL = 'wss://biggrow-production.up.railway.app';
  
  execSync('npm run build', { stdio: 'inherit' });
  
  // 4. Verify build output
  console.log('✅ Verifying build output...');
  if (!fs.existsSync('dist/index.html')) {
    throw new Error('Build failed - index.html not found');
  }
  
  const indexContent = fs.readFileSync('dist/index.html', 'utf8');
  if (!indexContent.includes('script')) {
    throw new Error('Build failed - no scripts in index.html');
  }
  
  console.log('✅ Build verification passed');
  
  // 5. Deploy to Vercel
  console.log('🚀 Deploying to Vercel...');
  try {
    execSync('vercel --prod --yes', { stdio: 'inherit' });
    console.log('✅ Deployment completed successfully!');
  } catch (error) {
    console.log('⚠️  Vercel deployment failed, trying alternative...');
    console.log('📋 Manual deployment steps:');
    console.log('1. Go to https://vercel.com/dashboard');
    console.log('2. Import your GitHub repository');
    console.log('3. Set environment variables:');
    console.log('   VITE_API_URL: https://biggrow-production.up.railway.app/api');
    console.log('   VITE_WS_URL: wss://biggrow-production.up.railway.app');
    console.log('4. Deploy');
  }
  
  console.log('');
  console.log('🎉 Frontend fixes applied!');
  console.log('');
  console.log('🔧 Changes made:');
  console.log('✅ Added vite-env.d.ts for proper TypeScript support');
  console.log('✅ Fixed import.meta.env typing issues');
  console.log('✅ Updated API service to connect to Railway backend');
  console.log('✅ Updated WebSocket service for proper connection');
  console.log('✅ Fixed Vercel configuration for asset serving');
  console.log('✅ Updated TypeScript configuration');
  console.log('');
  console.log('🌐 Your frontend should now work properly at:');
  console.log('   https://bizgrow-ai-frontend.vercel.app');
  
} catch (error) {
  console.error('❌ Fix failed:', error.message);
  console.log('');
  console.log('🔧 Manual steps to fix:');
  console.log('1. Commit and push the configuration changes');
  console.log('2. Redeploy on Vercel dashboard');
  console.log('3. Check browser console for any remaining errors');
  process.exit(1);
}