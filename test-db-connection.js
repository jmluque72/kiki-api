const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');
const bcrypt = require('bcryptjs');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testDatabaseConnection() {
  try {
    console.log('🔍 [TEST DB] Verificando conexión a la base de datos...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [TEST DB] Conectado a MongoDB');
    
    // Buscar usuario coordinador
    console.log('👤 [TEST DB] Buscando usuario coordinador@test.com...');
    const user = await User.findOne({ email: 'coordinador@test.com' }).populate('role');
    
    if (!user) {
      console.log('❌ [TEST DB] Usuario coordinador@test.com no encontrado');
      
      // Listar todos los usuarios
      const allUsers = await User.find({}).populate('role');
      console.log('📋 [TEST DB] Todos los usuarios en la base de datos:');
      allUsers.forEach(u => {
        console.log(`   - ${u.email} (${u.role?.nombre || 'sin rol'}) - Status: ${u.status}`);
      });
      
      return;
    }
    
    console.log('✅ [TEST DB] Usuario encontrado:');
    console.log('   - ID:', user._id);
    console.log('   - Email:', user.email);
    console.log('   - Nombre:', user.name);
    console.log('   - Rol:', user.role?.nombre);
    console.log('   - Status:', user.status);
    
    // Verificar contraseña
    console.log('🔑 [TEST DB] Verificando contraseña...');
    const isPasswordValid = await user.comparePassword('password123');
    console.log('✅ [TEST DB] Contraseña válida:', isPasswordValid);
    
    // Verificar hash de la contraseña
    console.log('🔐 [TEST DB] Hash de la contraseña:', user.password.substring(0, 20) + '...');
    
  } catch (error) {
    console.error('❌ [TEST DB] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testDatabaseConnection(); 