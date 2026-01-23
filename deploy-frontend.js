#!/usr/bin/env node

/**
 * BizGrow AI Frontend Deployment Script
 * Helps deploy the React frontend to various platforms
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BACKEND_URL = 'https://biggrow-production.up.railway.app';

console.log('🚀 BizGrow AI Frontend Deployment');
console.log('=' .repeat(50));
console.log(`Backend API: ${BACKEND_URL}`);
console.log('');

// Check if we have the required files
const requiredFiles = ['package.json', 'vite.config.ts', 'index.html'];
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
  console.error('❌ Missing required files:', missingFiles.join(', '));
  process.exit(1);
}

// Get deployment platform from command line args
const platform = process.argv[2] || 'vercel';

console.log(`📦 Deploying to: ${platform}`);
console.log('');

try {
  switch (platform.toLowerCase()) {
    case 'vercel':
      deployToVercel();
      break;
    case 'netlify':
      deployToNetlify();
      break;
    case 'build':
      buildOnly();
      break;
    default:
      console.log('Usage: node deploy-frontend.js [vercel|netlify|build]');
      console.log('');
      console.log('Available platforms:');
      console.log('  vercel  - Deploy to Vercel (recommended)');
      console.log('  netlify - Deploy to Netlify');
      console.log('  build   - Build only (for manual deployment)');
      process.exit(1);
  }
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}

function deployToVercel() {
  console.log('🔧 Deploying to Vercel...');
  
  // Check if Vercel CLI is installed
  try {
    execSync('vercel --version', { stdio: 'ignore' });
  } catch (error) {
    console.log('📦 Installing Vercel CLI...');
    execSync('npm install -g vercel', { stdio: 'inherit' });
  }
  
  // Build the project
  console.log('🏗️  Building project...');
  execSync('npm run build', { stdio: 'inherit' });
  
  // Deploy to Vercel
  console.log('🚀 Deploying to Vercel...');
  execSync('vercel --prod --yes', { stdio: 'inherit' });
  
  console.log('');
  console.log('✅ Deployment to Vercel completed!');
  console.log('');
  console.log('📋 Next steps:');
  console.log('1. Check your Vercel dashboard for the live URL');
  console.log('2. Test the frontend with your Railway backend');
  console.log('3. Verify WebSocket connections are working');
}

function deployToNetlify() {
  console.log('🔧 Deploying to Netlify...');
  
  // Check if Netlify CLI is installed
  try {
    execSync('netlify --version', { stdio: 'ignore' });
  } catch (error) {
    console.log('📦 Installing Netlify CLI...');
    execSync('npm install -g netlify-cli', { stdio: 'inherit' });
  }
  
  // Build the project
  console.log('🏗️  Building project...');
  execSync('npm run build', { stdio: 'inherit' });
  
  // Deploy to Netlify
  console.log('🚀 Deploying to Netlify...');
  execSync('netlify deploy --prod --dir=dist', { stdio: 'inherit' });
  
  console.log('');
  console.log('✅ Deployment to Netlify completed!');
  console.log('');
  console.log('📋 Next steps:');
  console.log('1. Check your Netlify dashboard for the live URL');
  console.log('2. Test the frontend with your Railway backend');
  console.log('3. Verify all API endpoints are accessible');
}

function buildOnly() {
  console.log('🏗️  Building project for manual deployment...');
  
  // Set environment variables for build
  process.env.VITE_API_URL = `${BACKEND_URL}/api`;
  process.env.VITE_WS_URL = BACKEND_URL.replace('https:', 'wss:');
  
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('');
  console.log('✅ Build completed!');
  console.log('');
  console.log('📁 Built files are in the "dist" directory');
  console.log('');
  console.log('🌐 Manual deployment options:');
  console.log('1. Upload "dist" folder to any static hosting service');
  console.log('2. Use GitHub Pages with the built files');
  console.log('3. Deploy to Firebase Hosting, Surge.sh, etc.');
  console.log('');
  console.log('🔧 Environment variables used:');
  console.log(`   VITE_API_URL: ${process.env.VITE_API_URL}`);
  console.log(`   VITE_WS_URL: ${process.env.VITE_WS_URL}`);
}