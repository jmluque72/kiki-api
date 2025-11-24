require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../shared/models/User');
const config = require('../config/env.config');

// Función helper para aplicar PEPPER
function applyPepper(password) {
  if (!config.PEPPER) {
    return password;
  }
  return crypto.createHmac('sha256', config.PEPPER).update(password).digest('hex') + password;
}

async function fixAllPasswords() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    if (!config.PEPPER) {
      console.log('❌ PEPPER no está configurado. No hay nada que arreglar.');
      process.exit(0);
    }

    console.log('\n📋 Buscando usuarios con problemas...');
    
    // Buscar usuarios que tienen contraseña pero no tienen passwordUsesPepper marcado
    const usersToFix = await User.find({
      password: { $exists: true, $ne: null },
      $or: [
        { passwordUsesPepper: { $exists: false } },
        { passwordUsesPepper: false },
        { passwordUsesPepper: null }
      ]
    }).select('+password email');

    console.log(`\n📊 Usuarios encontrados: ${usersToFix.length}`);

    if (usersToFix.length === 0) {
      console.log('✅ No hay usuarios que necesiten corrección.');
      process.exit(0);
    }

    console.log('\n⚠️  ADVERTENCIA: Este script marcará todos los usuarios como que usan PEPPER.');
    console.log('   Esto asume que las contraseñas fueron hasheadas CON PEPPER.');
    console.log('   Si las contraseñas fueron hasheadas SIN PEPPER, esto causará que el login falle.');
    console.log('\n   Presiona Ctrl+C para cancelar, o espera 5 segundos para continuar...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    let fixed = 0;
    let errors = 0;

    for (const user of usersToFix) {
      try {
        console.log(`\n🔧 Procesando: ${user.email}`);
        
        // Marcar como que usa PEPPER
        user.passwordUsesPepper = true;
        await user.save();
        
        console.log(`   ✅ passwordUsesPepper actualizado a true`);
        fixed++;
      } catch (error) {
        console.error(`   ❌ Error procesando ${user.email}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Resumen:');
    console.log(`   ✅ Arreglados: ${fixed}`);
    console.log(`   ❌ Errores: ${errors}`);

    console.log('\n💡 IMPORTANTE:');
    console.log('   Si después de esto el login sigue fallando, puede ser que:');
    console.log('   1. Las contraseñas fueron hasheadas SIN PEPPER');
    console.log('   2. Necesitas resetear las contraseñas de los usuarios afectados');
    console.log('\n   Para resetear contraseñas, usa:');
    console.log('      node scripts/reset-user-password.js <email> <nueva-contraseña>');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAllPasswords();

