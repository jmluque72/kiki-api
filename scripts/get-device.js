const mongoose = require('mongoose');
require('dotenv').config();
const config = require('../config/database');
const Device = require('../shared/models/Device');
const User = require('../shared/models/User');

async function getDevice() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar el primer dispositivo
    const device = await Device.findOne().populate('userId', 'name email');
    
    if (!device) {
      console.log('❌ No se encontraron dispositivos en la base de datos');
      process.exit(0);
    }

    console.log('📱 ========== DISPOSITIVO ENCONTRADO ==========');
    console.log(`ID: ${device._id}`);
    console.log(`Usuario ID: ${device.userId?._id || device.userId}`);
    console.log(`Usuario: ${device.userId?.name || device.userId?.email || 'N/A'}`);
    console.log(`Plataforma: ${device.platform}`);
    console.log(`Token: ${device.pushToken}`);
    console.log(`Activo: ${device.isActive}`);
    console.log(`Device ID: ${device.deviceId || 'N/A'}`);
    console.log(`App Version: ${device.appVersion || 'N/A'}`);
    console.log(`OS Version: ${device.osVersion || 'N/A'}`);
    console.log(`Último uso: ${device.lastUsed}`);
    console.log(`Creado: ${device.createdAt}`);
    console.log(`Actualizado: ${device.updatedAt}`);

    // Mostrar también el token completo para poder usarlo
    console.log('\n📋 ========== TOKEN PARA PRUEBA ==========');
    console.log(`Token completo: ${device.pushToken}`);
    console.log(`\nPara enviar un push de prueba, ejecuta:`);
    console.log(`node scripts/send-test-push.js ${device.pushToken} --platform ${device.platform}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

getDevice();
