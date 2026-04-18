const mongoose = require('mongoose');
require('dotenv').config();
const config = require('./config/database');
const User = require('./shared/models/User');

async function updateUserPassword() {
  try {
    // Conectar a MongoDB
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    const email = 'jmluque72@gmail.com';
    const newPassword = 'Matu123!';

    // Buscar el usuario
    console.log(`🔍 Buscando usuario con email: ${email}`);
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`❌ Usuario no encontrado con email: ${email}`);
      return;
    }

    console.log(`✅ Usuario encontrado: ${user.name} (${user.email})`);
    console.log(`🔄 Actualizando contraseña...`);

    // Actualizar contraseña (el middleware pre-save la hasheará automáticamente)
    user.password = newPassword;
    user.isFirstLogin = false;
    
    await user.save();

    console.log(`✅ Contraseña actualizada exitosamente para ${email}`);
    console.log(`📝 Nueva contraseña: ${newPassword}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar el script
updateUserPassword();

