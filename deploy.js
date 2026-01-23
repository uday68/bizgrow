#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createInterface } from 'readline';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function checkPrerequisites() {
  log('🔍 Checking prerequisites...', 'cyan');
  
  // Check if .env exists
  if (!existsSync('.env')) {
    log('❌ .env file not found!', 'red');
    log('📝 Please copy .env.example to .env and configure your API keys', 'yellow');
    return false;
  }
  
  // Check if GEMINI_API_KEY is set
  const envContent = readFileSync('.env', 'utf8');
  if (!envContent.includes('GEMINI_API_KEY=') || envContent.includes('GEMINI_API_KEY=your_gemini_api_key_here')) {
    log('❌ GEMINI_API_KEY not configured in .env file!', 'red');
    log('📝 Please set your actual Gemini API key in .env', 'yellow');
    return false;
  }
  
  log('✅ Prerequisites check passed', 'green');
  return true;
}

async function selectPlatform() {
  log('🚀 Select deployment platform:', 'bright');
  log('1. Railway (Recommended - 500 hours/month free)', 'cyan');
  log('2. Render (750 hours/month free)', 'cyan');
  log('3. Vercel (Unlimited for hobby)', 'cyan');
  log('4. Docker (Self-hosted)', 'cyan');
  log('5. Exit', 'yellow');
  
  const choice = await question('Enter your choice (1-5): ');
  return choice.trim();
}

async function deployRailway() {
  log('🛤️ Deploying to Railway...', 'magenta');
  
  try {
    // Check if Railway CLI is installed
    execSync('railway --version', { stdio: 'ignore' });
  } catch (error) {
    log('❌ Railway CLI not found. Installing...', 'yellow');
    try {
      execSync('npm install -g @railway/cli', { stdio: 'inherit' });
    } catch (installError) {
      log('❌ Failed to install Railway CLI. Please install manually:', 'red');
      log('npm install -g @railway/cli', 'bright');
      return;
    }
  }
  
  try {
    log('🔐 Logging into Railway...', 'cyan');
    execSync('railway login', { stdio: 'inherit' });
    
    log('📦 Initializing Railway project...', 'cyan');
    execSync('railway init', { stdio: 'inherit' });
    
    log('⚙️ Setting environment variables...', 'cyan');
    const envContent = readFileSync('.env', 'utf8');
    const geminiKey = envContent.match(/GEMINI_API_KEY=(.+)/)?.[1];
    
    if (geminiKey) {
      execSync(`railway variables set GEMINI_API_KEY="${geminiKey}"`, { stdio: 'inherit' });
      execSync('railway variables set NODE_ENV=production', { stdio: 'inherit' });
      execSync('railway variables set PORT=3001', { stdio: 'inherit' });
    }
    
    log('🚀 Deploying to Railway...', 'cyan');
    execSync('railway up', { stdio: 'inherit' });
    
    log('✅ Deployment successful!', 'green');
    log('🌐 Your app should be available at the Railway URL shown above', 'bright');
    
  } catch (error) {
    log('❌ Railway deployment failed:', 'red');
    log(error.message, 'red');
  }
}

async function deployRender() {
  log('🎨 Deploying to Render...', 'magenta');
  log('📋 Steps to deploy on Render:', 'bright');
  log('1. Push your code to GitHub', 'cyan');
  log('2. Go to https://render.com and sign up', 'cyan');
  log('3. Connect your GitHub repository', 'cyan');
  log('4. Render will auto-deploy using render.yaml', 'cyan');
  log('5. Set environment variables in Render dashboard:', 'cyan');
  log('   - GEMINI_API_KEY: your_api_key_here', 'yellow');
  log('   - NODE_ENV: production', 'yellow');
  
  const pushToGit = await question('Push to GitHub now? (y/n): ');
  if (pushToGit.toLowerCase() === 'y') {
    try {
      execSync('git add .', { stdio: 'inherit' });
      execSync('git commit -m "Add Render deployment configuration"', { stdio: 'inherit' });
      execSync('git push origin main', { stdio: 'inherit' });
      log('✅ Code pushed to GitHub', 'green');
    } catch (error) {
      log('❌ Git push failed. Please push manually.', 'red');
    }
  }
}

async function deployVercel() {
  log('⚡ Deploying to Vercel...', 'magenta');
  
  try {
    // Check if Vercel CLI is installed
    execSync('vercel --version', { stdio: 'ignore' });
  } catch (error) {
    log('❌ Vercel CLI not found. Installing...', 'yellow');
    try {
      execSync('npm install -g vercel', { stdio: 'inherit' });
    } catch (installError) {
      log('❌ Failed to install Vercel CLI. Please install manually:', 'red');
      log('npm install -g vercel', 'bright');
      return;
    }
  }
  
  try {
    log('🔐 Logging into Vercel...', 'cyan');
    execSync('vercel login', { stdio: 'inherit' });
    
    log('🚀 Deploying to Vercel...', 'cyan');
    execSync('vercel', { stdio: 'inherit' });
    
    log('⚙️ Setting environment variables...', 'cyan');
    const envContent = readFileSync('.env', 'utf8');
    const geminiKey = envContent.match(/GEMINI_API_KEY=(.+)/)?.[1];
    
    if (geminiKey) {
      execSync(`vercel env add GEMINI_API_KEY production`, { 
        stdio: 'inherit',
        input: geminiKey 
      });
    }
    
    log('✅ Deployment successful!', 'green');
    
  } catch (error) {
    log('❌ Vercel deployment failed:', 'red');
    log(error.message, 'red');
  }
}

async function deployDocker() {
  log('🐳 Deploying with Docker...', 'magenta');
  
  try {
    // Check if Docker is installed
    execSync('docker --version', { stdio: 'ignore' });
  } catch (error) {
    log('❌ Docker not found. Please install Docker first.', 'red');
    return;
  }
  
  try {
    log('🔨 Building Docker image...', 'cyan');
    execSync('docker build -t bizgrow-ai .', { stdio: 'inherit' });
    
    log('🚀 Starting Docker container...', 'cyan');
    execSync('docker-compose up -d', { stdio: 'inherit' });
    
    log('✅ Docker deployment successful!', 'green');
    log('🌐 Your app is running at http://localhost:3001', 'bright');
    log('📊 Health check: http://localhost:3001/health', 'cyan');
    
  } catch (error) {
    log('❌ Docker deployment failed:', 'red');
    log(error.message, 'red');
  }
}

async function main() {
  log('🚀 BizGrow AI Deployment Script', 'bright');
  log('================================', 'bright');
  
  const prereqsPassed = await checkPrerequisites();
  if (!prereqsPassed) {
    rl.close();
    process.exit(1);
  }
  
  const platform = await selectPlatform();
  
  switch (platform) {
    case '1':
      await deployRailway();
      break;
    case '2':
      await deployRender();
      break;
    case '3':
      await deployVercel();
      break;
    case '4':
      await deployDocker();
      break;
    case '5':
      log('👋 Goodbye!', 'yellow');
      break;
    default:
      log('❌ Invalid choice. Please run the script again.', 'red');
  }
  
  rl.close();
}

main().catch(error => {
  log('❌ Deployment script failed:', 'red');
  log(error.message, 'red');
  rl.close();
  process.exit(1);
});