const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function resetAllPasswords() {
  try {
    console.log('🔧 [RESET PASSWORDS] Reseteando contraseñas de todos los usuarios...');
    console.log('📦 [RESET PASSWORDS] Conectando a MongoDB...');
    
    // Usar la URI del .env que tiene las credenciales correctas
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI no está definida en el archivo .env');
    }
    
    console.log('🔗 [RESET PASSWORDS] URI:', mongoUri.replace(/:[^:@]+@/, ':****@')); // Ocultar password en logs
    
    // Conectar a MongoDB y esperar
    await mongoose.connect(mongoUri);
    
    console.log('✅ [RESET PASSWORDS] Conectado a MongoDB');
    
    // Buscar todos los usuarios excepto admin@kiki.com.ar
    const users = await User.find({ email: { $ne: 'admin@kiki.com.ar' } });
    
    if (users.length === 0) {
      console.log('⚠️  [RESET PASSWORDS] No se encontraron usuarios para actualizar');
      return;
    }
    
    console.log(`\n📋 [RESET PASSWORDS] Encontrados ${users.length} usuarios para actualizar`);
    console.log('🔑 [RESET PASSWORDS] Nueva contraseña: Mati123!\n');
    
    const newPassword = 'Mati123!';
    let successCount = 0;
    let errorCount = 0;
    
    // Actualizar cada usuario
    for (const user of users) {
      try {
        console.log(`👤 [RESET PASSWORDS] Actualizando: ${user.email} (${user.name || 'Sin nombre'})`);
        
        // Verificar si el usuario tiene contraseña (algunos pueden ser de Cognito)
        if (!user.password) {
          console.log(`   ⚠️  Usuario sin contraseña (posiblemente Cognito), saltando...`);
          continue;
        }
        
        // Actualizar contraseña (el middleware pre-save la hasheará automáticamente)
        user.password = newPassword;
        user.isFirstLogin = false;
        
        await user.save();
        
        // Verificar que funciona
        const isPasswordValid = await user.comparePassword(newPassword);
        
        if (isPasswordValid) {
          console.log(`   ✅ Contraseña actualizada y verificada`);
          successCount++;
        } else {
          console.log(`   ⚠️  Contraseña actualizada pero verificación falló`);
          errorCount++;
        }
        
      } catch (error) {
        console.error(`   ❌ Error actualizando ${user.email}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n📊 [RESET PASSWORDS] Resumen:`);
    console.log(`   ✅ Contraseñas actualizadas exitosamente: ${successCount}`);
    console.log(`   ❌ Errores: ${errorCount}`);
    console.log(`   📋 Total procesados: ${users.length}`);
    
    console.log(`\n🎉 [RESET PASSWORDS] Proceso completado`);
    console.log(`\n🔑 [RESET PASSWORDS] Todas las contraseñas (excepto admin@kiki.com.ar) ahora son: Mati123!`);
    console.log(`📧 [RESET PASSWORDS] admin@kiki.com.ar mantiene su contraseña original: admin123`);
    
  } catch (error) {
    console.error('❌ [RESET PASSWORDS] Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 [RESET PASSWORDS] Desconectado de MongoDB');
  }
}

// Ejecutar el script
resetAllPasswords();

