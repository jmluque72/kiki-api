require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../shared/models/User');
const config = require('../config/env.config');

// Función helper para aplicar PEPPER (igual que en User.js)
function applyPepper(password) {
  if (!config.PEPPER) {
    return password;
  }
  return crypto.createHmac('sha256', config.PEPPER).update(password).digest('hex') + password;
}

async function diagnoseAndFix() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    console.log('\n📋 Configuración actual:');
    console.log(`   PEPPER configurado: ${config.PEPPER ? '✅ SÍ' : '❌ NO'}`);
    if (config.PEPPER) {
      console.log(`   PEPPER length: ${config.PEPPER.length} caracteres`);
    }

    // Obtener un usuario de prueba
    const testEmail = process.argv[2] || 'test@example.com';
    console.log(`\n🔍 Buscando usuario: ${testEmail}`);
    
    const user = await User.findOne({ email: testEmail }).select('+password +passwordUsesPepper');
    
    if (!user) {
      console.log('❌ Usuario no encontrado');
      console.log('\n💡 Usuarios disponibles:');
      const users = await User.find({}).limit(5).select('email status');
      users.forEach(u => console.log(`   - ${u.email} (${u.status})`));
      process.exit(1);
    }

    console.log(`\n✅ Usuario encontrado: ${user.email}`);
    console.log(`   passwordUsesPepper: ${user.passwordUsesPepper ? '✅ true' : '❌ false'}`);
    console.log(`   password existe: ${user.password ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   password length: ${user.password ? user.password.length : 0} caracteres`);

    // Probar diferentes escenarios
    console.log('\n🧪 Probando escenarios de comparación:');
    
    const testPassword = process.argv[3] || 'test123';
    console.log(`   Contraseña de prueba: ${testPassword}`);

    // Escenario 1: Comparar sin PEPPER
    console.log('\n   1. Comparación SIN PEPPER:');
    try {
      const isValidWithoutPepper = await bcrypt.compare(testPassword, user.password);
      console.log(`      Resultado: ${isValidWithoutPepper ? '✅ VÁLIDA' : '❌ INVÁLIDA'}`);
    } catch (error) {
      console.log(`      Error: ${error.message}`);
    }

    // Escenario 2: Comparar con PEPPER (si está configurado)
    if (config.PEPPER) {
      console.log('\n   2. Comparación CON PEPPER:');
      try {
        const passwordWithPepper = applyPepper(testPassword);
        const isValidWithPepper = await bcrypt.compare(passwordWithPepper, user.password);
        console.log(`      Resultado: ${isValidWithPepper ? '✅ VÁLIDA' : '❌ INVÁLIDA'}`);
        
        if (isValidWithPepper && !user.passwordUsesPepper) {
          console.log('\n   ⚠️  PROBLEMA DETECTADO:');
          console.log('      La contraseña funciona CON PEPPER pero passwordUsesPepper=false');
          console.log('      Esto causa que el login falle.');
          
          // Preguntar si quiere arreglarlo
          if (process.argv[4] === '--fix') {
            console.log('\n   🔧 Arreglando...');
            user.passwordUsesPepper = true;
            await user.save();
            console.log('   ✅ passwordUsesPepper actualizado a true');
          } else {
            console.log('\n   💡 Para arreglar, ejecuta:');
            console.log(`      node scripts/fix-password-login.js ${testEmail} ${testPassword} --fix`);
          }
        }
      } catch (error) {
        console.log(`      Error: ${error.message}`);
      }
    }

    // Estadísticas generales
    console.log('\n📊 Estadísticas de usuarios:');
    const totalUsers = await User.countDocuments({});
    const usersWithPepper = await User.countDocuments({ passwordUsesPepper: true });
    const usersWithoutPepper = await User.countDocuments({ 
      passwordUsesPepper: { $ne: true },
      password: { $exists: true, $ne: null }
    });
    
    console.log(`   Total usuarios: ${totalUsers}`);
    console.log(`   Con passwordUsesPepper=true: ${usersWithPepper}`);
    console.log(`   Sin passwordUsesPepper: ${usersWithoutPepper}`);

    if (config.PEPPER && usersWithoutPepper > 0) {
      console.log('\n   ⚠️  HAY USUARIOS QUE PUEDEN TENER PROBLEMAS DE LOGIN');
      console.log('   💡 Para arreglar todos, ejecuta:');
      console.log('      node scripts/fix-all-passwords-pepper.js');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

diagnoseAndFix();

