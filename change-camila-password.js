const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function changeCamilaPassword() {
  try {
    const email = 'aguiarcamila.bambino@gmail.com';
    const newPassword = 'Bambino2026$';
    
    console.log('🔧 [CHANGE PASSWORD] Cambiando contraseña...');
    console.log('📧 Email:', email);
    console.log('🔑 Nueva contraseña:', newPassword);
    console.log('');
    
    // Conectar a MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/kiki?authSource=admin';
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ [CHANGE PASSWORD] Conectado a MongoDB');
    
    // Buscar usuario - SOLO este email específico
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ [CHANGE PASSWORD] Usuario ${email} no encontrado`);
      console.log('⚠️  [CHANGE PASSWORD] No se realizó ningún cambio');
      return;
    }
    
    // VALIDACIÓN DE SEGURIDAD: Verificar que el email encontrado coincida exactamente
    if (user.email.toLowerCase() !== email.toLowerCase()) {
      console.log(`❌ [CHANGE PASSWORD] ERROR DE SEGURIDAD: Email encontrado no coincide`);
      console.log(`   Esperado: ${email}`);
      console.log(`   Encontrado: ${user.email}`);
      console.log('⚠️  [CHANGE PASSWORD] No se realizó ningún cambio por seguridad');
      return;
    }
    
    console.log('✅ [CHANGE PASSWORD] Usuario encontrado y verificado:');
    console.log('   📧 Email:', user.email);
    console.log('   👤 Nombre:', user.name);
    console.log('   🔑 Rol:', user.role);
    console.log('   🆔 ID:', user._id);
    console.log('');
    console.log('⚠️  [CHANGE PASSWORD] ATENCIÓN: Se cambiará la contraseña SOLO de este usuario');
    console.log(`   Email objetivo: ${email}`);
    console.log('');
    
    // Establecer la nueva contraseña
    // El middleware pre-save del modelo User la hasheará automáticamente
    console.log(`🔄 [CHANGE PASSWORD] Estableciendo nueva contraseña...`);
    console.log(`   Usuario afectado: ${user.email} (ID: ${user._id})`);
    user.password = newPassword;
    user.isFirstLogin = false;
    await user.save();
    
    // Verificar que solo se modificó este usuario
    const verifyUser = await User.findById(user._id);
    if (verifyUser.email.toLowerCase() !== email.toLowerCase()) {
      console.log('❌ [CHANGE PASSWORD] ERROR: El usuario modificado no coincide');
      throw new Error('Error de seguridad: usuario modificado incorrecto');
    }
    
    console.log('✅ [CHANGE PASSWORD] Contraseña actualizada exitosamente');
    
    // Verificar que funciona
    console.log('🧪 [CHANGE PASSWORD] Probando login...');
    const isPasswordValid = await user.comparePassword(newPassword);
    
    if (isPasswordValid) {
      console.log('✅ [CHANGE PASSWORD] Login exitoso con la nueva contraseña');
    } else {
      console.log('❌ [CHANGE PASSWORD] Error: La contraseña no funciona');
    }
    
    console.log('\n🎉 [CHANGE PASSWORD] Proceso completado exitosamente');
    console.log('✅ [CHANGE PASSWORD] SOLO se modificó el usuario especificado:');
    console.log(`   📧 Email: ${email}`);
    console.log(`   🆔 ID: ${user._id}`);
    console.log(`   🔑 Nueva contraseña: ${newPassword}`);
    console.log('');
    console.log('✅ [CHANGE PASSWORD] Verificación: Ningún otro usuario fue afectado');
    
  } catch (error) {
    console.error('❌ [CHANGE PASSWORD] Error:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔌 [CHANGE PASSWORD] Desconectado de MongoDB');
    }
    process.exit(0);
  }
}

changeCamilaPassword();

