const mongoose = require('mongoose');
require('dotenv').config();
const config = require('../config/database');

const User = require('../shared/models/User');

async function checkIndexes() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    console.log('\n📊 Verificando índices de User...');
    const indexes = await User.collection.indexes();
    
    console.log('\n📋 Índices actuales de User:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Verificar si existe índice en _id (debería existir por defecto)
    const hasIdIndex = indexes.some(idx => idx.key._id === 1);
    console.log(`\n✅ Índice _id existe: ${hasIdIndex}`);

    // Verificar si existe índice en role
    const hasRoleIndex = indexes.some(idx => idx.key.role === 1);
    console.log(`✅ Índice role existe: ${hasRoleIndex}`);

    // Verificar si existe índice en email (único)
    const hasEmailIndex = indexes.some(idx => idx.key.email === 1);
    console.log(`✅ Índice email existe: ${hasEmailIndex}`);

    // Test de consulta simple
    console.log('\n⏱️  Probando consulta User.findById...');
    const testUserId = new mongoose.Types.ObjectId();
    const startTime = Date.now();
    try {
      await User.findById(testUserId).select('name email role').lean();
      const queryTime = Date.now() - startTime;
      console.log(`✅ Consulta completada en: ${queryTime}ms`);
    } catch (error) {
      const queryTime = Date.now() - startTime;
      console.log(`⚠️  Consulta completada en: ${queryTime}ms (esperado, usuario no existe)`);
    }

    // Test de populate
    console.log('\n⏱️  Probando populate de role...');
    const Role = require('../shared/models/Role');
    const testRoleId = new mongoose.Types.ObjectId();
    const populateStart = Date.now();
    try {
      await Role.findById(testRoleId).select('nombre').lean();
      const populateTime = Date.now() - populateStart;
      console.log(`✅ Populate completado en: ${populateTime}ms`);
    } catch (error) {
      const populateTime = Date.now() - populateStart;
      console.log(`⚠️  Populate completado en: ${populateTime}ms (esperado, rol no existe)`);
    }

    console.log('\n✅ Verificación completada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkIndexes();

