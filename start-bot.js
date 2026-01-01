#!/usr/bin/env node
/**
 * Automated Bot Startup Script
 * 
 * Handles:
 * - Database initialization/validation
 * - Configuration checks
 * - Automatic database repair if needed
 * - Bot startup with proper instance
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Sqlite = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'bot.db');
const SQL_PATH = path.join(__dirname, 'bot.sql');
const DEFAULT_INSTANCE = 'instance.paper.15m.js';

console.log('\n🤖 Crypto Trading Bot - Automated Startup\n');

// Step 1: Check if configuration exists
function checkConfig() {
  console.log('📋 Checking configuration...');
  
  if (!fs.existsSync('conf.json')) {
    console.log('⚠️  conf.json not found, copying from template...');
    if (fs.existsSync('conf.json.dist')) {
      fs.copyFileSync('conf.json.dist', 'conf.json');
      console.log('✅ conf.json created from template');
    } else {
      console.error('❌ conf.json.dist template not found!');
      process.exit(1);
    }
  } else {
    console.log('✅ Configuration file found');
  }
}

// Step 2: Initialize or validate database
function initializeDatabase() {
  console.log('\n📊 Checking database...');
  
  let needsInit = false;
  let db;
  
  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    console.log('⚠️  Database not found, will create new one');
    needsInit = true;
  } else {
    // Database exists, check if it's valid
    try {
      db = Sqlite(DB_PATH);
      
      // Check for required tables
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN (
          'candlesticks', 'ticker', 'orders', 'trades', 
          'signals', 'symbols', 'logs'
        )
      `).all();
      
      const requiredTables = ['candlesticks', 'ticker', 'orders', 'trades', 'signals', 'symbols', 'logs'];
      const existingTables = tables.map(t => t.name);
      const missingTables = requiredTables.filter(t => !existingTables.includes(t));
      
      if (missingTables.length > 0) {
        console.log(`⚠️  Missing tables: ${missingTables.join(', ')}`);
        needsInit = true;
        db.close();
      } else {
        console.log(`✅ Database valid (${tables.length} tables found)`);
        db.close();
      }
    } catch (e) {
      console.log('⚠️  Database corrupted or invalid:', e.message);
      needsInit = true;
      if (db) db.close();
    }
  }
  
  // Initialize database if needed
  if (needsInit) {
    console.log('🔧 Initializing database...');
    
    // Backup old database if it exists
    if (fs.existsSync(DB_PATH)) {
      const backupPath = `${DB_PATH}.backup.${Date.now()}`;
      fs.renameSync(DB_PATH, backupPath);
      console.log(`📦 Old database backed up to: ${path.basename(backupPath)}`);
    }
    
    // Read SQL schema
    if (!fs.existsSync(SQL_PATH)) {
      console.error('❌ bot.sql schema file not found!');
      process.exit(1);
    }
    
    const sqlContent = fs.readFileSync(SQL_PATH, 'utf8');
    
    // Create and initialize database
    try {
      db = Sqlite(DB_PATH);
      db.exec(sqlContent);
      
      // Verify initialization
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all();
      
      console.log(`✅ Database initialized successfully (${tables.length} tables)`);
      db.close();
    } catch (e) {
      console.error('❌ Database initialization failed:', e.message);
      if (db) db.close();
      process.exit(1);
    }
  }
}

// Step 3: Check instance file
function checkInstance() {
  console.log('\n📝 Checking trading instance...');
  
  const instanceArg = process.argv.find(arg => arg.includes('instance'));
  let instanceFile;
  
  if (instanceArg) {
    instanceFile = instanceArg.split('=')[1] || process.argv[process.argv.indexOf(instanceArg) + 1];
  } else {
    instanceFile = DEFAULT_INSTANCE;
  }
  
  if (!fs.existsSync(instanceFile)) {
    console.error(`❌ Instance file not found: ${instanceFile}`);
    console.log('\n📁 Available instances:');
    const instances = fs.readdirSync(__dirname)
      .filter(f => f.startsWith('instance.') && f.endsWith('.js'))
      .forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  
  console.log(`✅ Using instance: ${instanceFile}`);
  return instanceFile;
}

// Step 4: Start the bot
function startBot(instanceFile) {
  console.log('\n🚀 Starting bot...\n');
  console.log('─'.repeat(60));
  
  const args = ['index.js', 'trade', '--instance', instanceFile];
  const bot = spawn('node', args, {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  bot.on('error', (error) => {
    console.error('❌ Failed to start bot:', error.message);
    process.exit(1);
  });
  
  bot.on('exit', (code) => {
    if (code !== 0) {
      console.error(`\n❌ Bot exited with code ${code}`);
      process.exit(code);
    }
  });
  
  // Handle shutdown signals
  process.on('SIGINT', () => {
    console.log('\n\n⏹️  Shutting down...');
    bot.kill('SIGINT');
    setTimeout(() => process.exit(0), 1000);
  });
  
  process.on('SIGTERM', () => {
    bot.kill('SIGTERM');
    setTimeout(() => process.exit(0), 1000);
  });
}

// Main execution
try {
  checkConfig();
  initializeDatabase();
  const instanceFile = checkInstance();
  startBot(instanceFile);
} catch (error) {
  console.error('\n❌ Startup failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
