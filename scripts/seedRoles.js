#!/usr/bin/env node

const mongoose = require('mongoose');
const config = require('../config/env.config');
const { seedRoles, updateRoles, deleteAllRoles, listRoles } = require('../database/seeders/roleSeeder');

// Conectar a la base de datos
const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('📦 Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

// Desconectar de la base de datos
const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error desconectando de MongoDB:', error);
  }
};

// Función principal
const main = async () => {
  const command = process.argv[2];
  
  await connectDB();
  
  try {
    switch (command) {
      case 'seed':
        console.log('🌱 Ejecutando seeder de roles...');
        await seedRoles();
        break;
        
      case 'update':
        console.log('🔄 Actualizando roles...');
        await updateRoles();
        break;
        
      case 'delete':
        console.log('🗑️  Eliminando todos los roles...');
        await deleteAllRoles();
        break;
        
      case 'list':
        console.log('📋 Listando roles...');
        await listRoles();
        break;
        
      default:
        console.log(`
🎯 Script de gestión de roles

Uso: node scripts/seedRoles.js [comando]

Comandos disponibles:
  seed    - Crear roles por defecto (solo si no existen)
  update  - Actualizar roles existentes con los valores por defecto
  delete  - Eliminar todos los roles
  list    - Listar todos los roles existentes

Ejemplos:
  node scripts/seedRoles.js seed
  node scripts/seedRoles.js list
  node scripts/seedRoles.js update
        `);
        break;
    }
  } catch (error) {
    console.error('❌ Error ejecutando comando:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
};

// Ejecutar script
main().catch(console.error); 