const mongoose = require('mongoose');
require('dotenv').config();
const config = require('../config/database');

const Notification = require('../shared/models/Notification');
const Shared = require('../shared/models/Shared');

async function addIndexes() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    console.log('\n📊 Agregando índices a Notification...');
    
    // Índice para readBy.user (usado en consultas de notificaciones leídas)
    try {
      await Notification.collection.createIndex({ 'readBy.user': 1 });
      console.log('✅ Índice creado: Notification.readBy.user');
    } catch (error) {
      if (error.code === 85) {
        console.log('⚠️  Índice Notification.readBy.user ya existe');
      } else {
        throw error;
      }
    }

    // Índice compuesto para recipients y account (usado frecuentemente)
    try {
      await Notification.collection.createIndex({ recipients: 1, account: 1 });
      console.log('✅ Índice creado: Notification.recipients + account');
    } catch (error) {
      if (error.code === 85) {
        console.log('⚠️  Índice Notification.recipients + account ya existe');
      } else {
        throw error;
      }
    }

    console.log('\n📊 Agregando índices a Shared...');
    
    // Índice compuesto para student + status (usado en getNotificationDetails)
    try {
      await Shared.collection.createIndex({ student: 1, status: 1 });
      console.log('✅ Índice creado: Shared.student + status');
    } catch (error) {
      if (error.code === 85) {
        console.log('⚠️  Índice Shared.student + status ya existe');
      } else {
        throw error;
      }
    }

    // Verificar índice user + status (ya debería existir pero verificamos)
    try {
      const indexes = await Shared.collection.indexes();
      const hasUserStatusIndex = indexes.some(idx => 
        idx.key && idx.key.user === 1 && idx.key.status === 1
      );
      if (!hasUserStatusIndex) {
        await Shared.collection.createIndex({ user: 1, status: 1 });
        console.log('✅ Índice creado: Shared.user + status');
      } else {
        console.log('✅ Índice Shared.user + status ya existe');
      }
    } catch (error) {
      if (error.code === 85) {
        console.log('⚠️  Índice Shared.user + status ya existe');
      } else {
        throw error;
      }
    }

    console.log('\n📋 Listando índices actuales de Notification:');
    const notificationIndexes = await Notification.collection.indexes();
    notificationIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log('\n📋 Listando índices actuales de Shared:');
    const sharedIndexes = await Shared.collection.indexes();
    sharedIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log('\n✅ Índices agregados exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addIndexes();

