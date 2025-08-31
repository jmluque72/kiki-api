const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/kiki?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function fixAdminPassword() {
  try {
    console.log('🔧 [FIX ADMIN] Corrigiendo contraseña del admin...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [FIX ADMIN] Conectado a MongoDB');
    
    // Buscar usuario admin
    const user = await User.findOne({ email: 'admin@kiki.com.ar' });
    
    if (!user) {
      console.log('❌ [FIX ADMIN] Usuario admin@kiki.com.ar no encontrado');
      return;
    }
    
    console.log('✅ [FIX ADMIN] Usuario encontrado:', user.email);
    console.log('   - Hash actual:', user.password.substring(0, 20) + '...');
    
    // Establecer la contraseña correcta: admin123
    console.log('🔄 [FIX ADMIN] Estableciendo contraseña: admin123');
    user.password = 'admin123';
    await user.save();
    
    console.log('✅ [FIX ADMIN] Contraseña actualizada');
    console.log('   - Nuevo hash:', user.password.substring(0, 20) + '...');
    
    // Verificar que funciona
    console.log('🧪 [FIX ADMIN] Probando login...');
    const isPasswordValid = await user.comparePassword('admin123');
    
    if (isPasswordValid) {
      console.log('✅ [FIX ADMIN] Login exitoso con admin123');
    } else {
      console.log('❌ [FIX ADMIN] Error en el login');
    }
    
    // Probar también con la contraseña anterior
    const isOldPasswordValid = await user.comparePassword('password123');
    console.log('🔍 [FIX ADMIN] ¿Funciona password123?', isOldPasswordValid);
    
    console.log('\n🎉 [FIX ADMIN] Proceso completado');
    console.log('📧 Email: admin@kiki.com.ar');
    console.log('🔑 Contraseña: admin123');
    
  } catch (error) {
    console.error('❌ [FIX ADMIN] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixAdminPassword();
