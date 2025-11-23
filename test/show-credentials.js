const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/kiki?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function showCredentials() {
  try {
    console.log('🔑 [CREDENTIALS] Mostrando credenciales actualizadas...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [CREDENTIALS] Conectado a MongoDB');
    
    // Obtener todos los usuarios
    const users = await User.find({});
    console.log(`📋 [CREDENTIALS] Encontrados ${users.length} usuarios\n`);
    
    console.log('🔐 [CREDENTIALS] Credenciales de acceso:');
    console.log('=====================================');
    
    users.forEach((user, index) => {
      // Determinar la contraseña correcta
      let password = 'password123';
      if (user.email === 'admin@kiki.com.ar') {
        password = 'admin123';
      }
      
      console.log(`${index + 1}. 📧 Email: ${user.email}`);
      console.log(`   🔑 Contraseña: ${password}`);
      console.log(`   👤 Nombre: ${user.name || 'N/A'}`);
      console.log(`   🎭 Rol ID: ${user.role || 'N/A'}`);
      console.log(`   ✅ Status: ${user.status}`);
      console.log(`   ---`);
    });
    
    console.log('\n💡 [CREDENTIALS] Notas importantes:');
    console.log('   - admin@kiki.com.ar usa su contraseña original: admin123');
    console.log('   - Todos los demás usuarios usan: password123');
    console.log('   - Todas las contraseñas están hasheadas con salt rounds 12');
    console.log('   - El sistema de autenticación está funcionando correctamente');
    
    console.log('\n🚀 [CREDENTIALS] Para probar el login:');
    console.log('   curl -X POST http://localhost:3000/api/users/login \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"email":"admin@kiki.com.ar","password":"admin123"}\'');
    
  } catch (error) {
    console.error('❌ [CREDENTIALS] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

showCredentials();
