#!/usr/bin/env node

/**
 * Environment Variable Checker
 * Verifies all required environment variables are set
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from parent directory
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

console.log('🔍 Environment Variable Check');
console.log('=' .repeat(40));

const requiredVars = [
  'GEMINI_API_KEY',
  'NODE_ENV',
  'PORT'
];

const optionalVars = [
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASS',
  'HOST'
];

let allRequired = true;

console.log('📋 Required Variables:');
for (const varName of requiredVars) {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: [CONFIGURED]`);
  } else {
    console.log(`❌ ${varName}: NOT SET`);
    allRequired = false;
  }
}

console.log('\n📋 Optional Variables:');
for (const varName of optionalVars) {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${varName.includes('PASS') ? '***' : value}`);
  } else {
    console.log(`⚠️  ${varName}: Not set (optional)`);
  }
}

console.log('\n' + '=' .repeat(40));

if (allRequired) {
  console.log('🎉 All required environment variables are set!');
  console.log('\n🚀 Your application should start successfully.');
} else {
  console.log('❌ Missing required environment variables!');
  console.log('\n🔧 To fix this:');
  console.log('1. Check your .env file');
  console.log('2. Verify Railway environment variables');
  console.log('3. Ensure GEMINI_API_KEY is set correctly');
  process.exit(1);
}

// Test Gemini API key format
const apiKey = process.env.GEMINI_API_KEY;
if (apiKey) {
  if (apiKey.startsWith('AIza')) {
    console.log('✅ Gemini API key format looks correct');
  } else {
    console.log('⚠️  Gemini API key format may be incorrect (should start with "AIza")');
  }
}