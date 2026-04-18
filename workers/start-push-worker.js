#!/usr/bin/env node

/**
 * Script para iniciar el worker de push notifications en modo standalone
 * 
 * Uso:
 *   node start-push-worker.js
 * 
 * O usando npm:
 *   npm run worker:push
 */

const { startPushWorker } = require('./pushWorker');

console.log('🚀 Iniciando worker de push notifications en modo standalone...');
startPushWorker().catch((error) => {
  console.error('❌ Error fatal en worker:', error);
  process.exit(1);
});

