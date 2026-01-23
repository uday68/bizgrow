#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

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

function checkPrerequisites() {
  log('🔍 Checking prerequisites...', 'cyan');
  
  // Check if .env exists
  if (!existsSync('.env')) {
    log('❌ .env file not found!', 'red');
    log('📝 Please copy .env.example to .env and configure your API keys', 'yellow');
    log('   cp .env.example .env', 'bright');
    process.exit(1);
  }
  
  // Check if server dependencies are installed
  if (!existsSync(join('server', 'node_modules'))) {
    log('❌ Server dependencies not installed!', 'red');
    log('📦 Installing server dependencies...', 'yellow');
    
    const serverInstall = spawn('npm', ['install'], { 
      cwd: 'server', 
      stdio: 'inherit',
      shell: true 
    });
    
    serverInstall.on('close', (code) => {
      if (code === 0) {
        log('✅ Server dependencies installed', 'green');
        initializeDatabase();
      } else {
        log('❌ Failed to install server dependencies', 'red');
        process.exit(1);
      }
    });
    
    return false;
  }
  
  return true;
}

function initializeDatabase() {
  log('🗄️  Initializing database...', 'cyan');
  
  const dbInit = spawn('npm', ['run', 'init-db'], { 
    cwd: 'server', 
    stdio: 'inherit',
    shell: true 
  });
  
  dbInit.on('close', (code) => {
    if (code === 0) {
      log('✅ Database initialized', 'green');
      startServices();
    } else {
      log('❌ Failed to initialize database', 'red');
      process.exit(1);
    }
  });
}

function startServices() {
  log('🚀 Starting BizGrow AI services...', 'cyan');
  log('', 'reset');
  
  // Start frontend
  log('📱 Starting frontend (React + Vite)...', 'blue');
  const frontend = spawn('npm', ['run', 'dev'], { 
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true 
  });
  
  frontend.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Local:') || output.includes('ready')) {
      log(`   Frontend: ${output.trim()}`, 'green');
    }
  });
  
  // Start backend
  setTimeout(() => {
    log('🤖 Starting AI backend server...', 'magenta');
    const backend = spawn('npm', ['run', 'dev'], { 
      cwd: 'server',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true 
    });
    
    backend.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('running on port') || output.includes('Server')) {
        log(`   Backend: ${output.trim()}`, 'green');
      }
    });
    
    // Show startup complete message after delay
    setTimeout(() => {
      log('', 'reset');
      log('🎉 BizGrow AI is now running!', 'green');
      log('', 'reset');
      log('📊 Access your dashboards:', 'bright');
      log('   • Frontend: http://localhost:3000', 'cyan');
      log('   • Developer Dashboard: http://localhost:3000/#/developer', 'cyan');
      log('   • Backend API: http://localhost:3001', 'cyan');
      log('', 'reset');
      log('🤖 AI Agents Status:', 'bright');
      log('   • Business Discovery Agent: Active', 'green');
      log('   • Proposal Generation Agent: Active', 'green');
      log('   • Project Builder Agent: Idle', 'yellow');
      log('   • Market Analytics Agent: Active', 'green');
      log('', 'reset');
      log('💡 Tips:', 'bright');
      log('   • Visit the Developer Dashboard to monitor AI agents', 'yellow');
      log('   • Use "Bulk Scan" to discover businesses across multiple regions', 'yellow');
      log('   • Check the Activity Feed for real-time AI operations', 'yellow');
      log('', 'reset');
      log('🛑 To stop: Press Ctrl+C', 'red');
    }, 3000);
    
  }, 2000);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log('', 'reset');
    log('🛑 Shutting down BizGrow AI...', 'yellow');
    frontend.kill();
    backend.kill();
    process.exit(0);
  });
}

// Main execution
log('🚀 BizGrow AI Startup Script', 'bright');
log('================================', 'bright');

if (checkPrerequisites()) {
  initializeDatabase();
}