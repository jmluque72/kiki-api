const mongoose = require('mongoose');
require('dotenv').config();
const config = require('../config/database');

const Notification = require('../shared/models/Notification');

async function createIndex() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB');

    console.log('\n📊 Creando índice compuesto para Notification (account + sentAt)...');
    
    try {
      // Crear el índice compuesto crítico para getAllInstitutionNotifications
      await Notification.collection.createIndex(
        { account: 1, sentAt: -1 },
        { 
          background: true,
          name: 'account_sentAt_idx'
        }
      );
      console.log('✅ Índice creado: Notification.account + sentAt');
    } catch (error) {
      if (error.code === 85) {
        console.log('⚠️  Índice Notification.account + sentAt ya existe');
      } else {
        throw error;
      }
    }

    console.log('\n📋 Verificando índices actuales de Notification:');
    const indexes = await Notification.collection.indexes();
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Verificar específicamente el índice compuesto
    const hasCompoundIndex = indexes.some(idx => 
      idx.key && idx.key.account === 1 && idx.key.sentAt === -1
    );
    
    if (hasCompoundIndex) {
      console.log('\n✅ Índice compuesto { account: 1, sentAt: -1 } está presente');
    } else {
      console.log('\n❌ Índice compuesto { account: 1, sentAt: -1 } NO está presente');
    }

    console.log('\n✅ Proceso completado');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createIndex();
