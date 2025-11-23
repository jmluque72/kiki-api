#!/usr/bin/env node

/**
 * Script para iniciar el worker de emails
 * Uso: node api/workers/start-email-worker.js
 */

const path = require('path');

// Cambiar al directorio del proyecto si es necesario
process.chdir(path.join(__dirname, '..'));

// Iniciar el worker
require('./emailWorker');

