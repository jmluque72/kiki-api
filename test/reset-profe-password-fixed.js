const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a la base de datos
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kiki_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function resetProfePassword() {
  try {
    console.log('🔍 Buscando usuario profe@kiki.com...');
    
    // Buscar el usuario por email
    const user = await User.findOne({ email: 'profe@kiki.com' });
    
    if (!user) {
      console.log('❌ Usuario profe@kiki.com NO encontrado');
      return;
    }
    
    console.log('✅ Usuario encontrado:', user.email);
    
    // Nueva contraseña (sin hashear, el middleware lo hará automáticamente)
    const newPassword = 'profe123';
    
    // Actualizar la contraseña (el middleware pre-save la hasheará)
    user.password = newPassword;
    await user.save();
    
    console.log('✅ Contraseña actualizada exitosamente');
    console.log('🔑 Nueva contraseña:', newPassword);
    console.log('📧 Email:', user.email);
    
    // Probar el login usando el método del modelo
    console.log('\n🧪 Probando login con la nueva contraseña...');
    
    const isPasswordValid = await user.comparePassword(newPassword);
    
    if (isPasswordValid) {
      console.log('✅ Login funciona correctamente');
    } else {
      console.log('❌ Error en el login');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

resetProfePassword(); 