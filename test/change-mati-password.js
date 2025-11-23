const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function changeMatiPassword() {
  try {
    console.log('🔧 [CHANGE PASSWORD] Cambiando contraseña de matilanzaco@gmail.com...');
    
    // Conectar a MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/kiki?authSource=admin';
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ [CHANGE PASSWORD] Conectado a MongoDB');
    
    // Buscar usuario
    const email = 'matilanzaco@gmail.com';
    const newPassword = 'Mati123!';
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ [CHANGE PASSWORD] Usuario ${email} no encontrado`);
      return;
    }
    
    console.log('✅ [CHANGE PASSWORD] Usuario encontrado:', {
      email: user.email,
      name: user.name,
      role: user.role
    });
    
    // Establecer la nueva contraseña
    // El middleware pre-save del modelo User la hasheará automáticamente
    console.log(`🔄 [CHANGE PASSWORD] Estableciendo nueva contraseña: ${newPassword}`);
    user.password = newPassword;
    user.isFirstLogin = false; // Por si acaso
    await user.save();
    
    console.log('✅ [CHANGE PASSWORD] Contraseña actualizada exitosamente');
    
    // Verificar que funciona
    console.log('🧪 [CHANGE PASSWORD] Probando login...');
    const isPasswordValid = await user.comparePassword(newPassword);
    
    if (isPasswordValid) {
      console.log('✅ [CHANGE PASSWORD] Login exitoso con la nueva contraseña');
    } else {
      console.log('❌ [CHANGE PASSWORD] Error: La contraseña no funciona');
    }
    
    console.log('\n🎉 [CHANGE PASSWORD] Proceso completado');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Nueva contraseña: ${newPassword}`);
    
  } catch (error) {
    console.error('❌ [CHANGE PASSWORD] Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 [CHANGE PASSWORD] Desconectado de MongoDB');
    process.exit(0);
  }
}

changeMatiPassword();

